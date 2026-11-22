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

/* ---------- Chat reminders (the Snoozed list) ----------
   Reminders live in chrome.storage.local (refinedReminders). Each one gets a
   chrome.alarms alarm named after its id. Chrome clears alarms on extension
   updates (and, before Chrome 150, sometimes on restart), so they are rebuilt
   from storage every time this worker starts and whenever the list changes. */
const REMINDER_PREFIX = "wr-reminder-";

async function readReminders() {
  const values = await chrome.storage.local.get(["refinedReminders", "remindersEnabled", "reminderNotifications", "enabled"]);
  return {
    reminders: Array.isArray(values.refinedReminders) ? values.refinedReminders : [],
    enabled: values.enabled !== false && values.remindersEnabled !== false,
    notify: values.reminderNotifications === true
  };
}

async function syncReminderAlarms() {
  const { reminders, enabled } = await readReminders();
  const existing = (await chrome.alarms.getAll()).filter((alarm) => alarm.name.startsWith(REMINDER_PREFIX));
  const wanted = new Set(enabled ? reminders.map((item) => item.id) : []);
  await Promise.all(existing.filter((alarm) => !wanted.has(alarm.name)).map((alarm) => chrome.alarms.clear(alarm.name)));
  const now = Date.now();
  for (const item of enabled ? reminders : []) {
    if (item.dueAt > now && !existing.some((alarm) => alarm.name === item.id && Math.abs(alarm.scheduledTime - item.dueAt) < 1000)) {
      await chrome.alarms.create(item.id, { when: item.dueAt });
    }
  }
  await updateDueBadge(reminders, enabled);
}

/* The toolbar icon counts due reminders, so they are visible even with
   WhatsApp closed and notifications off. No permission needed. */
async function updateDueBadge(reminders, enabled) {
  const due = enabled ? reminders.filter((item) => item.dueAt <= Date.now()).length : 0;
  try {
    await chrome.action.setBadgeBackgroundColor({ color: "#00a884" });
    await chrome.action.setBadgeText({ text: due ? String(due) : "" });
  } catch (_error) {}
}

async function notifyReminder(item) {
  const granted = await chrome.permissions.contains({ permissions: ["notifications"] }).catch(() => false);
  if (!granted || !chrome.notifications) return;
  chrome.notifications.create(item.id, {
    type: "basic",
    iconUrl: chrome.runtime.getURL("icons/icon128.png"),
    title: chrome.i18n.getMessage("reminderNotificationTitle") || "Reminder",
    message: item.name,
    priority: 2
  });
}

/* Focus a WhatsApp tab (or open one) and ask it to open the chat. */
async function openChatInWhatsApp(name) {
  const [tab] = await chrome.tabs.query({ url: "https://web.whatsapp.com/*" });
  if (tab) {
    await chrome.tabs.update(tab.id, { active: true });
    if (tab.windowId !== undefined) await chrome.windows.update(tab.windowId, { focused: true });
    chrome.tabs.sendMessage(tab.id, { type: "wr-open-chat", name }).catch(() => {});
  } else {
    const created = await chrome.tabs.create({ url: "https://web.whatsapp.com/" });
    const listener = (tabId, info) => {
      if (tabId !== created.id || info.status !== "complete") return;
      chrome.tabs.onUpdated.removeListener(listener);
      setTimeout(() => chrome.tabs.sendMessage(created.id, { type: "wr-open-chat", name }).catch(() => {}), 8000);
    };
    chrome.tabs.onUpdated.addListener(listener);
  }
}

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (!alarm.name.startsWith(REMINDER_PREFIX)) return;
  const { reminders, enabled, notify } = await readReminders();
  const item = reminders.find((entry) => entry.id === alarm.name);
  if (!item || !enabled) return;
  if (notify) await notifyReminder(item);
  await updateDueBadge(reminders, enabled);
});

/* chrome.notifications only exists once the optional permission is granted,
   so the click handler is (re)attached at start-up and when it is granted. */
async function onNotificationClicked(id) {
  if (!id.startsWith(REMINDER_PREFIX)) return;
  const { reminders } = await readReminders();
  const item = reminders.find((entry) => entry.id === id);
  chrome.notifications.clear(id);
  if (item) openChatInWhatsApp(item.name);
}

function attachNotificationClicks() {
  if (chrome.notifications && !chrome.notifications.onClicked.hasListener(onNotificationClicked)) {
    chrome.notifications.onClicked.addListener(onNotificationClicked);
  }
}

attachNotificationClicks();
chrome.permissions.onAdded.addListener(attachNotificationClicks);

chrome.runtime.onMessage.addListener((message) => {
  if (message?.type === "wr-reminders-sync") syncReminderAlarms();
  return false;
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && (changes.refinedReminders || changes.remindersEnabled || changes.enabled)) syncReminderAlarms();
});

chrome.runtime.onStartup.addListener(syncReminderAlarms);
chrome.runtime.onInstalled.addListener(syncReminderAlarms);
syncReminderAlarms();
