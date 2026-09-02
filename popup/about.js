(function initAboutPopup() {
  "use strict";

  const storage = globalThis.chrome?.storage?.local;
  const runtime = globalThis.chrome?.runtime;
  const defaults = globalThis.WRSettings.DEFAULTS;
  const t = globalThis.WRUtils.i18n;
  const button = document.querySelector("#activationButton");
  const chip = document.querySelector("#updateChip");
  const updateCard = document.querySelector("#updateCard");
  const updateButton = document.querySelector("#updateButton");

  /* Chrome throttles requestUpdateCheck to a handful of calls per hour, so the
     last answer is cached and only refreshed a few times a day. */
  const CACHE_KEY = "updateCheck";
  const RECHECK_AFTER_MS = 6 * 60 * 60 * 1000;
  const currentVersion = runtime?.getManifest?.().version || "0";
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

  /* Compares dotted-integer extension versions: 1 if a is newer, -1 if older, 0 if equal. */
  function compareVersions(a, b) {
    const left = String(a).split(".");
    const right = String(b).split(".");
    for (let i = 0; i < Math.max(left.length, right.length); i += 1) {
      const diff = (Number(left[i]) || 0) - (Number(right[i]) || 0);
      if (diff) return Math.sign(diff);
    }
    return 0;
  }

  /* Asks Chrome's own updater whether the Web Store has a newer build. This needs
     no host permission, so the popup keeps its "WhatsApp Web only" promise.
     Resolves null when the answer is unusable — unpacked builds, for instance,
     have no update URL to ask about. */
  function requestUpdateCheck() {
    return new Promise((resolve) => {
      if (!runtime?.requestUpdateCheck) return resolve(null);
      /* Chrome 109+ resolves a single { status, version } object; older builds
         invoke the callback as (status, details). Accept either shape. */
      const settle = (first, second) => {
        void runtime.lastError;
        if (typeof first === "string") return resolve({ status: first, version: second?.version || null });
        resolve(first?.status ? { status: first.status, version: first.version || null } : null);
      };
      try {
        const pending = runtime.requestUpdateCheck(settle);
        if (pending?.then) pending.then(settle, () => resolve(null));
      } catch (_error) {
        resolve(null);
      }
    });
  }

  /* Turns a cached or fresh check into what the popup shows. `chip` is the badge
     beside the version number, `card` the restart prompt (null to hide it). */
  function describeUpdateState(entry) {
    if (entry?.status === "update_available") {
      /* Chrome applies updates on its own schedule, so a remembered
         "update_available" can name a version that is already running. */
      const applied = entry.version && compareVersions(entry.version, currentVersion) <= 0;
      if (applied) return { chip: "Up to date", tone: "good", card: null };
      return {
        chip: "Update ready",
        tone: "ready",
        card: {
          title: entry.version ? `Version ${entry.version} is ready` : "An update is ready",
          help: "Chrome downloaded it. Restart, then refresh open WhatsApp tabs."
        }
      };
    }
    if (entry?.status === "no_update") return { chip: "Up to date", tone: "good", card: null };
    if (entry?.status === "checking") return { chip: "Checking…", tone: "idle", card: null };
    /* "throttled", a development build, or no answer at all: say nothing rather
       than claim a state we cannot vouch for. */
    return { chip: null, tone: "idle", card: null };
  }

  function renderUpdate(entry) {
    const state = describeUpdateState(entry);
    chip.hidden = !state.chip;
    if (state.chip) {
      chip.textContent = state.chip;
      chip.dataset.tone = state.tone;
    }
    updateCard.hidden = !state.card;
    if (state.card) {
      document.querySelector("#updateTitle").textContent = state.card.title;
      document.querySelector("#updateHelp").textContent = state.card.help;
    }
  }

  function readCachedCheck() {
    return new Promise((resolve) => {
      if (!storage) return resolve(null);
      try {
        storage.get([CACHE_KEY], (values) => resolve(values?.[CACHE_KEY] || null));
      } catch (_error) {
        resolve(null);
      }
    });
  }

  async function refreshUpdateState() {
    const cached = await readCachedCheck();
    const stale = !cached || !(Date.now() - cached.at < RECHECK_AFTER_MS);
    renderUpdate(stale ? { status: "checking" } : cached);
    if (!stale) return;

    const result = await requestUpdateCheck();
    if (!result) return renderUpdate(null);
    const entry = { status: result.status, version: result.version, at: Date.now() };
    /* A throttled answer carries no information, so it must not reset the clock. */
    if (entry.status !== "throttled") {
      try {
        storage?.set({ [CACHE_KEY]: entry });
      } catch (_error) {}
    }
    renderUpdate(entry);
  }

  updateButton.addEventListener("click", () => {
    try {
      runtime?.reload();
    } catch (_error) {}
  });

  if (runtime?.getManifest) document.querySelector("#version").textContent = `v${currentVersion}`;
  (globalThis.WRLocaleReady || Promise.resolve()).then(read);
  refreshUpdateState();
})();
