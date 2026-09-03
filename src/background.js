/* The content script cannot read the extension's _locales folder itself:
   Chrome refuses to serve underscore-prefixed paths to a web page, so the
   manual-language override fetched nothing on web.whatsapp.com and the rail
   fell back to chrome.i18n (the browser's UI language). This worker reads the
   file same-origin and hands the messages over instead. */
importScripts("/src/settings.js");

const { LANGUAGES } = globalThis.WRSettings;

async function readLocale(language) {
  if (!LANGUAGES.includes(language) || language === "auto") return null;
  try {
    const response = await fetch(chrome.runtime.getURL(`_locales/${language}/messages.json`));
    return response.ok ? await response.json() : null;
  } catch (_error) {
    return null;
  }
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== "wr-locale") return false;
  readLocale(message.language).then((messages) => sendResponse({ messages }));
  return true;
});
