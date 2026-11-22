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

/* An update leaves a note for the content script, which shows the release
   card the next time WhatsApp is open. A fresh install does not: the user has
   just chosen the extension and the store page already told them what it does. */
chrome.runtime.onInstalled.addListener(({ reason, previousVersion }) => {
  if (reason !== "update") return;
  const version = chrome.runtime.getManifest().version;
  if (!previousVersion || previousVersion === version) return;
  chrome.storage.local.set({ whatsNewPending: { version, previousVersion } });
});

/* Development only: lets a test driver reload the extension from the
   WhatsApp tab, since chrome://extensions is out of its reach. Store installs
   carry an update_url and ignore the request, so this never acts in the
   published extension. */
chrome.runtime.onMessage.addListener((message) => {
  if (message?.type !== "wr-dev-reload") return false;
  if ("update_url" in chrome.runtime.getManifest()) return false;
  chrome.runtime.reload();
  return false;
});
