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

  /* Pages await this promise before rendering their own strings, so a
     manually chosen language wins over the browser locale everywhere. */
  globalThis.WRLocaleReady = (async () => {
    const language = await readLanguage();
    const overridden = await utils.loadLocaleOverride(language);
    if (overridden) {
      document.documentElement.lang = language.replace("_", "-");
      document.documentElement.dir = utils.localeDirection(language);
    } else if (globalThis.chrome?.i18n) {
      document.documentElement.lang = chrome.i18n.getUILanguage();
      document.documentElement.dir = chrome.i18n.getMessage("@@bidi_dir") || "ltr";
    }
    apply();
    return language;
  })();
})();
