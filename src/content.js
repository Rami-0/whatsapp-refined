(function initRefinedWhatsAppWeb() {
  "use strict";

  if (window.top !== window || window.__refinedWhatsAppWebLoaded) return;
  window.__refinedWhatsAppWebLoaded = true;

  const utils = globalThis.WRUtils;
  const { DEFAULTS, normalizeSettings } = globalThis.WRSettings;
  const MIN_SIDEBAR_WIDTH = 360;
  const MAX_SIDEBAR_WIDTH = 620;

  const ICONS = Object.freeze({
    all: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 6.5A2.5 2.5 0 0 1 7.5 4h9A2.5 2.5 0 0 1 19 6.5v6A2.5 2.5 0 0 1 16.5 15H11l-4 3v-3.2a2.5 2.5 0 0 1-2-2.3v-6Z"/><path d="M8.5 8.5h7M8.5 11.5h4.5"/></svg>',
    unread: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6.5A2.5 2.5 0 0 1 6.5 4h11A2.5 2.5 0 0 1 20 6.5v10a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 16.5v-10Z"/><path d="m5 7 7 5 7-5"/><circle cx="18" cy="5" r="2.8" class="wr-icon-fill"/></svg>',
    favourites: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 3 2.7 5.5 6 .9-4.35 4.23 1.03 5.98L12 16.8l-5.38 2.81 1.03-5.98L3.3 9.4l6-.9L12 3Z"/></svg>',
    groups: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="8.5" cy="8" r="3"/><circle cx="17" cy="9" r="2.25"/><path d="M3 19c.35-4 2.2-6 5.5-6s5.15 2 5.5 6M14 14.2c3.6-.65 6 1 6.4 4.3"/></svg>',
    custom: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7.5A2.5 2.5 0 0 1 6.5 5h3l2 2h6A2.5 2.5 0 0 1 20 9.5v8a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 17.5v-10Z"/></svg>',
    lists: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 6h10M5 12h8M5 18h6"/><path d="M18 13v7M14.5 16.5h7"/></svg>',
    settings: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h10M18 7h2M4 17h2M10 17h10M14 4v6M7 14v6"/></svg>',
    privacy: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 4.5 6v5.2c0 4.7 3 8.2 7.5 9.8 4.5-1.6 7.5-5.1 7.5-9.8V6L12 3Z"/><path d="m8 12 2.4 2.4L16.5 8"/></svg>'
  });

  let settings = { ...DEFAULTS };
  let folderNav = null;
  let sidebarActions = null;
  let privacyAction = null;
  let settingsAction = null;
  let drawer = null;
  let resizer = null;
  let refreshTimer = null;
  let observer = null;
  let folderObserver = null;
  let observedTablist = null;
  let lastFolderSignature = "";
  let actionAnchorCleanup = null;
  let folderSyncTimers = [];

  function storageGet() {
    return new Promise((resolve) => {
      if (!globalThis.chrome?.storage?.local) return resolve({ ...DEFAULTS });
      try {
        chrome.storage.local.get(null, (values) => resolve(normalizeSettings(values)));
      } catch (_error) {
        resolve({ ...DEFAULTS });
      }
    });
  }

  function storageSet(values) {
    /* After an extension reload this orphaned script can no longer reach
       chrome.storage — calls throw "Extension context invalidated". */
    try {
      if (globalThis.chrome?.storage?.local) chrome.storage.local.set(values);
    } catch (_error) {}
  }

  function iconMarkup(kind) {
    return ICONS[kind] || ICONS.custom;
  }

  function createButton(className, label, icon) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = className;
    button.dataset.wrTooltip = label;
    button.setAttribute("aria-label", label);
    button.innerHTML = icon;
    return button;
  }

  const TOOLTIP_DELAY_MS = 380;
  let tooltip = null;
  let tooltipTimer = null;
  let tooltipTarget = null;

  function hideTooltip() {
    window.clearTimeout(tooltipTimer);
    tooltipTimer = null;
    tooltipTarget = null;
    if (tooltip) tooltip.dataset.visible = "false";
  }

  function showTooltip(target) {
    const label = target.dataset.wrTooltip;
    if (!label || !target.isConnected) return;
    if (!tooltip?.isConnected) {
      tooltip = document.createElement("div");
      tooltip.id = "wr-tooltip";
      tooltip.setAttribute("role", "tooltip");
      document.body.append(tooltip);
    }
    tooltip.textContent = label;
    const rect = target.getBoundingClientRect();
    const size = tooltip.getBoundingClientRect();
    let left = rect.right + 10;
    let top = rect.top + (rect.height - size.height) / 2;
    if (target.dataset.wrTooltipPosition === "below") {
      left = rect.left + (rect.width - size.width) / 2;
      top = rect.bottom + 8;
    }
    tooltip.style.left = `${Math.round(Math.max(8, Math.min(window.innerWidth - size.width - 8, left)))}px`;
    tooltip.style.top = `${Math.round(Math.max(8, Math.min(window.innerHeight - size.height - 8, top)))}px`;
    tooltip.dataset.visible = "true";
  }

  function onTooltipOver(event) {
    const target = event.target.closest?.("[data-wr-tooltip]");
    if (!target || target === tooltipTarget) return;
    hideTooltip();
    tooltipTarget = target;
    tooltipTimer = window.setTimeout(() => showTooltip(target), TOOLTIP_DELAY_MS);
  }

  function onTooltipOut(event) {
    if (tooltipTarget && !tooltipTarget.contains(event.relatedTarget)) hideTooltip();
  }

  function onTooltipFocus(event) {
    const target = event.target.closest?.("[data-wr-tooltip]");
    if (!target || !target.matches(":focus-visible")) return;
    hideTooltip();
    tooltipTarget = target;
    showTooltip(target);
  }

  function togglePrivacy() {
    settings.privacyEnabled = !settings.privacyEnabled;
    applySettings();
    storageSet({ privacyEnabled: settings.privacyEnabled });
  }

  function toggleDrawer(force) {
    if (!drawer) return;
    const open = typeof force === "boolean" ? force : drawer.getAttribute("aria-hidden") === "true";
    drawer.setAttribute("aria-hidden", String(!open));
    document.documentElement.dataset.wrSettingsOpen = String(open);
    settingsAction?.setAttribute("aria-pressed", String(open));
  }

  function createSidebarUI() {
    folderNav = document.createElement("nav");
    folderNav.id = "wr-folder-sidebar";
    folderNav.setAttribute("aria-label", "WhatsApp chat folders");

    sidebarActions = document.createElement("div");
    sidebarActions.id = "wr-sidebar-actions";
    sidebarActions.setAttribute("aria-label", "Refined WhatsApp™ Web tools");

    privacyAction = createButton("wr-sidebar-action wr-sidebar-action--privacy", "Toggle privacy mode", iconMarkup("privacy") + '<span>Privacy</span>');
    privacyAction.disabled = !settings.enabled;
    privacyAction.setAttribute("aria-disabled", String(!settings.enabled));
    privacyAction.setAttribute("aria-pressed", String(settings.privacyEnabled));
    privacyAction.addEventListener("click", togglePrivacy);

    settingsAction = createButton("wr-sidebar-action", "Open Refined settings", iconMarkup("settings") + '<span>Settings</span>');
    settingsAction.setAttribute("aria-pressed", "false");
    settingsAction.addEventListener("click", () => toggleDrawer());
    sidebarActions.append(privacyAction, settingsAction);
  }

  function createDrawer() {
    drawer = document.createElement("aside");
    drawer.id = "wr-settings-drawer";
    drawer.setAttribute("aria-label", "Refined WhatsApp™ Web settings");
    drawer.setAttribute("aria-hidden", "true");

    const close = createButton("wr-drawer-close", "Close Refined settings", '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m7 7 10 10M17 7 7 17"/></svg>');
    close.dataset.wrTooltipPosition = "below";
    close.addEventListener("click", () => toggleDrawer(false));

    const frame = document.createElement("iframe");
    frame.className = "wr-settings-frame";
    frame.title = "Refined WhatsApp™ Web settings";
    const dark = document.documentElement.classList.contains("dark") || document.body.classList.contains("dark");
    const settingsPage = globalThis.chrome?.runtime?.getURL ? chrome.runtime.getURL("popup/popup.html") : "../popup/popup.html";
    const previewSnapshot = location.protocol === "file:" ? `&previewSettings=${encodeURIComponent(JSON.stringify(settings))}` : "";
    frame.src = `${settingsPage}?embedded=1&theme=${dark ? "dark" : "light"}${previewSnapshot}`;
    drawer.append(close, frame);
    document.body.append(drawer);
  }

  function setSidebarWidth(value, persist = false) {
    settings.sidebarWidth = Math.round(Math.min(MAX_SIDEBAR_WIDTH, Math.max(MIN_SIDEBAR_WIDTH, Number(value) || DEFAULTS.sidebarWidth)));
    document.documentElement.style.setProperty("--wr-sidebar-width", `${settings.sidebarWidth}px`);
    if (resizer) resizer.setAttribute("aria-valuenow", String(settings.sidebarWidth));
    if (persist) storageSet({ sidebarWidth: settings.sidebarWidth });
  }

  function createResizer() {
    resizer = document.createElement("div");
    resizer.id = "wr-sidebar-resizer";
    resizer.tabIndex = 0;
    resizer.setAttribute("role", "separator");
    resizer.setAttribute("aria-orientation", "vertical");
    resizer.setAttribute("aria-label", "Resize chat panel");
    resizer.setAttribute("aria-valuemin", String(MIN_SIDEBAR_WIDTH));
    resizer.setAttribute("aria-valuemax", String(MAX_SIDEBAR_WIDTH));
    resizer.setAttribute("aria-valuenow", String(settings.sidebarWidth));
    resizer.innerHTML = '<span aria-hidden="true"></span>';

    resizer.addEventListener("pointerdown", (event) => {
      if (!settings.enabled || !settings.customSidebarWidth || event.button !== 0) return;
      event.preventDefault();
      const shell = resizer.parentElement;
      const startX = event.clientX;
      const startWidth = shell?.getBoundingClientRect().width || settings.sidebarWidth;
      document.documentElement.dataset.wrResizing = "true";
      resizer.setPointerCapture?.(event.pointerId);

      const move = (moveEvent) => setSidebarWidth(startWidth + moveEvent.clientX - startX);
      const finish = (finishEvent) => {
        if (resizer.hasPointerCapture?.(finishEvent.pointerId)) resizer.releasePointerCapture(finishEvent.pointerId);
        resizer.removeEventListener("pointermove", move);
        resizer.removeEventListener("pointerup", finish);
        resizer.removeEventListener("pointercancel", finish);
        delete document.documentElement.dataset.wrResizing;
        setSidebarWidth(settings.sidebarWidth, true);
      };
      resizer.addEventListener("pointermove", move);
      resizer.addEventListener("pointerup", finish);
      resizer.addEventListener("pointercancel", finish);
    });

    resizer.addEventListener("keydown", (event) => {
      const step = event.shiftKey ? 32 : 8;
      const widths = { ArrowLeft: settings.sidebarWidth - step, ArrowRight: settings.sidebarWidth + step, Home: MIN_SIDEBAR_WIDTH, End: MAX_SIDEBAR_WIDTH };
      if (!(event.key in widths)) return;
      event.preventDefault();
      event.stopPropagation();
      setSidebarWidth(widths[event.key], true);
    });

    resizer.addEventListener("dblclick", () => setSidebarWidth(DEFAULTS.sidebarWidth, true));
  }

  /* Labels carry unread counts ("Channels, 3 unread") and get renamed between
     WhatsApp releases, so each entry also matches on WhatsApp's icon names. */
  const NAV_TARGETS = Object.freeze([
    { key: "metaAI", label: /^(?:ask )?meta ai\b/i, icon: /meta-?ai/i, slotClass: "wr-meta-ai-slot" },
    { key: "channels", label: /^(?:channels|updates)\b/i, icon: /newsletter|channel/i, slotClass: "wr-channels-slot" }
  ]);

  const NAV_SLOT_CLASSES = ["wr-hidden-nav-slot", "wr-native-nav-divider", ...NAV_TARGETS.map((target) => target.slotClass)];
  /* Anything a rail entry can be made of. A divider is what is left over: a
     rule element, or a wrapper holding neither text nor any of this. */
  const NAV_CONTENT = 'a, button, input, svg, img, canvas, [role="button"], [role="link"], [data-icon]';

  function nativeNavButtons(section) {
    return Array.from(section.querySelectorAll('button, [role="button"]')).filter((button) => !folderNav?.contains(button) && !sidebarActions?.contains(button));
  }

  /* WhatsApp wraps each rail entry in its own row, but the depth varies and a
     row can hold siblings of the button (the unread badge). Walk up while the
     ancestor still wraps this one entry so those siblings travel with it. */
  function findNativeNavSlot(button, buttons, section) {
    let slot = button;
    while (slot.parentElement && slot.parentElement !== section && buttons.filter((item) => slot.parentElement.contains(item)).length === 1) {
      slot = slot.parentElement;
    }
    return slot;
  }

  function navIconSignature(button) {
    const icons = Array.from(button.querySelectorAll("[data-icon]"), (node) => node.getAttribute("data-icon") || "");
    const titles = Array.from(button.querySelectorAll("title"), (node) => node.textContent || "");
    return [...icons, ...titles].join(" ");
  }

  function matchesNavTarget(button, target) {
    const label = (button.getAttribute("aria-label") || button.getAttribute("title") || "").trim();
    return target.label.test(label) || target.icon.test(navIconSignature(button));
  }

  function syncNativeNavSlots() {
    document.querySelectorAll(`.${NAV_SLOT_CLASSES.join(", .")}`).forEach((node) => node.classList.remove(...NAV_SLOT_CLASSES));
    const primary = document.querySelector('[data-testid="navbar-primary-section"]');
    if (!primary || !settings.enabled) return;

    const hidden = { metaAI: settings.hideMetaAI, channels: settings.hideChannels };
    const slots = new Set();

    /* Meta AI has moved between the rail's sections across releases, so look
       for the entries in both rather than assuming where they live. */
    [primary, document.querySelector('[data-testid="navbar-footer-section"]')].forEach((section) => {
      if (!section) return;
      const sectionButtons = nativeNavButtons(section);
      sectionButtons.forEach((button) => {
        const target = NAV_TARGETS.find((entry) => matchesNavTarget(button, entry));
        if (!target) return;
        const slot = findNativeNavSlot(button, sectionButtons, section);
        slots.add(slot);
        slot.classList.add(hidden[target.key] ? "wr-hidden-nav-slot" : target.slotClass);
      });
    });

    /* The rail draws its own rule above the folder list, so WhatsApp's divider
       would leave whatever follows it (Meta AI) boxed between two lines. */
    const buttons = nativeNavButtons(primary);
    const host = buttons.length ? findNativeNavSlot(buttons[0], buttons, primary).parentElement : null;
    if (!host) return;
    Array.from(host.children).forEach((child) => {
      if (slots.has(child) || child === folderNav || child.querySelector(NAV_CONTENT)) return;
      if (child.matches('hr, [role="separator"]') || !child.textContent.trim()) child.classList.add("wr-native-nav-divider");
    });
  }

  function ensureUI() {
    const side = document.querySelector("#side");
    if (!side) return null;
    const shell = side.parentElement;
    if (!shell) return null;
    shell.classList.add("wr-chat-shell");

    if (!folderNav || !sidebarActions) createSidebarUI();
    if (!drawer) createDrawer();
    if (!resizer) createResizer();
    if (resizer.parentElement !== shell) shell.append(resizer);

    const nativeRail = Array.from(document.querySelectorAll('header[data-testid="chatlist-header"]')).find((header) => header.getBoundingClientRect().width <= 82);
    const primary = nativeRail?.querySelector('[data-testid="navbar-primary-section"]');
    const footer = nativeRail?.querySelector('[data-testid="navbar-footer-section"]');
    if (nativeRail && primary && footer) {
      nativeRail.classList.add("wr-native-navigation");
      primary.classList.add("wr-native-folder-host");
      if (folderNav.parentElement !== primary) primary.append(folderNav);
      const footerHost = footer.firstElementChild || footer;
      if (sidebarActions.parentElement !== footerHost) footerHost.prepend(sidebarActions);
    }

    const closeNotification = side.querySelector('button[aria-label="Close"]');
    if (closeNotification) {
      let banner = closeNotification;
      while (banner.parentElement && banner.parentElement !== side) banner = banner.parentElement;
      if (banner.parentElement === side) banner.classList.add("wr-notification-banner");
    }

    syncNativeNavSlots();
    return { side, shell };
  }

  function readFolders(side) {
    const tablist = side.querySelector('[role="tablist"][aria-label="chat-list-filters"]');
    if (!tablist) return [];
    tablist.classList.add("wr-native-filter-strip");
    if (observedTablist !== tablist) {
      folderObserver?.disconnect();
      observedTablist = tablist;
      folderObserver = new MutationObserver(scheduleRefresh);
      folderObserver.observe(tablist, {
        subtree: true,
        childList: true,
        characterData: true,
        attributes: true,
        attributeFilter: ["aria-selected", "aria-label"]
      });
    }

    return utils.uniqueFolders(Array.from(tablist.querySelectorAll('[role="tab"]')).map((element) => {
      const leafTexts = Array.from(element.querySelectorAll("span"))
        .filter((span) => span.children.length === 0 && span.getAttribute("aria-hidden") !== "true")
        .map((span) => span.textContent);
      const rawLabel = (element.getAttribute("aria-label") || element.innerText || element.textContent || "").replace(/\s+/g, " ").trim();
      const parsed = utils.parseFolderTab(leafTexts, rawLabel);
      const label = parsed.action ? "Lists" : parsed.label;
      return {
        label: label.slice(0, 48), count: parsed.count,
        kind: parsed.action ? "lists" : utils.folderKind(label),
        action: parsed.action, element,
        selected: element.getAttribute("aria-selected") === "true"
      };
    }).filter((folder) => folder.label)).slice(0, 12);
  }

  function folderIcon(folder) {
    const wrap = document.createElement("span");
    wrap.className = `wr-folder-icon wr-folder-icon--${folder.kind}`;
    wrap.innerHTML = iconMarkup(folder.kind);
    if (folder.kind === "custom") {
      const initial = document.createElement("b");
      initial.textContent = utils.folderInitial(folder.label);
      wrap.append(initial);
    }
    return wrap;
  }

  function openNativeFolderAction(folder, proxyButton) {
    actionAnchorCleanup?.();
    const tablist = folder.element.closest('[role="tablist"]');
    if (!tablist) {
      folder.element.click();
      return;
    }

    const rect = proxyButton.getBoundingClientRect();
    const root = document.documentElement;
    const visibleMenusBeforeClick = new Set(Array.from(document.querySelectorAll('[role="menu"]')).filter((element) => element.getBoundingClientRect().width > 0));
    let menuWatcher = null;
    let positionWatcher = null;
    let menuPositioner = null;
    let positionFrame = null;
    let fallbackTimer = null;
    const cleanup = () => {
      tablist.classList.remove("wr-native-action-anchor");
      folder.element.classList.remove("wr-native-action-tab");
      menuPositioner?.classList.remove("wr-lists-menu-positioner");
      menuPositioner?.style.removeProperty("--wr-lists-menu-left");
      menuPositioner?.style.removeProperty("--wr-lists-menu-top");
      tablist.style.removeProperty("--wr-action-left");
      tablist.style.removeProperty("--wr-action-top");
      delete root.dataset.wrPositioningLists;
      menuWatcher?.disconnect();
      positionWatcher?.disconnect();
      window.cancelAnimationFrame(positionFrame);
      window.clearTimeout(fallbackTimer);
      if (actionAnchorCleanup === cleanup) actionAnchorCleanup = null;
    };
    actionAnchorCleanup = cleanup;

    const positionMenu = () => {
      if (menuPositioner) return true;
      const menu = Array.from(document.querySelectorAll('[role="menu"]')).find((element) =>
        !visibleMenusBeforeClick.has(element) && element.getBoundingClientRect().width > 0
      );
      if (!menu) return false;

      menuPositioner = menu;
      while (menuPositioner.parentElement && menuPositioner.parentElement !== document.body && !["absolute", "fixed"].includes(getComputedStyle(menuPositioner).position)) {
        menuPositioner = menuPositioner.parentElement;
      }
      if (!["absolute", "fixed"].includes(getComputedStyle(menuPositioner).position)) menuPositioner = menu;
      const menuRect = menuPositioner.getBoundingClientRect();
      const left = Math.min(window.innerWidth - menuRect.width - 8, rect.right + 8);
      const top = Math.min(window.innerHeight - menuRect.height - 8, Math.max(8, rect.top));
      menuPositioner.style.setProperty("--wr-lists-menu-left", `${Math.max(8, Math.round(left))}px`);
      menuPositioner.style.setProperty("--wr-lists-menu-top", `${Math.max(8, Math.round(top))}px`);
      menuPositioner.classList.add("wr-lists-menu-positioner");

      positionWatcher?.disconnect();
      delete root.dataset.wrPositioningLists;
      menuWatcher = new MutationObserver(() => {
        if (!menu.isConnected || menu.getBoundingClientRect().width === 0) cleanup();
      });
      menuWatcher.observe(document.body, { attributes: true, childList: true, subtree: true });
      return true;
    };

    tablist.style.setProperty("--wr-action-left", `${Math.round(rect.left)}px`);
    tablist.style.setProperty("--wr-action-top", `${Math.round(rect.top)}px`);
    tablist.classList.add("wr-native-action-anchor");
    folder.element.classList.add("wr-native-action-tab");
    root.dataset.wrPositioningLists = "true";
    positionWatcher = new MutationObserver(positionMenu);
    positionWatcher.observe(document.body, { attributes: true, childList: true, subtree: true });
    folder.element.click();
    positionFrame = window.requestAnimationFrame(() => {
      if (!positionMenu()) positionFrame = window.requestAnimationFrame(positionMenu);
    });
    fallbackTimer = window.setTimeout(cleanup, 10000);
  }

  function renderFolders(folders) {
    const signature = folders.map((folder) => `${folder.label}:${folder.count}:${folder.selected}`).join("|");
    if (!folderNav || signature === lastFolderSignature) return;
    lastFolderSignature = signature;
    hideTooltip();
    folderNav.replaceChildren();

    folders.forEach((folder, index) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "wr-folder-button";
      if (folder.action) button.classList.add("wr-folder-button--action");
      button.dataset.wrTooltip = folder.label;
      button.setAttribute("aria-label", folder.action ? "Open lists menu" : folder.count ? `${folder.label}, ${folder.count} unread` : folder.label);
      button.setAttribute("aria-current", !folder.action && (folder.selected || (!folders.some((item) => item.selected) && index === 0)) ? "page" : "false");

      const label = document.createElement("span");
      label.className = "wr-folder-label";
      label.textContent = folder.label;
      button.append(folderIcon(folder), label);
      if (folder.count) {
        const badge = document.createElement("span");
        badge.className = "wr-folder-badge";
        badge.textContent = folder.count;
        button.append(badge);
      }
      button.addEventListener("click", () => {
        if (folder.action) openNativeFolderAction(folder, button);
        else {
          actionAnchorCleanup?.();
          folder.element.click();
        }
        window.setTimeout(scheduleRefresh, 80);
      });
      folderNav.append(button);
    });
  }

  function applySettings() {
    settings = normalizeSettings(settings);
    const root = document.documentElement;
    const attributes = {
      wrEnabled: settings.enabled,
      wrFolderLayout: settings.folderLayout,
      wrCustomWidth: settings.customSidebarWidth,
      wrShowPreviews: settings.showPreviews,
      wrHideNotification: settings.hideNotificationBanner,
      wrHideMetaAi: settings.hideMetaAI,
      wrHideChannels: settings.hideChannels,
      wrPrivacy: settings.privacyEnabled,
      wrBlurPreviews: settings.blurPreviews,
      wrBlurMessages: settings.blurMessages,
      wrBlurImages: settings.blurImages,
      wrBlurVideos: settings.blurVideos,
      wrBlurNames: settings.blurNames,
      wrBlurAvatars: settings.blurAvatars,
      wrRevealOnHover: settings.revealOnHover
    };
    Object.entries(attributes).forEach(([key, value]) => { root.dataset[key] = String(value); });
    setSidebarWidth(settings.sidebarWidth);
    root.style.setProperty("--wr-privacy-blur", `${settings.blurStrength}px`);
    privacyAction?.setAttribute("aria-pressed", String(settings.privacyEnabled));
    if (privacyAction) {
      privacyAction.disabled = !settings.enabled;
      privacyAction.setAttribute("aria-disabled", String(!settings.enabled));
    }
    resizer?.setAttribute("aria-disabled", String(!settings.customSidebarWidth || !settings.enabled));
    syncNativeNavSlots();
  }

  function refresh() {
    refreshTimer = null;
    const ui = ensureUI();
    document.documentElement.dataset.wrReady = String(Boolean(ui));
    if (!ui) return;
    renderFolders(readFolders(ui.side));
  }

  function scheduleRefresh() {
    if (refreshTimer) return;
    refreshTimer = window.setTimeout(refresh, 180);
  }

  function startFolderSyncBurst() {
    folderSyncTimers.forEach((timer) => window.clearTimeout(timer));
    folderSyncTimers = [0, 260, 720, 1500, 3000].map((delay) => window.setTimeout(scheduleRefresh, delay));
  }

  function cycleFolders(direction) {
    const side = document.querySelector("#side");
    if (!side) return;
    const folders = readFolders(side).filter((folder) => !folder.action);
    if (!folders.length) return;
    const current = folders.findIndex((folder) => folder.selected);
    const next = (Math.max(0, current) + direction + folders.length) % folders.length;
    folders[next].element.click();
    window.setTimeout(scheduleRefresh, 80);
  }

  function onShortcut(event) {
    if (event.key === "Escape" && drawer?.getAttribute("aria-hidden") === "false") {
      toggleDrawer(false);
      return;
    }
    if (!settings.enabled || !settings.keyboardShortcuts || event.isComposing) return;

    const platform = utils.desktopPlatform(navigator);
    const modifier = platform === "mac" ? event.metaKey : event.ctrlKey;
    const refinedChord = modifier && event.altKey && !event.shiftKey;
    const legacyPrivacyChord = event.altKey && event.shiftKey && event.code === "KeyP" && !modifier;
    if (!refinedChord && !legacyPrivacyChord) return;

    let handled = true;
    if (legacyPrivacyChord || event.code === "KeyP") togglePrivacy();
    else if (event.code === "KeyK") {
      const search = document.querySelector('#side [role="textbox"]');
      search?.click();
      search?.focus();
    } else if (event.code === "KeyN") document.querySelector('button[aria-label="New chat"]')?.click();
    else if (event.code === "ArrowLeft") cycleFolders(-1);
    else if (event.code === "ArrowRight") cycleFolders(1);
    else if (event.code === "Comma") toggleDrawer();
    else handled = false;

    if (handled) {
      event.preventDefault();
      event.stopPropagation();
    }
  }

  async function start() {
    settings = await storageGet();
    applySettings();
    refresh();
    startFolderSyncBurst();
    document.addEventListener("keydown", onShortcut, true);
    document.addEventListener("pointerover", onTooltipOver, true);
    document.addEventListener("pointerout", onTooltipOut, true);
    document.addEventListener("focusin", onTooltipFocus, true);
    document.addEventListener("focusout", onTooltipOut, true);
    document.addEventListener("pointerdown", hideTooltip, true);
    document.addEventListener("scroll", hideTooltip, { capture: true, passive: true });
    document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") startFolderSyncBurst(); });
    window.addEventListener("focus", startFolderSyncBurst);
    window.addEventListener("resize", scheduleRefresh, { passive: true });

    window.setInterval(() => {
      if (document.visibilityState === "visible" && settings.enabled && settings.folderLayout === "sidebar") scheduleRefresh();
    }, 2000);

    observer = new MutationObserver(scheduleRefresh);
    observer.observe(document.body, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["aria-selected", "aria-label"]
    });

    globalThis.chrome?.storage?.onChanged?.addListener((changes, area) => {
      if (area !== "local") return;
      Object.entries(changes).forEach(([key, change]) => { settings[key] = change.newValue; });
      applySettings();
      scheduleRefresh();
      if (changes.folderLayout || changes.enabled) startFolderSyncBurst();
    });
  }

  if (document.body) start();
  else document.addEventListener("DOMContentLoaded", start, { once: true });
})();
