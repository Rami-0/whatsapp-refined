(function initPopup() {
  "use strict";

  const { DEFAULTS, normalizeSettings } = globalThis.WRSettings;
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

  function readSettings() {
    return new Promise((resolve) => {
      const fallback = () => resolve(normalizeSettings({ ...DEFAULTS, ...previewSettings }));
      if (!storage) return fallback();
      try {
        storage.get(null, (values) => resolve(normalizeSettings(values)));
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
    input.addEventListener("change", () => {
      const key = input.dataset.setting;
      const value = input.type === "checkbox" ? input.checked : numericSettings.has(key) ? Number(input.value) : input.value;
      save(key, value);
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

  document.querySelector("#resetSettings").addEventListener("click", () => {
    try {
      if (storage) return storage.set(DEFAULTS, () => render(DEFAULTS));
    } catch (_error) {}
    render(DEFAULTS);
  });

  if (params.has("embedded")) document.body.classList.add("is-embedded");
  if (["dark", "light"].includes(params.get("theme"))) document.documentElement.dataset.theme = params.get("theme");
  (globalThis.WRLocaleReady || Promise.resolve()).then(() => {
    renderPlatform();
    readSettings().then(render);
  });
  globalThis.chrome?.storage?.onChanged?.addListener((changes, area) => {
    if (area !== "local") return;
    /* Reload so i18n.js re-resolves the whole page in the new language. */
    if (changes.language) return location.reload();
    readSettings().then(render);
  });
})();
