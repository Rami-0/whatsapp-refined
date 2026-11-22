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
      message = message.replace(new RegExp(`\\$${name}\\$`, "gi"), String(subs[index] ?? ""));
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
  const RELEASE_NOTES = Object.freeze(["1.3.2", "1.3.1"]);
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

  const api = Object.freeze({ shortcutAction, whatsNewPlan, RELEASE_NOTES, compareVersions, releaseNotesKey, unseenReleases, FOLDER_ALIASES, NATIVE_FOLDER_IDS, normalizeLabel, folderKind, folderKindById, isFolderAction, folderInitial, uniqueFolders, parseFolderTab, desktopPlatform, i18n, loadLocaleOverride, uiLanguage, localeDirection, localeScript });
  global.WRUtils = api;

  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
