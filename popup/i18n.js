(function localizeDocument() {
  "use strict";

  const getMessage = globalThis.chrome?.i18n?.getMessage;
  if (!getMessage) return;

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

  document.documentElement.lang = chrome.i18n.getUILanguage();
  document.documentElement.dir = getMessage("@@bidi_dir") || "ltr";
  document.querySelectorAll("[data-i18n]").forEach((element) => {
    const message = getMessage(element.dataset.i18n);
    if (message) setText(element, message);
  });
  document.querySelectorAll("[data-i18n-title]").forEach((element) => {
    const message = getMessage(element.dataset.i18nTitle);
    if (message) element.setAttribute("title", message);
  });
  document.querySelectorAll("[data-i18n-aria-label]").forEach((element) => {
    const message = getMessage(element.dataset.i18nAriaLabel);
    if (message) element.setAttribute("aria-label", message);
  });
})();
