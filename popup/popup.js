(function initPopup() {
  "use strict";

  const { DEFAULTS, normalizeSettings, normalizeReminderPresets, MAX_REMINDER_PRESETS, MAX_PRESET_MINUTES } = globalThis.WRSettings;
  const BACKUP_KEY = "settingsBackup";
  const t = globalThis.WRUtils.i18n;
  const storage = globalThis.chrome?.storage?.local;
  const numericSettings = new Set(["sidebarWidth", "blurStrength"]);
  const params = new URLSearchParams(location.search);
  let previewSettings = {};

  if (params.has("previewSettings")) {
    try {
      previewSettings = JSON.parse(params.get("previewSettings")) || {};
    } catch (_error) {
      previewSettings = {};
    }
  }

  function renderPlatform() {
    const platform = globalThis.WRUtils.desktopPlatform(navigator);
    const isMac = platform === "mac";
    const names = {
      mac: t("platformMac", "macOS shortcuts"),
      windows: t("platformWindows", "Windows shortcuts"),
      linux: t("platformLinux", "Linux shortcuts"),
      other: t("platformOther", "Desktop shortcuts")
    };
    document.querySelector("#platformName").textContent = names[platform];
    document.querySelector("#platformSymbol").textContent = isMac ? "⌘" : platform === "windows" ? "⊞" : "⌨";
    document.querySelector("#platformHelp").textContent = isMac ? t("platformHelpMac", "Uses Command (⌘) and Option (⌥)") : t("platformHelpOther", "Uses Ctrl and Alt");
    document.querySelectorAll(".shortcut-keys").forEach((container) => {
      const tokens = (isMac ? container.dataset.mac : container.dataset.other).split("|");
      container.replaceChildren(...tokens.map((token) => {
        const key = document.createElement("kbd");
        key.textContent = token;
        return key;
      }));
    });
  }

  let currentSettings = normalizeSettings(DEFAULTS);
  const language = () => globalThis.WRUtils.uiLanguage(currentSettings.language);
  const CLOSE_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m7 7 10 10M17 7 7 17"/></svg>';

  /* ---------- reminder times ---------- */

  function renderPresets(settings) {
    const list = document.querySelector("#presetList");
    const presets = globalThis.WRUtils.reminderPresets(new Date(), settings.reminderPresets);
    const tomorrow = t("remindTomorrow", "Tomorrow");
    list.replaceChildren(...presets.map((preset) => {
      const item = document.createElement("li");
      const label = globalThis.WRUtils.presetLabel(preset, language(), tomorrow);
      item.append(label);
      const remove = document.createElement("button");
      remove.type = "button";
      remove.innerHTML = CLOSE_ICON;
      remove.setAttribute("aria-label", t("presetRemoveAria", `Remove ${label}`, [label]));
      remove.addEventListener("click", () => savePresets(settings.reminderPresets.filter((value) => value !== (preset.key === "tomorrow" ? "tomorrow" : preset.minutes))));
      item.append(remove);
      return item;
    }));
    if (!presets.length) {
      const empty = document.createElement("li");
      empty.className = "preset-empty";
      empty.textContent = t("presetsEmpty", "Only a custom date and time");
      list.append(empty);
    }
    const full = settings.reminderPresets.length >= MAX_REMINDER_PRESETS;
    document.querySelector("#presetAdd").disabled = full;
    document.querySelector("#presetAmount").disabled = full || document.querySelector("#presetUnit").value === "tomorrow";
    document.querySelector("#presetUnit").disabled = full;
    if (full) setPresetNote(t("presetsFull", "That's 5. Remove one to add another."));
    else if (document.querySelector("#presetNote").dataset.kind === "full") setPresetNote("");
    document.querySelector("#presetBlock").classList.toggle("is-setting-disabled", !settings.remindersEnabled);
  }

  function setPresetNote(text) {
    const note = document.querySelector("#presetNote");
    note.textContent = text;
    note.dataset.kind = text && text === t("presetsFull", "That's 5. Remove one to add another.") ? "full" : "";
  }

  function savePresets(next) {
    save("reminderPresets", normalizeReminderPresets(next));
    render({ ...currentSettings, reminderPresets: normalizeReminderPresets(next) });
  }

  const UNIT_MINUTES = { minute: 1, hour: 60, day: 1440, week: 10080 };

  document.querySelector("#presetUnit").addEventListener("change", (event) => {
    document.querySelector("#presetAmount").disabled = event.target.value === "tomorrow";
  });

  document.querySelector("#presetAdd").addEventListener("click", () => {
    const unit = document.querySelector("#presetUnit").value;
    const amount = Math.round(Number(document.querySelector("#presetAmount").value));
    const preset = unit === "tomorrow" ? "tomorrow" : amount * UNIT_MINUTES[unit];
    if (preset !== "tomorrow" && !(amount >= 1 && preset <= MAX_PRESET_MINUTES)) {
      setPresetNote(t("presetsInvalid", "Pick a time between 1 minute and 1 year."));
      return;
    }
    if (currentSettings.reminderPresets.includes(preset)) {
      setPresetNote(t("presetsDuplicate", "That time is already in the list."));
      return;
    }
    setPresetNote("");
    savePresets([...currentSettings.reminderPresets, preset]);
  });

  document.querySelector("#presetAmount").addEventListener("keydown", (event) => {
    if (event.key === "Enter") document.querySelector("#presetAdd").click();
  });

  /* ---------- notification test ---------- */

  function renderNotificationTest(settings) {
    const row = document.querySelector("#notificationTest");
    row.hidden = !settings.reminderNotifications;
    row.classList.toggle("is-setting-disabled", !settings.remindersEnabled);
  }

  function systemHint() {
    const platform = globalThis.WRUtils.desktopPlatform(navigator);
    if (platform === "mac") return t("testNotificationHintMac", "Nothing showed up? Open System Settings → Notifications, pick your browser and turn on Allow notifications.");
    if (platform === "windows") return t("testNotificationHintWindows", "Nothing showed up? Open Settings → System → Notifications and turn them on for your browser.");
    return t("testNotificationHintOther", "Nothing showed up? Allow notifications for your browser in your system settings.");
  }

  function setTestStatus(text, state) {
    const status = document.querySelector("#notificationTestStatus");
    status.textContent = text;
    status.dataset.state = state || "";
  }

  async function sendTestNotification() {
    setTestStatus(t("testNotificationSending", "Sending…"));
    let result = null;
    try {
      result = await chrome.runtime.sendMessage({ type: "wr-test-notification" });
    } catch (_error) {}
    if (result?.ok) setTestStatus(`${t("testNotificationSent", "Sent.")} ${systemHint()}`, "ok");
    else if (result?.reason === "chrome") setTestStatus(t("testNotificationChrome", "Your browser is blocking Refined's notifications. Allow them in its site and extension notification settings."), "error");
    else if (result?.reason === "permission") setTestStatus(t("testNotificationPermission", "Turn on Reminder notifications first."), "error");
    else setTestStatus(t("testNotificationFailed", "The notification could not be sent. Try again after restarting the browser."), "error");
  }

  document.querySelector("#sendTestNotification").addEventListener("click", sendTestNotification);

  /* ---------- release notes ---------- */

  const notesDialog = document.querySelector("#notesDialog");
  const installedVersion = () => globalThis.chrome?.runtime?.getManifest?.().version || globalThis.WRUtils.RELEASE_NOTES[0];

  function renderReleaseHelp() {
    document.querySelector("#releaseNotesHelp").textContent = t("releaseNotesHelp", `Version ${installedVersion()} · what changed in each update`, [installedVersion()]);
  }

  function openReleaseNotes() {
    const { RELEASE_NOTES, releaseNotesKey } = globalThis.WRUtils;
    const body = document.querySelector("#notesBody");
    body.replaceChildren(...RELEASE_NOTES.map((version) => {
      const lines = t(releaseNotesKey(version), "").split("\n").map((line) => line.trim()).filter(Boolean);
      const section = document.createElement("section");
      const heading = document.createElement("h3");
      heading.textContent = version;
      if (version === installedVersion()) {
        const chip = document.createElement("span");
        chip.textContent = t("releaseNotesInstalled", "Installed");
        heading.append(chip);
      }
      const list = document.createElement("ul");
      lines.forEach((line) => {
        const item = document.createElement("li");
        item.textContent = line;
        list.append(item);
      });
      section.append(heading, list);
      return section;
    }));
    notesDialog.dir = document.documentElement.dir;
    if (typeof notesDialog.showModal === "function") notesDialog.showModal();
    body.scrollTop = 0;
    notesDialog.querySelector(".notes-close")?.focus();
  }

  document.querySelector("#openReleaseNotes").addEventListener("click", openReleaseNotes);

  /* ---------- backup before reset ---------- */

  function renderRestore(backup) {
    const row = document.querySelector("#restoreRow");
    row.hidden = !backup?.settings;
    if (!backup?.settings) return;
    let when = "";
    try {
      when = new Intl.DateTimeFormat(language().replace("_", "-"), { dateStyle: "medium", timeStyle: "short" }).format(new Date(backup.savedAt));
    } catch (_error) {
      when = new Date(backup.savedAt).toLocaleString();
    }
    document.querySelector("#restoreHelp").textContent = t("restoreHelp", `Saved before the reset on ${when}`, [when]);
  }

  document.querySelector("#restoreSettings").addEventListener("click", () => {
    try {
      storage?.get([BACKUP_KEY], (values) => {
        const backup = values?.[BACKUP_KEY];
        if (!backup?.settings) return;
        const restored = normalizeSettings(backup.settings);
        storage.set(restored, () => storage.remove(BACKUP_KEY, () => readSettings().then(render)));
      });
    } catch (_error) {}
  });

  function readSettings() {
    return new Promise((resolve) => {
      const fallback = () => resolve({ ...DEFAULTS, ...previewSettings });
      if (!storage) return fallback();
      try {
        storage.get(null, (values) => resolve(values || {}));
      } catch (_error) {
        fallback();
      }
    });
  }

  function save(key, value) {
    /* chrome.storage throws "Extension context invalidated" if the extension
       was reloaded while this (possibly embedded) page stayed open. */
    try {
      storage?.set({ [key]: value });
    } catch (_error) {}
  }

  function updateRange(input) {
    const progress = ((Number(input.value) - Number(input.min)) / (Number(input.max) - Number(input.min))) * 100;
    input.style.setProperty("--range-progress", `${progress}%`);
    const output = document.querySelector(`#${input.id}Value`);
    if (output) output.textContent = t("pxValue", `${input.value} px`, [String(input.value)]);
  }

  function render(values) {
    const settings = normalizeSettings(values);
    currentSettings = settings;
    renderPresets(settings);
    renderNotificationTest(settings);
    renderRestore(values?.[BACKUP_KEY]);
    document.querySelectorAll("[data-setting]").forEach((input) => {
      const key = input.dataset.setting;
      if (input.type === "radio") input.checked = input.value === settings[key];
      else if (input.type === "checkbox") input.checked = Boolean(settings[key]);
      else input.value = String(settings[key]);
      if (input.type === "range") updateRange(input);
    });
    document.body.classList.toggle("is-disabled", !settings.enabled);
    document.body.classList.toggle("privacy-off", !settings.privacyEnabled);
    document.body.classList.toggle("shortcuts-off", !settings.keyboardShortcuts);
    syncDependencies(settings);
  }

  function syncDependencies(values) {
    const customWidth = typeof values === "object" ? Boolean(values.customSidebarWidth) : document.querySelector("#customSidebarWidth").checked;
    document.querySelector("#sidebarWidth").disabled = !customWidth;
    document.querySelector("#sidebarWidthSetting").classList.toggle("is-setting-disabled", !customWidth);
  }

  document.querySelectorAll("[data-setting]").forEach((input) => {
    if (input.type === "range") input.addEventListener("input", () => updateRange(input));
    input.addEventListener("change", async () => {
      const key = input.dataset.setting;
      const value = input.type === "checkbox" ? input.checked : numericSettings.has(key) ? Number(input.value) : input.value;
      /* Notifications are an optional permission, asked for only here, so
         the update never disables Refined for existing users. A refusal
         leaves the switch off. */
      if (key === "reminderNotifications" && value && globalThis.chrome?.permissions?.request) {
        let granted = false;
        try {
          granted = await chrome.permissions.request({ permissions: ["notifications"] });
        } catch (_error) {}
        if (!granted) {
          input.checked = false;
          return;
        }
      }
      save(key, value);
      if (key === "reminderNotifications") {
        renderNotificationTest({ ...currentSettings, reminderNotifications: value });
        if (value) sendTestNotification();
      }
      if (key === "enabled") document.body.classList.toggle("is-disabled", !value);
      if (key === "privacyEnabled") document.body.classList.toggle("privacy-off", !value);
      if (key === "keyboardShortcuts") document.body.classList.toggle("shortcuts-off", !value);
      if (key === "customSidebarWidth") syncDependencies();
    });
  });

  document.querySelectorAll("[data-panel-target]").forEach((button) => {
    button.addEventListener("click", () => {
      const target = button.dataset.panelTarget;
      document.querySelectorAll("[data-panel-target]").forEach((item) => item.setAttribute("aria-selected", String(item === button)));
      document.querySelectorAll("[data-panel]").forEach((panel) => { panel.hidden = panel.dataset.panel !== target; });
    });
  });

  /* The settings in use before a reset are kept under settingsBackup, so
     Restore brings them back in one click. Resetting settings that already
     match the defaults keeps the earlier backup instead of overwriting it
     with a copy of the defaults. */
  function resetToDefaults() {
    const defaults = normalizeSettings(DEFAULTS);
    try {
      if (storage) {
        return storage.get(null, (values) => {
          const current = normalizeSettings(values);
          const next = { ...defaults };
          if (JSON.stringify(current) !== JSON.stringify(defaults)) next[BACKUP_KEY] = { savedAt: Date.now(), settings: current };
          storage.set(next, () => readSettings().then(render));
        });
      }
    } catch (_error) {}
    render(defaults);
  }

  const resetDialog = document.querySelector("#resetDialog");

  document.querySelector("#resetSettings").addEventListener("click", () => {
    /* One click would otherwise discard every choice on the page. */
    if (typeof resetDialog.showModal === "function") {
      resetDialog.showModal();
      /* Not the autofocus attribute: Chrome blocks it inside the cross-origin
         drawer iframe on WhatsApp and logs an error. Cancel is the safe default. */
      resetDialog.querySelector('button[value="cancel"]')?.focus();
    } else resetToDefaults();
  });

  resetDialog.addEventListener("close", () => {
    if (resetDialog.returnValue === "reset") resetToDefaults();
    resetDialog.returnValue = "";
  });

  if (params.has("embedded")) document.body.classList.add("is-embedded");
  if (["dark", "light"].includes(params.get("theme"))) document.documentElement.dataset.theme = params.get("theme");
  (globalThis.WRLocaleReady || Promise.resolve()).then(() => {
    renderPlatform();
    renderReleaseHelp();
    readSettings().then(render);
  });
  globalThis.chrome?.storage?.onChanged?.addListener((changes, area) => {
    if (area !== "local") return;
    readSettings().then(render);
  });

  /* i18n.js has already re-resolved every data-i18n string by this point; these
     are the ones this page builds itself. */
  globalThis.WRLocale?.onChange(() => {
    renderPlatform();
    renderReleaseHelp();
    readSettings().then(render);
  });
})();
