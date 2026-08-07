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
    privacyEnabled: false,
    blurPreviews: true,
    blurMessages: true,
    blurImages: true,
    blurVideos: true,
    blurNames: false,
    blurAvatars: false,
    revealOnHover: true,
    blurStrength: 8
  });

  const ENUMS = Object.freeze({ folderLayout: ["native", "sidebar"] });

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
    normalized.blurStrength = clamp(normalized.blurStrength, 3, 16, DEFAULTS.blurStrength);

    for (const [key, defaultValue] of Object.entries(DEFAULTS)) {
      if (typeof defaultValue === "boolean") normalized[key] = Boolean(normalized[key]);
    }
    return normalized;
  }

  const api = Object.freeze({ DEFAULTS, ENUMS, normalizeSettings });
  global.WRSettings = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
