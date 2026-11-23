(function initPalette(global) {
  "use strict";

  /* Refined's command palette on Cmd+K (Ctrl+K off macOS). WhatsApp uses the
     same key for its "Extended Search", so Refined listens on window in the
     capture phase, which runs before WhatsApp's own handler, and stops it.
     Cmd+Shift+K hands the key back: Refined re-dispatches a plain Cmd+K that
     it lets through, and WhatsApp's search opens as before. Verified on the
     live client: blocking works and a synthetic Cmd+K opens WhatsApp's. */

  const RECENT_KEY = "refinedRecentChats";
  const RECENT_LIMIT = 20;
  const MAX_RESULTS = 9;

  function create({ t, utils, chats, settings, shelf, actions }) {
    let dialog = null;
    let input = null;
    let list = null;
    let items = [];
    let active = 0;
    let passThrough = false;
    let recent = [];
    let lastOpen = "";

    /* Part of Refined's shortcuts: one switch turns every Refined key off. */
    const enabled = () => settings().enabled && settings().keyboardShortcuts;
    const isMac = () => utils.desktopPlatform(navigator) === "mac";

    function storage() {
      try {
        return globalThis.chrome?.storage?.local || null;
      } catch (_error) {
        return null;
      }
    }

    function loadRecent() {
      try {
        storage()?.get([RECENT_KEY], (values) => {
          recent = Array.isArray(values?.[RECENT_KEY]) ? values[RECENT_KEY] : [];
        });
      } catch (_error) {}
    }

    /* Remembers the chats the user opens, newest first, so an empty palette
       lists them and a query ranks them up. */
    function trackOpenChat() {
      /* Off means off: nothing is recorded, and what was is cleared. */
      if (!enabled()) {
        if (recent.length) {
          recent = [];
          try {
            storage()?.remove(RECENT_KEY);
          } catch (_error) {}
        }
        lastOpen = "";
        return;
      }
      const name = chats.openChatName();
      if (!name || name === lastOpen) return;
      lastOpen = name;
      recent = [name, ...recent.filter((item) => item !== name)].slice(0, RECENT_LIMIT);
      try {
        storage()?.set({ [RECENT_KEY]: recent });
      } catch (_error) {}
    }

    /* ---------- the command list ---------- */

    function chatCandidates() {
      const names = new Map();
      const add = (name, source) => {
        if (name && !names.has(name)) names.set(name, source);
      };
      recent.forEach((name) => add(name, "recent"));
      (shelf?.pins() || []).forEach((pin) => add(pin.name, "pinned"));
      chats.readRows().forEach((row) => add(row.name, "list"));
      return Array.from(names, ([name, source]) => ({
        group: t("paletteChats", "Chats"),
        label: name,
        hint: source === "pinned" ? t("shelfPinned", "Pinned") : "",
        icon: "chat",
        run: () => chats.openChat(name)
      }));
    }

    function commandCandidates() {
      const open = chats.openChatName();
      const list = [];
      const group = t("paletteActions", "Actions");
      const unread = chats.readRows().find((row) => row.unread > 0 && row.name !== open);
      if (unread) list.push({ group, label: t("paletteNextUnread", "Open next unread chat"), hint: unread.name, icon: "unread", run: () => chats.openChat(unread.name) });
      if (open && settings().pinsEnabled && shelf) {
        const pinned = shelf.isPinned(open);
        list.push({ group, label: pinned ? t("paletteUnpinOpen", "Unpin this chat") : t("palettePinOpen", "Pin this chat"), hint: open, icon: "pin", run: () => shelf.togglePin(open) });
      }
      if (open && settings().remindersEnabled && shelf) {
        const language = utils.uiLanguage(settings().language);
        utils.reminderPresets(new Date(), settings().reminderPresets).forEach((preset) => {
          const label = utils.presetLabel(preset, language, t("remindTomorrow", "Tomorrow"));
          list.push({ group, label: `${t("remindMe", "Remind me")}: ${label}`, hint: open, icon: "clock", run: () => shelf.remind(open, preset.at) });
        });
      }
      actions.folders().forEach((folder) => {
        list.push({ group: t("paletteFolders", "Folders"), label: folder.label, hint: folder.count ? String(folder.count) : "", icon: "folder", run: folder.open });
      });
      list.push({ group, label: settings().privacyEnabled ? t("palettePrivacyOff", "Turn privacy mode off") : t("palettePrivacyOn", "Turn privacy mode on"), icon: "privacy", run: actions.togglePrivacy });
      if (actions.showMentions) list.push({ group, label: t("paletteMentions", "Show chats that mention me"), icon: "at", run: actions.showMentions });
      list.push({ group, label: t("paletteSettings", "Open Refined settings"), icon: "settings", run: actions.openSettings });
      list.push({ group, label: t("paletteWhatsAppSearch", "Open WhatsApp search"), hint: isMac() ? "⇧⌘K" : "Ctrl+Shift+K", icon: "search", run: openWhatsAppSearch });
      return list;
    }

    function build(query) {
      const q = query.trim();
      const all = [...chatCandidates(), ...commandCandidates()];
      if (!q) {
        const recentChats = all.filter((item) => item.icon === "chat").slice(0, 5);
        const commands = all.filter((item) => item.icon !== "chat" && item.icon !== "folder").slice(0, 4);
        return [...recentChats, ...commands];
      }
      const scored = all
        .map((item) => ({ item, score: utils.fuzzyScore(q, item.label) }))
        .filter((entry) => entry.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, MAX_RESULTS)
        .map((entry) => entry.item);
      /* Chats Refined has not seen (scrolled away, never opened) are still
         one Enter away through WhatsApp's own search. */
      scored.push({ group: t("paletteChats", "Chats"), label: t("paletteSearchFor", `Search WhatsApp for “${q}”`, [q]), icon: "search", run: () => chats.setSearch(q) });
      return scored;
    }

    /* ---------- rendering ---------- */

    const GLYPHS = Object.freeze({
      chat: '<path d="M5 6.5A2.5 2.5 0 0 1 7.5 4h9A2.5 2.5 0 0 1 19 6.5v6A2.5 2.5 0 0 1 16.5 15H11l-4 3v-3.2a2.5 2.5 0 0 1-2-2.3v-6Z"/>',
      unread: '<path d="M4 7h16v11H4z"/><path d="m4.5 7.5 7.5 5.5 7.5-5.5"/>',
      pin: '<path d="M9 4h6l-1 5 3 3v2H7v-2l3-3-1-5Z"/><path d="M12 14v6"/>',
      clock: '<circle cx="12" cy="13" r="7"/><path d="M12 9.5V13l2.5 1.5"/>',
      folder: '<path d="M4 7.5A2.5 2.5 0 0 1 6.5 5h3l2 2h6A2.5 2.5 0 0 1 20 9.5v8a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 17.5v-10Z"/>',
      privacy: '<path d="M12 3 4.5 6v5.2c0 4.7 3 8.2 7.5 9.8 4.5-1.6 7.5-5.1 7.5-9.8V6L12 3Z"/>',
      at: '<circle cx="12" cy="12" r="3.5"/><path d="M15.5 12v1.5a2.5 2.5 0 0 0 5 0V12a8.5 8.5 0 1 0-3.3 6.7"/>',
      settings: '<path d="M4 7h10M18 7h2M4 17h2M10 17h10M14 4v6M7 14v6"/>',
      search: '<circle cx="10.5" cy="10.5" r="6"/><path d="m15 15 5 5"/>'
    });

    function renderList() {
      list.replaceChildren();
      let lastGroup = "";
      items.forEach((item, index) => {
        if (item.group !== lastGroup) {
          lastGroup = item.group;
          const heading = document.createElement("li");
          heading.className = "wr-palette-group";
          heading.setAttribute("role", "presentation");
          heading.textContent = item.group;
          list.append(heading);
        }
        const option = document.createElement("li");
        option.className = "wr-palette-item";
        option.id = `wr-palette-option-${index}`;
        option.setAttribute("role", "option");
        option.setAttribute("aria-selected", String(index === active));
        option.dataset.index = String(index);
        option.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true">${GLYPHS[item.icon] || GLYPHS.chat}</svg><span class="wr-palette-label"></span><span class="wr-palette-hint"></span>`;
        option.querySelector(".wr-palette-label").textContent = item.label;
        option.querySelector(".wr-palette-label").dir = "auto";
        option.querySelector(".wr-palette-hint").textContent = item.hint || "";
        list.append(option);
      });
      if (!items.length) {
        const empty = document.createElement("li");
        empty.className = "wr-palette-empty";
        empty.textContent = t("paletteEmpty", "No matches");
        list.append(empty);
      }
      input.setAttribute("aria-activedescendant", items.length ? `wr-palette-option-${active}` : "");
      list.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: "nearest" });
    }

    function refreshResults() {
      items = build(input.value);
      active = 0;
      renderList();
    }

    function move(delta) {
      if (!items.length) return;
      active = (active + delta + items.length) % items.length;
      list.querySelectorAll('[role="option"]').forEach((node) => node.setAttribute("aria-selected", String(Number(node.dataset.index) === active)));
      input.setAttribute("aria-activedescendant", `wr-palette-option-${active}`);
      list.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: "nearest" });
    }

    function runActive(index = active) {
      const item = items[index];
      if (!item) return;
      close();
      window.setTimeout(() => item.run(), 0);
    }

    function open() {
      if (dialog) {
        input.select();
        return;
      }
      dialog = document.createElement("div");
      dialog.id = "wr-palette";
      dialog.setAttribute("role", "dialog");
      dialog.setAttribute("aria-modal", "true");
      dialog.setAttribute("aria-label", t("paletteTitle", "Refined command palette"));
      const language = utils.uiLanguage(settings().language);
      dialog.lang = language.replace("_", "-");
      dialog.dir = utils.localeDirection(language);
      dialog.innerHTML = '<div class="wr-palette-panel"><div class="wr-palette-field"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6"/><path d="m15 15 5 5"/></svg><input type="text" role="combobox" aria-expanded="true" aria-controls="wr-palette-list" autocomplete="off" spellcheck="false"><kbd></kbd></div><ul id="wr-palette-list" role="listbox"></ul></div>';
      input = dialog.querySelector("input");
      list = dialog.querySelector("ul");
      input.placeholder = t("palettePlaceholder", "Jump to a chat or run a command…");
      input.setAttribute("aria-label", t("palettePlaceholder", "Jump to a chat or run a command…"));
      dialog.querySelector("kbd").textContent = "esc";
      input.addEventListener("input", refreshResults);
      input.addEventListener("keydown", onInputKey);
      list.addEventListener("pointermove", (event) => {
        const option = event.target.closest('[role="option"]');
        if (option && Number(option.dataset.index) !== active) move(Number(option.dataset.index) - active);
      });
      list.addEventListener("click", (event) => {
        const option = event.target.closest('[role="option"]');
        if (option) runActive(Number(option.dataset.index));
      });
      dialog.addEventListener("pointerdown", (event) => {
        if (event.target === dialog) close();
      });
      document.body.append(dialog);
      refreshResults();
      input.focus();
    }

    function close() {
      dialog?.remove();
      dialog = null;
    }

    function onInputKey(event) {
      if (event.isComposing) return;
      if (event.key === "ArrowDown") {
        event.preventDefault();
        move(1);
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        move(-1);
      } else if (event.key === "Enter") {
        event.preventDefault();
        runActive();
      } else if (event.key === "Escape") {
        event.preventDefault();
        close();
      } else if (event.key === "Tab") {
        event.preventDefault();
        move(event.shiftKey ? -1 : 1);
      }
      /* Keep WhatsApp's own shortcuts from firing while typing here. */
      event.stopPropagation();
    }

    /* Re-dispatches a plain Cmd/Ctrl+K that this module lets through, which
       opens WhatsApp's own Extended Search. */
    function openWhatsAppSearch() {
      close();
      passThrough = true;
      const event = new KeyboardEvent("keydown", { key: "k", code: "KeyK", metaKey: isMac(), ctrlKey: !isMac(), bubbles: true, cancelable: true });
      try {
        (document.activeElement || document.body).dispatchEvent(event);
      } finally {
        passThrough = false;
      }
    }

    function onKey(event) {
      if (passThrough || event.code !== "KeyK" || event.altKey || event.isComposing) return;
      const modifier = isMac() ? event.metaKey && !event.ctrlKey : event.ctrlKey && !event.metaKey;
      if (!modifier || !enabled()) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      if (event.shiftKey) openWhatsAppSearch();
      else if (dialog) close();
      else open();
    }

    function start() {
      loadRecent();
      window.addEventListener("keydown", onKey, true);
      window.setInterval(trackOpenChat, 1000);
    }

    return { start, open, close, isOpen: () => Boolean(dialog) };
  }

  global.WRPalette = Object.freeze({ create });
})(typeof globalThis !== "undefined" ? globalThis : this);
