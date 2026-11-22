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

test("resolves WhatsApp's own filters by their ids, whatever language they are in", () => {
  const { folderKindById, isFolderAction } = require("../src/utils.js");

  assert.equal(folderKindById("all-filter"), "all");
  assert.equal(folderKindById("label_item_1"), "unread");
  assert.equal(folderKindById("label_item_2"), "favourites");
  assert.equal(folderKindById("label_item_3"), "groups");

  /* Lists the user made are label_item_4 and up, and get their own initial. */
  assert.equal(folderKindById("label_item_4"), "custom");
  assert.equal(folderKindById("label_item_17"), "custom");

  /* An id WhatsApp has not used before reads as a user list: the folder shows
     its initial rather than borrowing some other filter's icon. */
  assert.equal(folderKindById("something-new"), "custom");
  assert.equal(folderKindById(""), "custom");
  assert.equal(folderKindById(undefined), "custom");

  assert.equal(isFolderAction("additional-filters"), true);
  assert.equal(isFolderAction("label_item_1"), false);
});

test("a list the user made between two built-in filters does not displace them", () => {
  const { folderKindById, isFolderAction } = require("../src/utils.js");

  /* Verbatim from a real strip: WhatsApp interleaves the lists a user made
     with its own filters, so counting tabs would label "Rmli" unread, "Unread"
     favourites, and so on down the rail. */
  const strip = ["all-filter", "label_item_4", "label_item_1", "label_item_2", "label_item_3", "label_item_6", "additional-filters"];

  assert.deepEqual(
    strip.map((id) => (isFolderAction(id) ? "lists" : folderKindById(id))),
    ["all", "custom", "unread", "favourites", "groups", "custom", "lists"]
  );
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
  globalThis.fetch = async (url) => ({ ok: true, json: async () => JSON.parse(fs.readFileSync(url, "utf8")) });
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

test("the content script falls back to the service worker when the fetch is blocked", async (t) => {
  const fs = require("node:fs");
  const path = require("node:path");
  const { i18n, loadLocaleOverride } = require("../src/utils.js");

  /* Chrome will not serve the extension's _locales folder to a web page, so on
     web.whatsapp.com the direct fetch fails and the worker answers instead. */
  const asked = [];
  globalThis.chrome = {
    runtime: {
      getURL: (resource) => path.join(__dirname, "..", resource),
      sendMessage: async (message) => {
        asked.push(message);
        return { messages: JSON.parse(fs.readFileSync(path.join(__dirname, "..", "_locales", message.language, "messages.json"), "utf8")) };
      }
    }
  };
  const realFetch = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error("blocked"); };
  t.after(() => {
    delete globalThis.chrome;
    globalThis.fetch = realFetch;
    return loadLocaleOverride("auto");
  });

  assert.equal(await loadLocaleOverride("ar"), true);
  assert.deepEqual(asked, [{ type: "wr-locale", language: "ar" }]);
  assert.equal(i18n("togglePrivacyAria", "Toggle privacy mode"), "تبديل وضع الخصوصية");
});

test("localeScript picks a font bucket per writing system", () => {
  const { localeScript, uiLanguage } = require("../src/utils.js");

  assert.equal(localeScript("ar"), "arabic");
  assert.equal(localeScript("hi"), "devanagari");
  assert.equal(localeScript("zh_TW"), "han");
  assert.equal(localeScript("pt_BR"), "latin");
  assert.equal(localeScript("auto"), "latin");

  assert.equal(uiLanguage("ar"), "ar");
  assert.equal(uiLanguage("auto"), "en");
});

test("every update card asks for a review until the user has left one", () => {
  const { whatsNewPlan } = require("../src/utils.js");
  const pending = { version: "1.3.1", previousVersion: "1.3.0" };

  assert.deepEqual(whatsNewPlan(undefined, undefined), { showNotes: false, askReview: false });
  assert.deepEqual(whatsNewPlan({}, undefined), { showNotes: false, askReview: false });
  assert.deepEqual(whatsNewPlan(pending, undefined), { showNotes: true, askReview: true });
  assert.deepEqual(whatsNewPlan(pending, "reviewed"), { showNotes: true, askReview: false });
  /* "Not now" skips one update's ask, not every later one. */
  assert.deepEqual(whatsNewPlan(pending, "declined"), { showNotes: true, askReview: true });
});

test("release notes cover every version the user skipped, newest first", () => {
  const { unseenReleases, compareVersions, releaseNotesKey } = require("../src/utils.js");
  const known = ["1.6.0", "1.5.2", "1.5.0", "1.4.0", "1.3.1"];

  assert.equal(compareVersions("1.10.0", "1.9.9"), 1);
  assert.equal(compareVersions("1.3.1", "1.3.1"), 0);
  assert.equal(releaseNotesKey("1.3.1"), "whatsNew_1_3_1");

  assert.deepEqual(unseenReleases("1.3.0", "1.3.1", known), ["1.3.1"]);
  assert.deepEqual(unseenReleases("1.3.1", "1.5.2", known), ["1.5.2", "1.5.0", "1.4.0"]);
  /* Capped at three so a long-dormant install does not get a wall of text. */
  assert.deepEqual(unseenReleases("1.0.0", "1.6.0", known), ["1.6.0", "1.5.2", "1.5.0"]);
  /* A patch with no notes of its own shows nothing rather than stale notes. */
  assert.deepEqual(unseenReleases("1.6.0", "1.6.1", known), []);
});

test("every listed release has notes in English", () => {
  const { RELEASE_NOTES, releaseNotesKey } = require("../src/utils.js");
  const en = require("../_locales/en/messages.json");
  for (const version of RELEASE_NOTES) assert.ok(en[releaseNotesKey(version)]?.message, `missing ${releaseNotesKey(version)}`);
});

test("Refined's shortcuts leave WhatsApp's own Ctrl+Alt keys alone on Windows and Linux", () => {
  const { shortcutAction } = require("../src/utils.js");
  const key = (code, mods = {}) => ({ code, metaKey: false, ctrlKey: false, altKey: false, shiftKey: false, ...mods });
  const ctrlAlt = { ctrlKey: true, altKey: true };
  const altShift = { altKey: true, shiftKey: true };
  const cmdAlt = { metaKey: true, altKey: true };

  for (const platform of ["windows", "linux", "other"]) {
    /* WhatsApp: Ctrl+Alt+P Profile, Ctrl+Alt+, Settings, Ctrl+Alt+N New chat. */
    assert.equal(shortcutAction(key("KeyP", ctrlAlt), platform), "");
    assert.equal(shortcutAction(key("Comma", ctrlAlt), platform), "");
    assert.equal(shortcutAction(key("KeyN", ctrlAlt), platform), "");
    assert.equal(shortcutAction(key("KeyK", ctrlAlt), platform), "search");
    assert.equal(shortcutAction(key("ArrowLeft", ctrlAlt), platform), "previousFolder");
    assert.equal(shortcutAction(key("ArrowRight", ctrlAlt), platform), "nextFolder");
    assert.equal(shortcutAction(key("KeyP", altShift), platform), "privacy");
    assert.equal(shortcutAction(key("Comma", altShift), platform), "settings");
    /* WhatsApp's Ctrl+Alt+Shift+P pins a chat. */
    assert.equal(shortcutAction(key("KeyP", { ...ctrlAlt, shiftKey: true }), platform), "");
  }

  assert.equal(shortcutAction(key("KeyP", cmdAlt), "mac"), "privacy");
  assert.equal(shortcutAction(key("KeyN", cmdAlt), "mac"), "newChat");
  assert.equal(shortcutAction(key("Comma", cmdAlt), "mac"), "settings");
  assert.equal(shortcutAction(key("KeyK", cmdAlt), "mac"), "search");
  /* WhatsApp's Mac shortcuts are Cmd+Ctrl; its Cmd+K is Extended Search. */
  assert.equal(shortcutAction(key("KeyP", { metaKey: true, ctrlKey: true }), "mac"), "");
  assert.equal(shortcutAction(key("KeyK", { metaKey: true }), "mac"), "");
  assert.equal(shortcutAction(key("KeyP", altShift), "mac"), "privacy");
});

test("pins are keyed by chat name, ordered by the user, and never duplicated", () => {
  const { pinChat, unpinChat, movePin, refreshPins } = require("../src/utils.js");
  let pins = [];
  pins = pinChat(pins, "Mom", 1);
  pins = pinChat(pins, "Work", 2);
  pins = pinChat(pins, "Gym", 3);
  assert.deepEqual(pins.map((p) => p.name), ["Mom", "Work", "Gym"]);
  assert.equal(pinChat(pins, "Work", 4), pins, "pinning twice is a no-op");
  assert.equal(pinChat(pins, "", 4), pins);

  assert.deepEqual(movePin(pins, "Gym", 0).map((p) => p.name), ["Gym", "Mom", "Work"]);
  assert.deepEqual(movePin(pins, "Mom", 99).map((p) => p.name), ["Work", "Gym", "Mom"]);
  assert.deepEqual(movePin(pins, "Nobody", 0).map((p) => p.name), ["Mom", "Work", "Gym"]);
  assert.deepEqual(pins.map((p) => p.name), ["Mom", "Work", "Gym"], "inputs are not mutated");

  assert.deepEqual(unpinChat(pins, "Work").map((p) => p.name), ["Mom", "Gym"]);

  const rows = [{ name: "Work", unread: 4, muted: true, avatar: "https://x/a.jpg" }];
  const refreshed = refreshPins(pins, rows, 9);
  assert.equal(refreshed[1].unread, 4);
  assert.equal(refreshed[1].muted, true);
  assert.equal(refreshed[1].seenAt, 9);
  assert.equal("avatar" in refreshed[1], false, "profile photo URLs are never stored");
  assert.equal(refreshPins(refreshed, rows, 10), refreshed, "unchanged rows return the same array");
});

test("reminder presets and the snoozed list", () => {
  const { reminderPresets, addReminder, removeReminder, dueReminders, shortDuration } = require("../src/utils.js");
  const now = new Date(2026, 10, 22, 23, 30);
  const [hour, three, tomorrow] = reminderPresets(now);
  assert.equal(hour.at - now.getTime(), 3600000);
  assert.equal(three.at - now.getTime(), 3 * 3600000);
  const t = new Date(tomorrow.at);
  assert.deepEqual([t.getDate(), t.getHours(), t.getMinutes()], [23, 9, 0], "tomorrow is 09:00 the next day, across midnight");

  let list = addReminder([], "Work", 5000, 1);
  list = addReminder(list, "Mom", 2000, 2);
  assert.deepEqual(list.map((r) => r.name), ["Mom", "Work"], "sorted by due time");
  list = addReminder(list, "Work", 1000, 3);
  assert.deepEqual(list.map((r) => [r.name, r.dueAt]), [["Work", 1000], ["Mom", 2000]], "one reminder per chat");
  assert.deepEqual(dueReminders(list, 1500).map((r) => r.name), ["Work"]);
  assert.deepEqual(removeReminder(list, "Work").map((r) => r.name), ["Mom"]);

  assert.equal(shortDuration(45 * 60000), "45m");
  assert.equal(shortDuration(12 * 3600000), "12h");
  assert.equal(shortDuration(72 * 3600000), "3d");
});

test("WhatsApp Business: colour-dot labels stay labels and the built-ins are found past them", () => {
  const { classifyFolders } = require("../src/utils.js");
  /* Verbatim order from a live WhatsApp Business strip (Nov 2026): business
     labels 1-10 carry a colour dot, Unread/Favourites/Groups are 11-13, and
     the overflow arrow sits in the middle. */
  const strip = [
    { id: "all-filter" }, { id: "label_item_1", colored: true }, { id: "label_item_11" },
    { id: "label_item_2", colored: true }, { id: "label_item_12" }, { id: "additional-filters" },
    { id: "label_item_13" }, { id: "label_item_3", colored: true }, { id: "label_item_4", colored: true },
    { id: "label_item_5", colored: true }, { id: "label_item_9", colored: true }
  ];
  assert.deepEqual(classifyFolders(strip), ["all", "label", "unread", "label", "favourites", "lists", "groups", "label", "label", "label", "label"]);
});

test("personal WhatsApp: built-ins are 1-3 and user lists stay custom, wherever they sit", () => {
  const { classifyFolders } = require("../src/utils.js");
  const strip = ["all-filter", "label_item_4", "label_item_1", "label_item_2", "label_item_3", "label_item_6", "additional-filters"].map((id) => ({ id }));
  assert.deepEqual(classifyFolders(strip), ["all", "custom", "unread", "favourites", "groups", "custom", "lists"]);
  assert.deepEqual(classifyFolders([]), []);
});

test("palette ranking prefers prefixes, word starts and runs, and ignores case and accents", () => {
  const { fuzzyScore } = require("../src/utils.js");
  assert.equal(fuzzyScore("xyz", "Work"), 0);
  assert.ok(fuzzyScore("wo", "Work") > fuzzyScore("wo", "Hello world"));
  assert.ok(fuzzyScore("wor", "Hello world") > fuzzyScore("wor", "aw orchid r"));
  assert.ok(fuzzyScore("jose", "José Silva") > 0);
  assert.ok(fuzzyScore("rmli", "rmli orders طلبات رملي") > fuzzyScore("rmli", "random mail list"));
  assert.ok(fuzzyScore("5406", "+966 50 681 5406") > 0);
  assert.equal(fuzzyScore("", "anything"), 1);
});

test("mentions are learned from rows on screen and dropped once read", () => {
  const { mergeMentions } = require("../src/utils.js");
  let list = mergeMentions([], [{ name: "Team", mention: true, unread: 3 }, { name: "Mom", mention: false, unread: 1 }], 10);
  assert.deepEqual(list.map((m) => [m.name, m.unread]), [["Team", 3]]);
  assert.equal(mergeMentions(list, [{ name: "Team", mention: true, unread: 3 }], 11), list, "unchanged rows keep the same array");
  assert.equal(mergeMentions(list, [{ name: "Other", mention: false, unread: 0 }], 12), list, "chats off screen keep their state");
  assert.deepEqual(mergeMentions(list, [{ name: "Team", mention: false, unread: 0 }], 13), [], "a read chat leaves");
});

test("two chats with the same name: a mention on either one counts once and stays", () => {
  const { mergeMentions } = require("../src/utils.js");
  const rows = [{ name: "Family", mention: false, unread: 0 }, { name: "Family", mention: true, unread: 2 }];
  const list = mergeMentions([], rows, 1);
  assert.deepEqual(list.map((m) => [m.name, m.unread]), [["Family", 2]]);
  assert.equal(mergeMentions(list, rows, 2), list, "a redraw of the same rows writes nothing");
});

test("translated strings keep a chat name with $ signs intact", () => {
  const { applyPlaceholders } = require("../src/utils.js");
  const entry = { message: "$NAME$, pinned", placeholders: { name: { content: "$1" } } };
  assert.equal(applyPlaceholders(entry, ["Cash $$ & $' $&"]), "Cash $$ & $' $&, pinned");
  const two = { message: "$NAME$ at $TIME$", placeholders: { name: { content: "$1" }, time: { content: "$2" } } };
  assert.equal(applyPlaceholders(two, ["Team", "18:30"]), "Team at 18:30");
});
