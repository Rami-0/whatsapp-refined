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
