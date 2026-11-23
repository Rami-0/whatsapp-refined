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

/* Syncs run one after another: overlapping runs could read an old list,
   leave a stale badge, clear an alarm another run just created, or notify
   twice for the same reminder. */
let syncChain = Promise.resolve();
function syncReminderAlarms() {
  syncChain = syncChain.then(runReminderSync, runReminderSync);
  return syncChain;
}

async function runReminderSync() {
  const { reminders, enabled, notify } = await readReminders();
  const existing = (await chrome.alarms.getAll()).filter((alarm) => alarm.name.startsWith(REMINDER_PREFIX));
  const wanted = new Set(enabled ? reminders.map((item) => item.id) : []);
  await Promise.all(existing.filter((alarm) => !wanted.has(alarm.name)).map((alarm) => chrome.alarms.clear(alarm.name)));
  const now = Date.now();
  for (const item of enabled ? reminders : []) {
    if (item.dueAt > now && !existing.some((alarm) => alarm.name === item.id && Math.abs(alarm.scheduledTime - item.dueAt) < 1000)) {
      await chrome.alarms.create(item.id, { when: item.dueAt });
    }
  }
  /* Every reminder that came due and was not handled yet: the one whose
     alarm just fired, and any that fell due while Chrome was closed (alarms
     do not fire for a browser that is not running). Each is handled once:
     `fired` is written back, so a restart does not alert again. */
  const fresh = enabled ? reminders.filter((item) => item.dueAt <= now && !item.fired) : [];
  if (fresh.length) {
    if (notify) for (const item of fresh) await notifyReminder(item);
    const ids = new Set(fresh.map((item) => item.id));
    const latest = (await readReminders()).reminders;
    await chrome.storage.local.set({ refinedReminders: latest.map((item) => (ids.has(item.id) ? { ...item, fired: true } : item)) });
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

function message(key, fallback) {
  return chrome.i18n.getMessage(key) || fallback;
}

/* Resolves to the notification id, or rejects with Chrome's reason. */
function createNotification(id, options) {
  return new Promise((resolve, reject) => {
    chrome.notifications.create(id, options, (created) => {
      if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
      else resolve(created);
    });
  });
}

/* Stays on screen until acted on (a reminder that vanishes after five
   seconds is easy to miss), with Open and Snooze buttons. */
async function notifyReminder(item) {
  const granted = await chrome.permissions.contains({ permissions: ["notifications"] }).catch(() => false);
  if (!granted || !chrome.notifications) return;
  try {
    await createNotification(item.id, {
      type: "basic",
      iconUrl: chrome.runtime.getURL("icons/icon128.png"),
      title: message("reminderNotificationTitle", "Reminder"),
      message: item.name,
      contextMessage: "Refined WhatsApp™ Web",
      priority: 2,
      requireInteraction: true,
      buttons: [{ title: message("reminderOpenChat", "Open chat") }, { title: message("reminderSnooze1h", "Snooze 1 hour") }]
    });
  } catch (_error) {}
}

/* Settings → "Send a test": proves the whole path, and says which layer
   blocked it when Chrome itself refuses. The operating system can still
   hide a notification Chrome showed; the settings page says where to look. */
async function sendTestNotification() {
  if (!chrome.notifications) return { ok: false, reason: "permission" };
  const level = await new Promise((resolve) => chrome.notifications.getPermissionLevel(resolve));
  if (level !== "granted") return { ok: false, reason: "chrome" };
  try {
    await createNotification(`wr-test-${Date.now()}`, {
      type: "basic",
      iconUrl: chrome.runtime.getURL("icons/icon128.png"),
      title: message("reminderNotificationTitle", "Reminder"),
      message: message("testNotificationBody", "Notifications from Refined work."),
      contextMessage: "Refined WhatsApp™ Web",
      priority: 2
    });
    return { ok: true };
  } catch (error) {
    return { ok: false, reason: "error", detail: error.message };
  }
}

chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
  if (request?.type !== "wr-test-notification") return false;
  sendTestNotification().then(sendResponse, () => sendResponse({ ok: false, reason: "error" }));
  return true;
});

/* Focus a WhatsApp tab (or open one) and have it open the chat. The request
   goes through storage: a tab that is loading, was discarded, or is brand new
   picks it up once its chat list is ready (content.js), so no fixed delay. */
async function openChatInWhatsApp(name) {
  await chrome.storage.local.set({ pendingOpenChat: { name, at: Date.now() } });
  const [tab] = await chrome.tabs.query({ url: "https://web.whatsapp.com/*" });
  if (tab) {
    await chrome.tabs.update(tab.id, { active: true });
    if (tab.windowId !== undefined) await chrome.windows.update(tab.windowId, { focused: true });
  } else {
    await chrome.tabs.create({ url: "https://web.whatsapp.com/" });
  }
}

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name.startsWith(REMINDER_PREFIX)) syncReminderAlarms();
});

/* chrome.notifications only exists once the optional permission is granted,
   so the handlers are (re)attached at start-up and when it is granted. */
async function onNotificationClicked(id) {
  if (!id.startsWith(REMINDER_PREFIX)) {
    if (id.startsWith("wr-test-")) chrome.notifications.clear(id);
    return;
  }
  const { reminders } = await readReminders();
  const item = reminders.find((entry) => entry.id === id);
  chrome.notifications.clear(id);
  if (item) openChatInWhatsApp(item.name);
}

async function onNotificationButton(id, index) {
  if (!id.startsWith(REMINDER_PREFIX)) return;
  chrome.notifications.clear(id);
  const { reminders } = await readReminders();
  const item = reminders.find((entry) => entry.id === id);
  if (!item) return;
  if (index === 0) return openChatInWhatsApp(item.name);
  /* Snooze: the same reminder, due again in an hour, alertable again. */
  const dueAt = Date.now() + 60 * 60 * 1000;
  const next = reminders.map((entry) => (entry.id === id ? { ...entry, dueAt, fired: false } : entry)).sort((a, b) => a.dueAt - b.dueAt);
  await chrome.storage.local.set({ refinedReminders: next });
}

function attachNotificationClicks() {
  if (!chrome.notifications) return;
  if (!chrome.notifications.onClicked.hasListener(onNotificationClicked)) chrome.notifications.onClicked.addListener(onNotificationClicked);
  if (!chrome.notifications.onButtonClicked.hasListener(onNotificationButton)) chrome.notifications.onButtonClicked.addListener(onNotificationButton);
}

attachNotificationClicks();
chrome.permissions.onAdded.addListener(attachNotificationClicks);

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && (changes.refinedReminders || changes.remindersEnabled || changes.enabled)) syncReminderAlarms();
});

chrome.runtime.onStartup.addListener(syncReminderAlarms);
chrome.runtime.onInstalled.addListener(syncReminderAlarms);
syncReminderAlarms();
