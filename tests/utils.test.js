const test = require("node:test");
const assert = require("node:assert/strict");
const { normalizeLabel, folderKind, folderInitial, uniqueFolders, parseFolderTab, desktopPlatform } = require("../src/utils.js");
const { DEFAULTS, normalizeSettings } = require("../src/settings.js");

test("normalizes whitespace and trailing unread counts", () => {
  assert.equal(normalizeLabel("  Unread   23 "), "unread");
  assert.equal(normalizeLabel("Work 1.2K"), "work");
});

test("recognizes built-in English and Arabic folder labels", () => {
  assert.equal(folderKind("Favourites"), "favourites");
  assert.equal(folderKind("المجموعات 13"), "groups");
  assert.equal(folderKind("Client work"), "custom");
});

test("creates a safe visible initial for custom folders", () => {
  assert.equal(folderInitial("  personal"), "P");
  assert.equal(folderInitial("⭐ Work"), "W");
});

test("keeps the first occurrence of each folder", () => {
  const result = uniqueFolders([
    { label: "All" },
    { label: "All 12" },
    { label: "Work" }
  ]);
  assert.deepEqual(result.map((item) => item.label), ["All", "Work"]);
});

test("reads WhatsApp folder labels and counts from separate nested spans", () => {
  assert.deepEqual(parseFolderTab(["Unread", "22"], "Unread22"), { label: "Unread", count: "22", action: false });
  assert.deepEqual(parseFolderTab([], "ic-arrow-drop-down"), { label: "", count: "", action: true });
});

test("migrates the old rail position and clamps local preferences", () => {
  const result = normalizeSettings({ railPosition: "right", sidebarWidth: 900, blurStrength: 1, blurMedia: false });
  assert.equal(result.folderLayout, "sidebar");
  assert.equal(result.sidebarWidth, 620);
  assert.equal(result.blurStrength, 3);
  assert.equal(result.blurImages, false);
  assert.equal(result.blurVideos, false);
});

test("migrates both old rail layouts into the integrated sidebar", () => {
  assert.equal(normalizeSettings({ folderLayout: "rail-left" }).folderLayout, "sidebar");
  assert.equal(normalizeSettings({ folderLayout: "rail-right" }).folderLayout, "sidebar");
});

test("detects desktop platforms for shortcut instructions", () => {
  assert.equal(desktopPlatform({ platform: "MacIntel" }), "mac");
  assert.equal(desktopPlatform({ userAgentData: { platform: "Windows" } }), "windows");
  assert.equal(desktopPlatform({ platform: "Linux x86_64" }), "linux");
});

test("falls back for unsupported choices and drops retired preferences", () => {
  const result = normalizeSettings({ folderLayout: "floating", rowStyle: "cards" });
  assert.equal(result.folderLayout, DEFAULTS.folderLayout);
  assert.equal("rowStyle" in result, false);
});

test("normalizes the language setting against the supported list", () => {
  assert.equal(normalizeSettings({}).language, "auto");
  assert.equal(normalizeSettings({ language: "ar" }).language, "ar");
  assert.equal(normalizeSettings({ language: "klingon" }).language, "auto");
});

test("i18n falls back to English without chrome, and a loaded locale wins", async (t) => {
  const fs = require("node:fs");
  const path = require("node:path");
  const { i18n, loadLocaleOverride, localeDirection } = require("../src/utils.js");

  assert.equal(i18n("privacyLabel", "Privacy"), "Privacy");

  globalThis.chrome = { runtime: { getURL: (resource) => path.join(__dirname, "..", resource) } };
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url) => ({ json: async () => JSON.parse(fs.readFileSync(url, "utf8")) });
  t.after(() => {
    delete globalThis.chrome;
    globalThis.fetch = realFetch;
    return loadLocaleOverride("auto");
  });

  assert.equal(await loadLocaleOverride("ar"), true);
  assert.equal(i18n("privacyLabel", "Privacy"), "الخصوصية");
  assert.equal(i18n("folderUnread", "fallback", ["Groups", "3"]).includes("Groups"), true);
  assert.equal(i18n("missingKey", "fallback"), "fallback");

  assert.equal(await loadLocaleOverride("auto"), false);
  assert.equal(i18n("privacyLabel", "Privacy"), "Privacy");

  assert.equal(localeDirection("ar"), "rtl");
  assert.equal(localeDirection("de"), "ltr");
});
