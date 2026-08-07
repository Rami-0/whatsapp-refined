(function initPopup() {
  "use strict";

  const { DEFAULTS, normalizeSettings } = globalThis.WRSettings;
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
    const names = { mac: "macOS shortcuts", windows: "Windows shortcuts", linux: "Linux shortcuts", other: "Desktop shortcuts" };
    document.querySelector("#platformName").textContent = names[platform];
    document.querySelector("#platformSymbol").textContent = isMac ? "⌘" : platform === "windows" ? "⊞" : "⌨";
    document.querySelector("#platformHelp").textContent = isMac ? "Uses Command (⌘) and Option (⌥)" : "Uses Ctrl and Alt";
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
      if (!storage) return resolve(normalizeSettings({ ...DEFAULTS, ...previewSettings }));
      storage.get(null, (values) => resolve(normalizeSettings(values)));
    });
  }

  function save(key, value) {
    storage?.set({ [key]: value });
  }

  function updateRange(input) {
    const progress = ((Number(input.value) - Number(input.min)) / (Number(input.max) - Number(input.min))) * 100;
    input.style.setProperty("--range-progress", `${progress}%`);
    const output = document.querySelector(`#${input.id}Value`);
    if (output) output.textContent = `${input.value} px`;
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
    if (storage) storage.set(DEFAULTS, () => render(DEFAULTS));
    else render(DEFAULTS);
  });

  if (params.has("embedded")) document.body.classList.add("is-embedded");
  if (["dark", "light"].includes(params.get("theme"))) document.documentElement.dataset.theme = params.get("theme");
  renderPlatform();
  readSettings().then(render);
  globalThis.chrome?.storage?.onChanged?.addListener((_changes, area) => {
    if (area === "local") readSettings().then(render);
  });
})();
