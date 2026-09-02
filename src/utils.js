(function initUtils(global) {
  "use strict";

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

  const RTL_LANGUAGES = Object.freeze(["ar"]);
  let localeOverride = null;

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

  async function loadLocaleOverride(language) {
    if (!language || language === "auto") {
      localeOverride = null;
      return false;
    }
    try {
      const url = global.chrome?.runtime?.getURL?.(`_locales/${language}/messages.json`);
      if (!url) return false;
      localeOverride = await (await fetch(url)).json();
      return true;
    } catch (_error) {
      localeOverride = null;
      return false;
    }
  }

  function localeDirection(language) {
    return RTL_LANGUAGES.includes(language) ? "rtl" : "ltr";
  }

  const api = Object.freeze({ FOLDER_ALIASES, normalizeLabel, folderKind, folderInitial, uniqueFolders, parseFolderTab, desktopPlatform, i18n, loadLocaleOverride, localeDirection });
  global.WRUtils = api;

  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
