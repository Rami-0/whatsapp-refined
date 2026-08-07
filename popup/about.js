(function initAboutPopup() {
  "use strict";

  const storage = globalThis.chrome?.storage?.local;
  const defaults = globalThis.WRSettings.DEFAULTS;
  const button = document.querySelector("#activationButton");
  let enabled = defaults.enabled;

  function render(value) {
    enabled = Boolean(value);
    document.body.classList.toggle("is-paused", !enabled);
    document.querySelector("#activationTitle").textContent = enabled ? "Refined is active" : "Refined is paused";
    document.querySelector("#activationHelp").textContent = enabled
      ? "Your layout and privacy preferences are applied."
      : "Activate it to restore your saved interface preferences.";
    button.textContent = enabled ? "Pause Refined" : "Activate Refined";
    button.setAttribute("aria-pressed", String(enabled));
    document.querySelector("#stateDot").title = enabled ? "Active" : "Paused";
  }

  function read() {
    if (!storage) {
      render(enabled);
      return;
    }
    storage.get(["enabled"], (values) => render(values.enabled ?? defaults.enabled));
  }

  button.addEventListener("click", () => {
    const next = !enabled;
    render(next);
    storage?.set({ enabled: next });
  });

  globalThis.chrome?.storage?.onChanged?.addListener((changes, area) => {
    if (area === "local" && changes.enabled) render(changes.enabled.newValue ?? defaults.enabled);
  });

  const version = globalThis.chrome?.runtime?.getManifest?.().version;
  if (version) document.querySelector("#version").textContent = `v${version}`;
  read();
})();
