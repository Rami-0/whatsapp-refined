(function initLocale() {
  "use strict";

  const utils = globalThis.WRUtils;

  function readLanguage() {
    return new Promise((resolve) => {
      try {
        const storage = globalThis.chrome?.storage?.local;
        if (!storage) return resolve("auto");
        storage.get(["language"], (values) => resolve(values.language || "auto"));
      } catch (_error) {
        resolve("auto");
      }
    });
  }

  function setText(element, message) {
    const textNodes = Array.from(element.childNodes).filter((node) => node.nodeType === Node.TEXT_NODE && node.textContent.trim());
    if (!textNodes.length) {
      element.textContent = message;
      return;
    }
    /* Elements like <span><i></i>Native tabs</span> keep their icon child. */
    textNodes.forEach((node, index) => {
      node.textContent = index === 0 ? message : "";
    });
  }

  function apply() {
    document.querySelectorAll("[data-i18n]").forEach((element) => {
      const message = utils.i18n(element.dataset.i18n, "");
      if (message) setText(element, message);
    });
    document.querySelectorAll("[data-i18n-title]").forEach((element) => {
      const message = utils.i18n(element.dataset.i18nTitle, "");
      if (message) element.setAttribute("title", message);
    });
    document.querySelectorAll("[data-i18n-aria-label]").forEach((element) => {
      const message = utils.i18n(element.dataset.i18nAriaLabel, "");
      if (message) element.setAttribute("aria-label", message);
    });
  }

  async function applyLanguage(language) {
    const overridden = await utils.loadLocaleOverride(language);
    const root = document.documentElement;
    if (overridden) {
      root.lang = language.replace("_", "-");
      root.dir = utils.localeDirection(language);
    } else if (globalThis.chrome?.i18n) {
      root.lang = chrome.i18n.getUILanguage();
      root.dir = chrome.i18n.getMessage("@@bidi_dir") || "ltr";
    }
    /* popup.css keys its font stack off this: the Latin-first default renders
       Arabic, Devanagari and CJK smaller than the text beside them. */
    root.dataset.wrScript = utils.localeScript(utils.uiLanguage(language));
    apply();
  }

  const listeners = [];

  globalThis.WRLocale = Object.freeze({
    /* Pages register whatever they render from JS rather than from a data-i18n
       attribute. Switching language re-runs those in place: reloading the page
       instead would throw away the open tab, the scroll position and focus. */
    onChange(listener) {
      listeners.push(listener);
    }
  });

  /* Pages await this promise before rendering their own strings, so a
     manually chosen language wins over the browser locale everywhere. */
  globalThis.WRLocaleReady = (async () => {
    const language = await readLanguage();
    await applyLanguage(language);
    return language;
  })();

  globalThis.chrome?.storage?.onChanged?.addListener((changes, area) => {
    if (area !== "local" || !changes.language) return;
    applyLanguage(changes.language.newValue || "auto").then(() => {
      listeners.forEach((listener) => listener());
    });
  });
})();
