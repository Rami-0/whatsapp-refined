(function initUtils(global) {
  "use strict";

  /* WhatsApp gives every filter tab a stable id, and none of them change with
     the UI language: `all-filter`, its three system labels as label_item_1..3,
     the lists the user made as label_item_4 and up, and `additional-filters`
     for the overflow arrow. Reading the id is what makes the rail work on a
     Portuguese or Chinese WhatsApp, where the labels are translated.

     Position does not work. WhatsApp interleaves the lists a user made with
     its own filters — a real strip runs All, <user list>, Unread, Favourites,
     Groups, <user list>, arrow — so counting tabs assigns the wrong icon to
     almost every one of them. An unrecognised id is left `custom`, which shows
     the folder's initial: worse than an icon, never a wrong icon. */
  const NATIVE_FOLDER_IDS = Object.freeze({
    "all-filter": "all",
    "label_item_1": "unread",
    "label_item_2": "favourites",
    "label_item_3": "groups",
    "additional-filters": "lists"
  });

  function folderKindById(id) {
    return NATIVE_FOLDER_IDS[String(id || "")] || "custom";
  }

  function isFolderAction(id) {
    return String(id || "") === "additional-filters";
  }

  /* Resolves every filter in the strip at once, because WhatsApp Business
     numbers them differently from personal WhatsApp. Personal: label_item_1-3
     are Unread, Favourites and Groups, user lists are 4 and up. Business:
     label_item_1-10 are the account's business labels (each drawn with a
     coloured dot), and Unread, Favourites and Groups move to 11-13. In both,
     the built-ins are the three lowest-numbered filters WITHOUT a colour dot,
     in that order. `items` = [{ id, colored }] in strip order; returns the
     kind for each: all | unread | favourites | groups | label | custom | lists. */
  const BUILT_IN_ORDER = Object.freeze(["unread", "favourites", "groups"]);

  function labelNumber(id) {
    const match = /^label_item_(\d+)$/.exec(String(id || ""));
    return match ? Number(match[1]) : null;
  }

  function classifyFolders(items) {
    const list = Array.isArray(items) ? items : [];
    const builtIns = list
      .filter((item) => !item.colored && labelNumber(item.id) !== null)
      .map((item) => labelNumber(item.id))
      .sort((a, b) => a - b)
      .slice(0, BUILT_IN_ORDER.length);
    return list.map((item) => {
      if (item.id === "all-filter") return "all";
      if (isFolderAction(item.id)) return "lists";
      if (item.colored) return "label";
      const number = labelNumber(item.id);
      const builtIn = number === null ? -1 : builtIns.indexOf(number);
      return builtIn >= 0 ? BUILT_IN_ORDER[builtIn] : "custom";
    });
  }

  /* WhatsApp moves a filter picked from its "More lists" menu to the front of
     the strip, so the strip's order changes with use. The rail keeps one
     order instead: All, the built-ins, the user's lists, the business labels
     (each in the order WhatsApp created them), and the Lists menu last. */
  const RAIL_RANK = Object.freeze({ all: 0, unread: 1, favourites: 2, groups: 3, custom: 4, label: 5, lists: 6 });

  function railOrder(folders) {
    const rank = (folder) => RAIL_RANK[folder.kind] ?? RAIL_RANK.custom;
    const number = (folder) => labelNumber(folder.id) ?? Number.MAX_SAFE_INTEGER;
    return (Array.isArray(folders) ? folders : [])
      .map((folder, index) => ({ folder, index }))
      .sort((a, b) => rank(a.folder) - rank(b.folder) || number(a.folder) - number(b.folder) || a.index - b.index)
      .map(({ folder }) => folder);
  }

  /* Kept for the label-matching path and its tests; the rail resolves kinds by
     WhatsApp's own ids now, so nothing here has to learn a new language. */
  const FOLDER_ALIASES = Object.freeze({
    all: ["all", "الكل"],
    unread: ["unread", "غير مقروءة", "غير المقروءة"],
    favourites: ["favourites", "favorites", "المفضلة"],
    groups: ["groups", "group", "المجموعات"],
    archived: ["archived", "archive", "المؤرشفة"]
  });

  function normalizeLabel(value) {
    return String(value || "")
      .replace(/\s+/g, " ")
      .replace(/^\s+|\s+$/g, "")
      .replace(/\s+\d[\d.,KkMm]*$/, "")
      .toLocaleLowerCase();
  }

  function folderKind(label) {
    const normalized = normalizeLabel(label);
    for (const [kind, aliases] of Object.entries(FOLDER_ALIASES)) {
      if (aliases.some((alias) => normalized === alias || normalized.startsWith(`${alias} `))) {
        return kind;
      }
    }
    return "custom";
  }

  function folderInitial(label) {
    const value = String(label || "").trim();
    const match = value.match(/[\p{L}\p{N}]/u);
    return match ? match[0].toLocaleUpperCase() : "•";
  }

  function uniqueFolders(items) {
    const seen = new Set();
    return items.filter((item) => {
      const key = normalizeLabel(item.label);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  function parseFolderTab(leafTexts = [], fallbackText = "") {
    const visible = leafTexts
      .map((value) => String(value || "").replace(/\s+/g, " ").trim())
      .filter(Boolean);
    const isCount = (value) => /^\d[\d.,KkMm]*$/.test(value);
    const count = [...visible].reverse().find(isCount) || "";
    const label = visible.find((value) => !isCount(value) && !/^ic-/i.test(value)) || "";
    const fallback = String(fallbackText || "").replace(/\s+/g, " ").trim();
    const action = !label && (/^ic-arrow-/i.test(fallback) || !fallback);

    if (label || action) return { label, count, action };

    const fallbackMatch = fallback.match(/^(.*?)(?:\s+)(\d[\d.,KkMm]*)$/);
    return {
      label: (fallbackMatch ? fallbackMatch[1] : fallback).trim(),
      count: fallbackMatch ? fallbackMatch[2] : "",
      action: false
    };
  }

  function desktopPlatform(nav = {}) {
    const value = String(nav.userAgentData?.platform || nav.platform || nav.userAgent || "").toLocaleLowerCase();
    if (/mac|iphone|ipad|ipod/.test(value)) return "mac";
    if (/win/.test(value)) return "windows";
    if (/linux|x11|cros/.test(value)) return "linux";
    return "other";
  }

  /* Refined's shortcuts, per platform. WhatsApp's own Windows and Linux
     shortcuts use Ctrl+Alt (Ctrl+Alt+P is its Profile, Ctrl+Alt+, its
     Settings, Ctrl+Alt+N its New chat), so there Refined only claims the
     Ctrl+Alt keys WhatsApp leaves free and moves the rest to Alt+Shift.
     On macOS WhatsApp uses Cmd+Ctrl, so Cmd+Alt is free for all of them.
     Returns the action name, or "" to leave the key to WhatsApp. */
  const SHORTCUT_KEYS = Object.freeze({
    mac: { chord: "cmd+alt", keys: { KeyP: "privacy", KeyK: "search", KeyN: "newChat", ArrowLeft: "previousFolder", ArrowRight: "nextFolder", Comma: "settings" } },
    other: {
      chord: "ctrl+alt", keys: { KeyK: "search", ArrowLeft: "previousFolder", ArrowRight: "nextFolder" },
      altShift: { KeyP: "privacy", Comma: "settings" }
    }
  });

  function shortcutAction(event, platform) {
    const { metaKey, ctrlKey, altKey, shiftKey, code } = event || {};
    /* Alt+Shift+P toggled privacy before the per-platform chords existed, so
       it keeps working everywhere. */
    if (altKey && shiftKey && !metaKey && !ctrlKey && code === "KeyP") return "privacy";
    if (platform === "mac") {
      if (metaKey && altKey && !ctrlKey && !shiftKey) return SHORTCUT_KEYS.mac.keys[code] || "";
      return "";
    }
    if (ctrlKey && altKey && !metaKey && !shiftKey) return SHORTCUT_KEYS.other.keys[code] || "";
    if (altKey && shiftKey && !ctrlKey && !metaKey) return SHORTCUT_KEYS.other.altShift[code] || "";
    return "";
  }

  const RTL_LANGUAGES = Object.freeze(["ar"]);
  const LOCALE_SCRIPTS = Object.freeze({
    ar: "arabic",
    hi: "devanagari",
    ja: "japanese",
    ko: "korean",
    zh: "han"
  });
  let localeOverride = null;

  function baseLanguage(language) {
    return String(language || "").replace("-", "_").split("_")[0].toLowerCase();
  }

  function applyPlaceholders(entry, substitutions) {
    let message = entry.message;
    const subs = Array.isArray(substitutions) ? substitutions : substitutions == null ? [] : [substitutions];
    for (const [name, definition] of Object.entries(entry.placeholders || {})) {
      const index = Number(String(definition?.content || "").replace("$", "")) - 1;
      /* A function replacer: names and queries can contain "$&" or "$$". */
      message = message.replace(new RegExp(`\\$${name}\\$`, "gi"), () => String(subs[index] ?? ""));
    }
    return message;
  }

  function i18n(key, fallback, substitutions) {
    /* A manually chosen language (the `language` setting) overrides the
       browser locale; chrome.i18n is missing on the demo page and in Node
       tests, where the English fallback keeps the UI usable. */
    const entry = localeOverride?.[key];
    if (entry?.message) return applyPlaceholders(entry, substitutions);
    try {
      const message = global.chrome?.i18n?.getMessage?.(key, substitutions);
      if (message) return message;
    } catch (_error) {}
    return fallback;
  }

  async function fetchLocaleMessages(language) {
    /* Extension pages read their own _locales folder directly. Content scripts
       cannot: Chrome will not serve underscore-prefixed paths to a web page,
       so they ask the service worker, which reads it same-origin, instead. */
    try {
      const url = global.chrome?.runtime?.getURL?.(`_locales/${language}/messages.json`);
      if (url) {
        const response = await fetch(url);
        if (response.ok) return await response.json();
      }
    } catch (_error) {}
    try {
      const response = await global.chrome?.runtime?.sendMessage?.({ type: "wr-locale", language });
      if (response?.messages) return response.messages;
    } catch (_error) {}
    return null;
  }

  async function loadLocaleOverride(language) {
    if (!language || language === "auto") {
      localeOverride = null;
      return false;
    }
    localeOverride = await fetchLocaleMessages(language);
    return Boolean(localeOverride);
  }

  function uiLanguage(language) {
    if (language && language !== "auto") return language;
    try {
      return global.chrome?.i18n?.getUILanguage?.() || "en";
    } catch (_error) {
      return "en";
    }
  }

  function localeDirection(language) {
    return RTL_LANGUAGES.includes(baseLanguage(language)) ? "rtl" : "ltr";
  }

  /* Latin-first UI fonts leave Arabic and Devanagari to whatever the platform
     substitutes, which renders them noticeably smaller and thinner than the
     surrounding text. Pages tag themselves with the script so the stylesheet
     can pick a face made for it and nudge the size back up. */
  function localeScript(language) {
    return LOCALE_SCRIPTS[baseLanguage(language)] || "latin";
  }

  /* Every version that ships release notes, newest first. Each one has a
     `whatsNew_<major>_<minor>_<patch>` message in every locale (one note per
     line), and `npm run release:check` refuses a tag missing from this list. */
  const RELEASE_NOTES = Object.freeze(["1.4.0", "1.3.2", "1.3.1"]);
  const MAX_NOTES_SHOWN = 3;

  function compareVersions(a, b) {
    const left = String(a || "0").split(".").map(Number);
    const right = String(b || "0").split(".").map(Number);
    for (let i = 0; i < Math.max(left.length, right.length); i++) {
      const diff = (left[i] || 0) - (right[i] || 0);
      if (diff) return Math.sign(diff);
    }
    return 0;
  }

  function releaseNotesKey(version) {
    return `whatsNew_${String(version).replace(/\./g, "_")}`;
  }

  /* The versions a user has not seen notes for yet: newer than the one they
     updated from, up to the one installed, newest first. Someone who skipped a
     few releases gets each of them, capped so the card stays short. */
  function unseenReleases(previousVersion, currentVersion, known = RELEASE_NOTES) {
    return known
      .filter((version) => compareVersions(version, previousVersion) > 0 && compareVersions(version, currentVersion) <= 0)
      .sort((a, b) => compareVersions(b, a))
      .slice(0, MAX_NOTES_SHOWN);
  }

  /* Decides what the post-update card shows. `pending` is what background.js
     stored on update ({ version, previousVersion }) or undefined; `reviewState`
     is "reviewed" once the user clicked the review link, "declined" when they
     last closed a card that asked, and undefined before either.
     Returns { showNotes, askReview }: showNotes renders the card at all,
     askReview adds the "leave a review" ask to it. */
  function whatsNewPlan(pending, reviewState) {
    if (!pending?.version) return { showNotes: false, askReview: false };
    /* Every update card asks, gently, until the user has opened the review
       page. "Not now" or closing only skips this update's ask. */
    return { showNotes: true, askReview: reviewState !== "reviewed" };
  }

  /* Refined's own pins. WhatsApp's rows carry no chat id, so a chat is keyed
     by its name. Every helper returns a new array and leaves its input alone,
     so the caller can compare before writing to storage. */
  function pinChat(pins, name, now = Date.now()) {
    const list = Array.isArray(pins) ? pins : [];
    if (!name || list.some((pin) => pin.name === name)) return list;
    return [...list, { name, addedAt: now, unread: 0, muted: false }];
  }

  function unpinChat(pins, name) {
    const list = Array.isArray(pins) ? pins : [];
    return list.filter((pin) => pin.name !== name);
  }

  function movePin(pins, name, toIndex) {
    const list = Array.isArray(pins) ? [...pins] : [];
    const from = list.findIndex((pin) => pin.name === name);
    if (from < 0) return list;
    const [pin] = list.splice(from, 1);
    const target = Math.max(0, Math.min(list.length, Number(toIndex) || 0));
    list.splice(target, 0, pin);
    return list;
  }

  /* Copies what the chat list currently shows (unread, muted) onto the pins
     it names. Profile photos are not stored: the shelf keeps them in memory
     only. Returns the same array when nothing changed. */
  function refreshPins(pins, rows, now = Date.now()) {
    const list = Array.isArray(pins) ? pins : [];
    const byName = new Map((rows || []).map((row) => [row.name, row]));
    let changed = false;
    const next = list.map((pin) => {
      const row = byName.get(pin.name);
      if (!row) return pin;
      if (pin.unread === row.unread && pin.muted === row.muted) return pin;
      changed = true;
      return { name: pin.name, addedAt: pin.addedAt, unread: row.unread, muted: row.muted, seenAt: now };
    });
    return changed ? next : list;
  }

  /* Snooze presets, t3code style: in 1 hour, in 3 hours, tomorrow at 09:00
     local time. `now` is a Date so tests can pin the clock. */
  function reminderPresets(now = new Date()) {
    const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 9, 0, 0, 0);
    return [
      { key: "1h", at: now.getTime() + 60 * 60 * 1000 },
      { key: "3h", at: now.getTime() + 3 * 60 * 60 * 1000 },
      { key: "tomorrow", at: tomorrow.getTime() }
    ];
  }

  /* One reminder per chat: setting a new one replaces the old. */
  function addReminder(reminders, name, dueAt, now = Date.now()) {
    const list = (Array.isArray(reminders) ? reminders : []).filter((item) => item.name !== name);
    if (!name || !Number.isFinite(dueAt)) return list;
    return [...list, { id: `wr-reminder-${now}-${Math.abs(hashString(name))}`, name, dueAt, createdAt: now, fired: false }]
      .sort((a, b) => a.dueAt - b.dueAt);
  }

  function removeReminder(reminders, name) {
    return (Array.isArray(reminders) ? reminders : []).filter((item) => item.name !== name);
  }

  function dueReminders(reminders, now = Date.now()) {
    return (Array.isArray(reminders) ? reminders : []).filter((item) => item.dueAt <= now);
  }

  function hashString(value) {
    let hash = 0;
    for (const char of String(value)) hash = (hash * 31 + char.codePointAt(0)) | 0;
    return hash;
  }

  /* "12h", "45m", "3d": the countdown shown beside a snoozed chat. */
  function shortDuration(ms) {
    /* Rounded up: a reminder 20 seconds away reads "1m", not "0m". */
    const minutes = Math.max(1, Math.ceil(ms / 60000));
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.round(minutes / 60);
    if (hours < 48) return `${hours}h`;
    return `${Math.round(hours / 24)}d`;
  }

  /* Palette ranking: every query character must appear in order. A match at
     the start, at a word start, or in a run scores higher; 0 = no match.
     Case- and accent-insensitive, so "jose" finds "José". */
  function fold(value) {
    return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase();
  }

  function fuzzyScore(query, label) {
    const q = fold(query).replace(/\s+/g, " ").trim();
    const text = fold(label);
    if (!q) return 1;
    if (!text) return 0;
    const exact = text.indexOf(q);
    if (exact === 0) return 1000 - text.length;
    if (exact > 0) return (/[\s\-_.(]/.test(text[exact - 1]) ? 800 : 600) - exact - text.length / 100;
    let score = 0;
    let from = 0;
    let run = 0;
    for (const char of q) {
      if (char === " ") continue;
      const at = text.indexOf(char, from);
      if (at < 0) return 0;
      run = at === from ? run + 1 : 0;
      score += 10 + run * 5 + (at === 0 || /[\s\-_.(]/.test(text[at - 1]) ? 15 : 0) - Math.min(at - from, 10);
      from = at + 1;
    }
    return Math.max(1, score);
  }

  /* Folds the rows on screen into the known mentions: a row showing the "@"
     marker adds or refreshes its chat; the same chat on screen without it has
     been read, so it leaves. Chats not on screen keep their last state.
     Returns the same array when nothing changed. */
  function mergeMentions(mentions, rows, now = Date.now()) {
    const list = Array.isArray(mentions) ? mentions : [];
    const byName = new Map(list.map((item) => [item.name, item]));
    let changed = false;
    /* Two chats can share a name: the name has a mention if any of its rows
       shows one, so the entry is not added and dropped in the same pass. */
    const collapsed = new Map();
    (rows || []).forEach((row) => {
      const seen = collapsed.get(row.name);
      collapsed.set(row.name, seen ? { name: row.name, mention: seen.mention || row.mention, unread: Math.max(seen.unread || 0, row.unread || 0) } : row);
    });
    collapsed.forEach((row) => {
      const known = byName.get(row.name);
      if (row.mention) {
        if (!known || known.unread !== row.unread) {
          byName.set(row.name, { name: row.name, unread: row.unread, seenAt: now });
          changed = true;
        }
      } else if (known) {
        byName.delete(row.name);
        changed = true;
      }
    });
    return changed ? Array.from(byName.values()).sort((a, b) => b.seenAt - a.seenAt) : list;
  }

  const api = Object.freeze({ applyPlaceholders, mergeMentions, fuzzyScore, classifyFolders, railOrder, pinChat, unpinChat, movePin, refreshPins, reminderPresets, addReminder, removeReminder, dueReminders, shortDuration, shortcutAction, whatsNewPlan, RELEASE_NOTES, compareVersions, releaseNotesKey, unseenReleases, FOLDER_ALIASES, NATIVE_FOLDER_IDS, normalizeLabel, folderKind, folderKindById, isFolderAction, folderInitial, uniqueFolders, parseFolderTab, desktopPlatform, i18n, loadLocaleOverride, uiLanguage, localeDirection, localeScript });
  global.WRUtils = api;

  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
