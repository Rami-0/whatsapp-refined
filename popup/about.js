(function initAboutPopup() {
  "use strict";

  const storage = globalThis.chrome?.storage?.local;
  const defaults = globalThis.WRSettings.DEFAULTS;
  const t = globalThis.WRUtils.i18n;
  const button = document.querySelector("#activationButton");
  let enabled = defaults.enabled;

  function render(value) {
    enabled = Boolean(value);
    document.body.classList.toggle("is-paused", !enabled);
    document.querySelector("#activationTitle").textContent = enabled ? t("activeTitle", "Refined is active") : t("pausedTitle", "Refined is paused");
    document.querySelector("#activationHelp").textContent = enabled
      ? t("activeHelp", "Your layout and privacy preferences are applied.")
      : t("pausedHelp", "Activate it to restore your saved interface preferences.");
    button.textContent = enabled ? t("pauseButton", "Pause Refined") : t("activateButton", "Activate Refined");
    button.setAttribute("aria-pressed", String(enabled));
    document.querySelector("#stateDot").title = enabled ? t("stateActive", "Active") : t("statePaused", "Paused");
  }

  function read() {
    if (!storage) {
      render(enabled);
      return;
    }
    try {
      storage.get(["enabled"], (values) => render(values.enabled ?? defaults.enabled));
    } catch (_error) {
      render(enabled);
    }
  }

  button.addEventListener("click", () => {
    const next = !enabled;
    render(next);
    try {
      storage?.set({ enabled: next });
    } catch (_error) {}
  });

  globalThis.chrome?.storage?.onChanged?.addListener((changes, area) => {
    if (area !== "local") return;
    if (changes.language) return location.reload();
    if (changes.enabled) render(changes.enabled.newValue ?? defaults.enabled);
  });

  const version = globalThis.chrome?.runtime?.getManifest?.().version;
  if (version) document.querySelector("#version").textContent = `v${version}`;
  (globalThis.WRLocaleReady || Promise.resolve()).then(read);
})();
