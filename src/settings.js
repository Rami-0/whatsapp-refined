(function initSettings(global) {
  "use strict";

  const DEFAULTS = Object.freeze({
    enabled: true,
    folderLayout: "native",
    customSidebarWidth: false,
    sidebarWidth: 432,
    showPreviews: true,
    hideNotificationBanner: false,
    hideMetaAI: false,
    hideChannels: false,
    keyboardShortcuts: true,
    pinsEnabled: true,
    remindersEnabled: true,
    reminderNotifications: false,
    reminderPresets: Object.freeze([60, 180, "tomorrow"]),
    mentionsEnabled: true,
    privacyEnabled: false,
    blurPreviews: true,
    blurMessages: true,
    blurImages: true,
    blurVideos: true,
    blurNames: false,
    blurAvatars: false,
    revealOnHover: true,
    blurStrength: 8,
    language: "auto"
  });

  const LANGUAGES = Object.freeze(["auto", "ar", "de", "en", "es", "fr", "hi", "id", "it", "ja", "ko", "nl", "pl", "pt_BR", "pt_PT", "ru", "tr", "vi", "zh_CN", "zh_TW"]);
  const ENUMS = Object.freeze({ folderLayout: ["native", "sidebar"], language: LANGUAGES });

  /* The times offered by "Remind me": minutes from now, or "tomorrow" (09:00
     the next day). At most five, no repeats, nothing past a year. An empty
     list is allowed: the menu then offers only the custom date. */
  const MAX_REMINDER_PRESETS = 5;
  const MAX_PRESET_MINUTES = 366 * 24 * 60;

  function normalizeReminderPresets(value) {
    if (!Array.isArray(value)) return [...DEFAULTS.reminderPresets];
    const seen = new Set();
    const list = [];
    for (const item of value) {
      const preset = item === "tomorrow" ? item : Math.round(Number(item));
      if (preset !== "tomorrow" && !(Number.isFinite(preset) && preset >= 1 && preset <= MAX_PRESET_MINUTES)) continue;
      if (seen.has(preset)) continue;
      seen.add(preset);
      list.push(preset);
      if (list.length === MAX_REMINDER_PRESETS) break;
    }
    return list;
  }

  function clamp(value, min, max, fallback) {
    const number = Number(value);
    return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : fallback;
  }

  function normalizeSettings(stored = {}) {
    const source = { ...stored };
    if (!source.folderLayout && source.railPosition) {
      source.folderLayout = source.railPosition === "left" || source.railPosition === "right" ? "sidebar" : "native";
    }
    if (source.folderLayout === "rail-left" || source.folderLayout === "rail-right") source.folderLayout = "sidebar";
    if (!("blurImages" in source) && "blurMedia" in source) source.blurImages = source.blurMedia;
    if (!("blurVideos" in source) && "blurMedia" in source) source.blurVideos = source.blurMedia;

    const normalized = { ...DEFAULTS };
    Object.keys(DEFAULTS).forEach((key) => {
      if (key in source) normalized[key] = source[key];
    });
    for (const [key, values] of Object.entries(ENUMS)) {
      if (!values.includes(normalized[key])) normalized[key] = DEFAULTS[key];
    }
    normalized.sidebarWidth = clamp(normalized.sidebarWidth, 360, 620, DEFAULTS.sidebarWidth);
    normalized.reminderPresets = normalizeReminderPresets(normalized.reminderPresets);
    normalized.blurStrength = clamp(normalized.blurStrength, 3, 16, DEFAULTS.blurStrength);

    for (const [key, defaultValue] of Object.entries(DEFAULTS)) {
      if (typeof defaultValue === "boolean") normalized[key] = Boolean(normalized[key]);
    }
    return normalized;
  }

  const api = Object.freeze({ DEFAULTS, ENUMS, LANGUAGES, MAX_REMINDER_PRESETS, MAX_PRESET_MINUTES, normalizeReminderPresets, normalizeSettings });
  global.WRSettings = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
