(function initShelf(global) {
  "use strict";

  /* Refined's shelf above WhatsApp's chat list: the user's own pins (as many
     as they like, in the order they drag them into) and the Snoozed list of
     chat reminders. WhatsApp's list is virtualised and positioned by its own
     code, so nothing here moves WhatsApp's rows; the shelf draws its own and
     opens chats through WRChats. All state lives in chrome.storage.local, on
     this device only. */

  const PINS_KEY = "refinedPins";
  const REMINDERS_KEY = "refinedReminders";
  const COLLAPSED_KEY = "refinedShelfCollapsed";
  const MENTIONS_KEY = "refinedMentions";
  const SCAN_STEP_MS = 380;
  const DRAG_THRESHOLD = 5;
  const PERSON = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="9" r="3.5"/><path d="M5.5 19c.8-3.4 3.3-5 6.5-5s5.7 1.6 6.5 5"/></svg>';

  const ICONS = Object.freeze({
    pin: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 4h6l-1 5 3 3v2H7v-2l3-3-1-5Z"/><path d="M12 14v6"/></svg>',
    clock: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="13" r="7"/><path d="M12 9.5V13l2.5 1.5M5 4.5 3 6.5M19 4.5l2 2"/></svg>',
    bell: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 16V11a6 6 0 1 1 12 0v5l1.5 2h-15L6 16Z"/><path d="M10 20a2 2 0 0 0 4 0"/></svg>',
    close: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m7 7 10 10M17 7 7 17"/></svg>',
    check: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg>',
    chevron: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m8 10 4 4 4-4"/></svg>',
    at: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3.5"/><path d="M15.5 12v1.5a2.5 2.5 0 0 0 5 0V12a8.5 8.5 0 1 0-3.3 6.7"/></svg>',
    scan: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 12a8 8 0 1 1-2.3-5.6M20 4v4.5h-4.5"/></svg>',
    muted: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 16V11a6 6 0 0 1 9.5-4.9M18 11v5l1.5 2H8M10 20a2 2 0 0 0 4 0M4 4l16 16"/></svg>'
  });

  function storage() {
    try {
      return globalThis.chrome?.storage?.local || null;
    } catch (_error) {
      return null;
    }
  }

  function read(keys) {
    return new Promise((resolve) => {
      const area = storage();
      if (!area) return resolve({});
      try {
        area.get(keys, (values) => resolve(values || {}));
      } catch (_error) {
        resolve({});
      }
    });
  }

  function write(values) {
    try {
      storage()?.set(values);
    } catch (_error) {}
  }

  function message(payload) {
    try {
      globalThis.chrome?.runtime?.sendMessage?.(payload);
    } catch (_error) {}
  }

  function create({ t, utils, chats, settings, folders }) {
    let pins = [];
    let reminders = [];
    let mentions = [];
    let scanning = false;
    let collapsed = { pinned: false, snoozed: false, mentions: false };
    let root = null;
    let tools = null;
    let toolsRow = "";
    let menu = null;
    let stopRows = null;
    let tick = null;
    let lastSignature = "";
    /* Profile photos of chats seen in the list, by name: memory only, never
       written to storage. */
    const avatars = new Map();

    const enabled = () => settings().enabled && (settings().pinsEnabled || settings().remindersEnabled || settings().mentionsEnabled);

    function button(className, label, icon) {
      const node = document.createElement("button");
      node.type = "button";
      node.className = className;
      node.dataset.wrTooltip = label;
      node.setAttribute("aria-label", label);
      node.innerHTML = icon;
      return node;
    }

    function timeLabel(at) {
      const date = new Date(at);
      const language = utils.uiLanguage(settings().language).replace("_", "-");
      const sameDay = new Date().toDateString() === date.toDateString();
      try {
        return new Intl.DateTimeFormat(language, sameDay ? { hour: "2-digit", minute: "2-digit" } : { weekday: "short", hour: "2-digit", minute: "2-digit" }).format(date);
      } catch (_error) {
        return date.toLocaleTimeString();
      }
    }

    /* ---------- storage ---------- */

    async function load() {
      const values = await read([PINS_KEY, REMINDERS_KEY, COLLAPSED_KEY, MENTIONS_KEY]);
      mentions = Array.isArray(values[MENTIONS_KEY]) ? values[MENTIONS_KEY] : [];
      pins = Array.isArray(values[PINS_KEY]) ? values[PINS_KEY] : [];
      reminders = Array.isArray(values[REMINDERS_KEY]) ? values[REMINDERS_KEY] : [];
      collapsed = { pinned: false, snoozed: false, mentions: false, ...(values[COLLAPSED_KEY] || {}) };
      render();
    }

    function savePins(next) {
      if (next === pins) return;
      pins = next;
      write({ [PINS_KEY]: pins });
      render();
    }

    function saveReminders(next) {
      reminders = next;
      write({ [REMINDERS_KEY]: reminders });
      message({ type: "wr-reminders-sync" });
      render();
    }

    function onStorageChange(changes) {
      let changed = false;
      if (changes[PINS_KEY]) {
        pins = changes[PINS_KEY].newValue || [];
        changed = true;
      }
      if (changes[REMINDERS_KEY]) {
        reminders = changes[REMINDERS_KEY].newValue || [];
        changed = true;
      }
      if (changes[MENTIONS_KEY]) {
        mentions = changes[MENTIONS_KEY].newValue || [];
        changed = true;
      }
      if (changed) render();
    }

    /* ---------- public actions ---------- */

    const isPinned = (name) => pins.some((pin) => pin.name === name);
    const reminderFor = (name) => reminders.find((item) => item.name === name);

    function togglePin(name) {
      if (!name) return;
      savePins(isPinned(name) ? utils.unpinChat(pins, name) : utils.pinChat(pins, name));
    }

    function remind(name, dueAt) {
      if (!name || !Number.isFinite(dueAt)) return;
      saveReminders(utils.addReminder(reminders, name, dueAt));
    }

    function clearReminder(name) {
      saveReminders(utils.removeReminder(reminders, name));
    }

    /* ---------- the shelf ---------- */

    function mount() {
      const pane = chats.chatPane();
      if (!pane || !enabled()) {
        root?.remove();
        return;
      }
      if (!root) {
        root = document.createElement("section");
        root.id = "wr-shelf";
        root.addEventListener("keydown", onShelfKey);
        root.addEventListener("pointerdown", onPointerDown);
        root.addEventListener("click", onShelfClick);
      }
      if (root.nextElementSibling !== pane) pane.parentElement.insertBefore(root, pane);
    }

    function section(key, title, count) {
      const wrap = document.createElement("div");
      wrap.className = "wr-shelf-section";
      wrap.dataset.section = key;
      const head = document.createElement("button");
      head.type = "button";
      head.className = "wr-shelf-head";
      head.setAttribute("aria-expanded", String(!collapsed[key]));
      head.innerHTML = `<span class="wr-shelf-title"></span><span class="wr-shelf-count"></span>${ICONS.chevron}`;
      head.querySelector(".wr-shelf-title").textContent = title;
      head.querySelector(".wr-shelf-count").textContent = String(count);
      head.addEventListener("click", () => {
        collapsed = { ...collapsed, [key]: !collapsed[key] };
        write({ [COLLAPSED_KEY]: collapsed });
        render(true);
      });
      const list = document.createElement("ol");
      list.className = "wr-shelf-list";
      list.hidden = Boolean(collapsed[key]);
      wrap.append(head, list);
      return { wrap, list };
    }

    function avatar(entry) {
      const node = document.createElement("span");
      node.className = "wr-shelf-avatar";
      const photo = avatars.get(entry.name);
      if (photo) {
        const img = document.createElement("img");
        img.alt = "";
        img.src = photo;
        img.referrerPolicy = "no-referrer";
        img.addEventListener("error", () => {
          img.remove();
          node.textContent = utils.folderInitial(entry.name);
        });
        node.append(img);
      } else if (/^\+?[\d\s()-]+$/.test(entry.name)) {
        node.innerHTML = PERSON;
      } else {
        node.textContent = utils.folderInitial(entry.name);
      }
      return node;
    }

    function row(entry, kind, openName) {
      const item = document.createElement("li");
      item.className = "wr-shelf-row";
      item.tabIndex = 0;
      item.dataset.name = entry.name;
      item.dataset.kind = kind;
      if (entry.name === openName) item.setAttribute("aria-current", "true");

      const name = document.createElement("span");
      name.className = "wr-shelf-name";
      name.textContent = entry.name;
      name.dir = "auto";

      const meta = document.createElement("span");
      meta.className = "wr-shelf-meta";
      const actions = document.createElement("span");
      actions.className = "wr-shelf-actions";

      if (kind === "pinned") {
        const pin = pins.find((p) => p.name === entry.name) || entry;
        if (pin.muted) meta.insertAdjacentHTML("beforeend", `<i class="wr-shelf-muted">${ICONS.muted}</i>`);
        if (reminderFor(entry.name)) meta.insertAdjacentHTML("beforeend", `<i class="wr-shelf-bell">${ICONS.clock}</i>`);
        if (pin.unread) {
          const badge = document.createElement("b");
          badge.className = "wr-shelf-badge";
          badge.textContent = pin.unread > 999 ? "999+" : String(pin.unread);
          meta.append(badge);
        }
        const unpin = button("wr-shelf-action", t("unpinChat", "Unpin"), ICONS.close);
        unpin.dataset.action = "unpin";
        actions.append(unpin);
        item.setAttribute("aria-label", t("pinnedChatAria", `${entry.name}, pinned`, [entry.name]));
      } else if (kind === "mentions") {
        meta.insertAdjacentHTML("beforeend", `<i class="wr-shelf-at">${ICONS.at}</i>`);
        if (entry.unread) {
          const badge = document.createElement("b");
          badge.className = "wr-shelf-badge";
          badge.textContent = entry.unread > 999 ? "999+" : String(entry.unread);
          meta.append(badge);
        }
        const dismiss = button("wr-shelf-action", t("mentionDismiss", "Dismiss"), ICONS.close);
        dismiss.dataset.action = "dismiss";
        actions.append(dismiss);
        item.setAttribute("aria-label", t("mentionAria", `${entry.name}, mentioned you`, [entry.name]));
      } else {
        const due = entry.dueAt <= Date.now();
        item.dataset.due = String(due);
        const when = document.createElement("span");
        when.className = "wr-shelf-when";
        when.textContent = due ? t("reminderDue", "Due") : utils.shortDuration(entry.dueAt - Date.now());
        when.title = timeLabel(entry.dueAt);
        if (due) meta.insertAdjacentHTML("beforeend", `<i class="wr-shelf-bell wr-shelf-bell--due">${ICONS.bell}</i>`);
        meta.append(when);
        const done = button("wr-shelf-action", t("reminderDone", "Done"), ICONS.check);
        done.dataset.action = "done";
        const again = button("wr-shelf-action", t("remindMe", "Remind me"), ICONS.clock);
        again.dataset.action = "snooze";
        actions.append(again, done);
        item.setAttribute("aria-label", due ? t("reminderDueAria", `${entry.name}, reminder due`, [entry.name]) : t("reminderAria", `${entry.name}, reminder at ${timeLabel(entry.dueAt)}`, [entry.name, timeLabel(entry.dueAt)]));
      }

      item.append(avatar(entry), name, meta, actions);
      return item;
    }

    /* WhatsApp swaps its list for search results while the search box is in
       use; the shelf steps aside so results start at the top. */
    function searching() {
      const box = document.querySelector('#side input[role="textbox"]');
      return Boolean(box && (box.value || document.activeElement === box));
    }

    function render(force = false) {
      mount();
      if (!root?.isConnected) return;
      root.dataset.searching = String(searching());
      const openName = chats.openChatName();
      const showPins = settings().pinsEnabled && pins.length > 0;
      const showReminders = settings().remindersEnabled && reminders.length > 0;
      const showMentions = settings().mentionsEnabled && (mentions.length > 0 || scanning || forceMentions);
      const signature = JSON.stringify([showMentions && [mentions, scanning], showPins && pins, showReminders && reminders.map((r) => [r.name, r.dueAt, utils.shortDuration(r.dueAt - Date.now()), r.dueAt <= Date.now()]), collapsed, openName, settings().language]);
      if (!force && signature === lastSignature) return;
      lastSignature = signature;
      /* Rebuilding drops focus; put it back on the same chat's row. */
      const focused = root.contains(document.activeElement) ? document.activeElement.closest?.(".wr-shelf-row") : null;
      const refocus = focused ? [focused.dataset.kind, focused.dataset.name] : null;
      root.replaceChildren();
      root.hidden = !showPins && !showReminders && !showMentions;
      if (showPins) {
        const { wrap, list } = section("pinned", t("shelfPinned", "Pinned"), pins.length);
        pins.forEach((pin) => list.append(row(pin, "pinned", openName)));
        root.append(wrap);
      }
      if (showReminders) {
        const due = reminders.some((item) => item.dueAt <= Date.now());
        const { wrap, list } = section("snoozed", t("shelfSnoozed", "Snoozed"), reminders.length);
        wrap.dataset.due = String(due);
        reminders.forEach((item) => list.append(row(item, "snoozed", openName)));
        root.append(wrap);
      }
      if (showMentions) {
        const { wrap, list } = section("mentions", t("shelfMentions", "Mentions"), mentions.length);
        const head = wrap.querySelector(".wr-shelf-head");
        const scan = button("wr-shelf-scan", scanning ? t("mentionsScanning", "Scanning…") : t("mentionsScan", "Scan all chats"), ICONS.scan);
        scan.disabled = scanning;
        scan.addEventListener("click", (event) => {
          event.stopPropagation();
          scanMentions();
        });
        head.after(scan);
        mentions.forEach((item) => list.append(row(item, "mentions", openName)));
        if (!mentions.length) {
          const empty = document.createElement("li");
          empty.className = "wr-shelf-empty";
          empty.textContent = scanning ? t("mentionsScanning", "Scanning…") : t("mentionsEmpty", "No unread mentions");
          list.append(empty);
        }
        root.insertBefore(wrap, root.firstChild);
      }
      if (refocus) root.querySelector(`.wr-shelf-row[data-kind="${refocus[0]}"][data-name="${CSS.escape(refocus[1])}"]`)?.focus();
    }

    /* ---------- interaction ---------- */

    let suppressClick = false;

    function onShelfClick(event) {
      if (suppressClick) {
        suppressClick = false;
        return;
      }
      const action = event.target.closest(".wr-shelf-action");
      const item = event.target.closest(".wr-shelf-row");
      if (!item) return;
      const name = item.dataset.name;
      if (action?.dataset.action === "unpin") return togglePin(name);
      if (action?.dataset.action === "done") return clearReminder(name);
      if (action?.dataset.action === "snooze") return openMenu(action, name);
      if (action?.dataset.action === "dismiss") return saveMentions(mentions.filter((item) => item.name !== name));
      if (item.dataset.kind === "mentions") saveMentions(mentions.filter((entry) => entry.name !== name));
      openChat(name, item);
    }

    async function openChat(name, item) {
      item?.setAttribute("aria-busy", "true");
      const opened = await chats.openChat(name);
      item?.removeAttribute("aria-busy");
      if (!opened && item) {
        item.dataset.missing = "true";
        item.querySelector(".wr-shelf-name").title = t("chatNotFound", "Couldn't find this chat. It may have been renamed.");
      }
      window.setTimeout(() => render(true), 300);
    }

    function onShelfKey(event) {
      const item = event.target.closest?.(".wr-shelf-row");
      if (!item || event.target !== item) return;
      const name = item.dataset.name;
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        openChat(name, item);
      } else if (item.dataset.kind === "pinned" && event.altKey && (event.key === "ArrowUp" || event.key === "ArrowDown")) {
        event.preventDefault();
        const index = pins.findIndex((pin) => pin.name === name);
        savePins(utils.movePin(pins, name, index + (event.key === "ArrowUp" ? -1 : 1)));
        root.querySelector(`.wr-shelf-row[data-kind="pinned"][data-name="${CSS.escape(name)}"]`)?.focus();
      } else if (event.key === "Delete" || event.key === "Backspace") {
        event.preventDefault();
        if (item.dataset.kind === "pinned") togglePin(name);
        else if (item.dataset.kind === "mentions") saveMentions(mentions.filter((entry) => entry.name !== name));
        else clearReminder(name);
      }
    }

    /* Pointer drag to reorder pins: a row follows the pointer, a line marks
       where it will land, and the order is saved on release. A press that
       never moves past the threshold stays a click. */
    function onPointerDown(event) {
      const item = event.target.closest(".wr-shelf-row");
      if (!item || item.dataset.kind !== "pinned" || event.button !== 0 || event.target.closest(".wr-shelf-action")) return;
      const list = item.parentElement;
      const rows = Array.from(list.children);
      const startY = event.clientY;
      const height = item.getBoundingClientRect().height;
      let dragging = false;
      let target = rows.indexOf(item);

      const move = (moveEvent) => {
        const dy = moveEvent.clientY - startY;
        if (!dragging && Math.abs(dy) > DRAG_THRESHOLD) {
          dragging = true;
          item.setPointerCapture?.(event.pointerId);
          list.dataset.dragging = "true";
          item.dataset.dragging = "true";
        }
        if (!dragging) return;
        item.style.transform = `translateY(${dy}px)`;
        const from = rows.indexOf(item);
        target = Math.max(0, Math.min(rows.length - 1, from + Math.round(dy / height)));
        rows.forEach((other, index) => {
          other.dataset.dropBefore = String(index === target && target < from);
          other.dataset.dropAfter = String(index === target && target > from);
        });
      };
      const finish = () => {
        root.removeEventListener("pointermove", move);
        root.removeEventListener("pointerup", finish);
        root.removeEventListener("pointercancel", finish);
        if (!dragging) return;
        suppressClick = true;
        window.setTimeout(() => { suppressClick = false; }, 0);
        item.style.transform = "";
        delete list.dataset.dragging;
        savePins(utils.movePin(pins, item.dataset.name, target));
        render(true);
      };
      root.addEventListener("pointermove", move);
      root.addEventListener("pointerup", finish);
      root.addEventListener("pointercancel", finish);
    }

    /* ---------- reminder preset menu ---------- */

    function closeMenu() {
      menu?.remove();
      menu = null;
      document.removeEventListener("pointerdown", onOutside, true);
      document.removeEventListener("keydown", onMenuKey, true);
    }

    function onOutside(event) {
      if (menu && !menu.contains(event.target)) closeMenu();
    }

    function onMenuKey(event) {
      if (!menu) return;
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        closeMenu();
      } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        const items = Array.from(menu.querySelectorAll('[role="menuitem"]'));
        const index = items.indexOf(document.activeElement);
        const next = items.at((index + (event.key === "ArrowDown" ? 1 : -1)) % items.length);
        if (next) {
          event.preventDefault();
          next.focus();
        }
      }
    }

    function openMenu(anchor, name) {
      closeMenu();
      menu = document.createElement("div");
      menu.id = "wr-remind-menu";
      menu.setAttribute("role", "menu");
      menu.setAttribute("aria-label", t("remindMe", "Remind me"));
      const labels = { "1h": t("remindIn1h", "In 1 hour"), "3h": t("remindIn3h", "In 3 hours"), tomorrow: t("remindTomorrow", "Tomorrow") };
      utils.reminderPresets(new Date()).forEach((preset) => {
        const option = document.createElement("button");
        option.type = "button";
        option.setAttribute("role", "menuitem");
        option.innerHTML = '<span></span><time></time>';
        option.firstChild.textContent = labels[preset.key];
        option.lastChild.textContent = timeLabel(preset.at);
        option.addEventListener("click", () => {
          remind(name, preset.at);
          closeMenu();
        });
        menu.append(option);
      });
      const custom = document.createElement("label");
      custom.className = "wr-remind-custom";
      const customText = document.createElement("span");
      customText.textContent = t("remindCustom", "Custom…");
      const input = document.createElement("input");
      input.type = "datetime-local";
      const pad = (n) => String(n).padStart(2, "0");
      const soon = new Date(Date.now() + 2 * 3600000);
      input.min = `${new Date().getFullYear()}-${pad(new Date().getMonth() + 1)}-${pad(new Date().getDate())}T00:00`;
      input.value = `${soon.getFullYear()}-${pad(soon.getMonth() + 1)}-${pad(soon.getDate())}T${pad(soon.getHours())}:${pad(soon.getMinutes())}`;
      const set = document.createElement("button");
      set.type = "button";
      set.textContent = t("reminderSet", "Set");
      set.addEventListener("click", () => {
        const at = new Date(input.value).getTime();
        if (Number.isFinite(at) && at > Date.now()) {
          remind(name, at);
          closeMenu();
        } else {
          input.setAttribute("aria-invalid", "true");
        }
      });
      custom.append(customText, input, set);
      menu.append(custom);
      if (reminderFor(name)) {
        const clear = document.createElement("button");
        clear.type = "button";
        clear.setAttribute("role", "menuitem");
        clear.className = "wr-remind-clear";
        clear.textContent = t("reminderClear", "Remove reminder");
        clear.addEventListener("click", () => {
          clearReminder(name);
          closeMenu();
        });
        menu.append(clear);
      }
      document.body.append(menu);
      const rect = anchor.getBoundingClientRect();
      const size = menu.getBoundingClientRect();
      menu.style.left = `${Math.round(Math.max(8, Math.min(window.innerWidth - size.width - 8, rect.left)))}px`;
      menu.style.top = `${Math.round(rect.bottom + size.height + 8 > window.innerHeight ? Math.max(8, rect.top - size.height - 6) : rect.bottom + 6)}px`;
      menu.querySelector('[role="menuitem"]')?.focus();
      document.addEventListener("pointerdown", onOutside, true);
      document.addEventListener("keydown", onMenuKey, true);
    }

    /* ---------- hover tools on WhatsApp's rows ---------- */

    /* One floating toolbar positioned over the hovered row, never injected
       into the row itself: WhatsApp re-renders rows on every scroll and
       would drop anything put inside them. */
    function ensureTools() {
      if (tools) return tools;
      tools = document.createElement("div");
      tools.id = "wr-row-tools";
      const pin = button("wr-row-tool", t("pinChat", "Pin in Refined"), ICONS.pin);
      pin.dataset.action = "pin";
      const clock = button("wr-row-tool", t("remindMe", "Remind me"), ICONS.clock);
      clock.dataset.action = "remind";
      tools.append(pin, clock);
      tools.addEventListener("click", (event) => {
        const action = event.target.closest(".wr-row-tool")?.dataset.action;
        if (!action || !toolsRow) return;
        event.stopPropagation();
        if (action === "pin") {
          togglePin(toolsRow);
          syncTools();
        } else openMenu(event.target.closest(".wr-row-tool"), toolsRow);
      });
      tools.addEventListener("pointerleave", (event) => {
        if (!event.relatedTarget?.closest?.('[role="row"]')) hideTools();
      });
      document.body.append(tools);
      return tools;
    }

    function syncTools() {
      if (!tools) return;
      const pin = tools.querySelector('[data-action="pin"]');
      const pinned = isPinned(toolsRow);
      pin.setAttribute("aria-pressed", String(pinned));
      const label = pinned ? t("unpinChat", "Unpin") : t("pinChat", "Pin in Refined");
      pin.dataset.wrTooltip = label;
      pin.setAttribute("aria-label", label);
      pin.hidden = !settings().pinsEnabled;
      const clock = tools.querySelector('[data-action="remind"]');
      clock.hidden = !settings().remindersEnabled;
      clock.setAttribute("aria-pressed", String(Boolean(reminderFor(toolsRow))));
    }

    function hideTools() {
      if (tools) tools.dataset.visible = "false";
      toolsRow = "";
    }

    function onGridHover(event) {
      if (!enabled() || menu) return;
      /* Any chat row in WhatsApp's side panel: the main list and search
         results are different grids, so check the panel, not one grid. A
         pointer on anything else hides the tools rather than leaving them
         pointed at the last row. */
      const rowNode = event.target.closest?.('[role="row"]');
      const info = rowNode && rowNode.closest("#side") && !rowNode.closest("#wr-shelf") ? chats.readRow(rowNode) : null;
      if (!info) {
        if (tools && !tools.contains(event.target)) hideTools();
        return;
      }
      ensureTools();
      toolsRow = info.name;
      syncTools();
      const rect = rowNode.getBoundingClientRect();
      tools.style.top = `${Math.round(rect.top + rect.height / 2)}px`;
      tools.style.left = `${Math.round(rect.right - 12)}px`;
      tools.dataset.visible = "true";
    }

    function onDocumentLeave(event) {
      if (!tools || tools.dataset.visible !== "true") return;
      const to = event.relatedTarget;
      if (to && (tools.contains(to) || to.closest?.('[role="row"]'))) return;
      hideTools();
    }

    /* ---------- lifecycle ---------- */

    function saveMentions(next) {
      mentions = next;
      write({ [MENTIONS_KEY]: mentions });
      render();
    }

    /* Learns mentions from whatever rows are on screen: a row with the "@"
       marker adds or updates its chat, the same chat rendered without it (read,
       or the mention cleared) drops out. Busy groups jump to the top of
       WhatsApp's list, so most mentions are seen without scanning. */
    function learnMentions(rows) {
      if (!settings().mentionsEnabled) return;
      const next = utils.mergeMentions(mentions, rows, Date.now());
      if (next !== mentions) saveMentions(next);
    }

    function onRows(rows) {
      if (scanning) return;
      let photosChanged = false;
      rows.forEach((info) => {
        if (info.avatar && avatars.get(info.name) !== info.avatar) {
          avatars.set(info.name, info.avatar);
          photosChanged = true;
        }
      });
      if (photosChanged) lastSignature = "";
      learnMentions(rows);
      if (settings().pinsEnabled) savePins(utils.refreshPins(pins, rows));
      else render();
    }

    /* "Scan all chats": the list only holds the rows on screen, so walk it.
       Switch WhatsApp to its Unread filter (far fewer rows), scroll top to
       bottom a screen at a time collecting "@" rows, then put the filter and
       scroll position back. Runs only when asked, because the list moves. */
    async function scanMentions() {
      if (scanning) return;
      const pane = chats.chatPane();
      if (!pane) return;
      scanning = true;
      render(true);
      const all = folders?.() || [];
      const previous = all.find((folder) => folder.selected);
      const unread = all.find((folder) => folder.kind === "unread");
      const scrollBack = pane.scrollTop;
      const found = new Map();
      const sleep = (ms) => new Promise((resolve) => window.setTimeout(resolve, ms));
      try {
        if (unread && unread !== previous) {
          unread.element.click();
          await sleep(SCAN_STEP_MS * 2);
        }
        const list = chats.chatPane() || pane;
        list.scrollTop = 0;
        for (let guard = 0; guard < 200; guard++) {
          await sleep(SCAN_STEP_MS);
          chats.readRows().forEach((info) => {
            if (info.mention) found.set(info.name, { name: info.name, unread: info.unread, seenAt: Date.now() });
          });
          if (list.scrollTop + list.clientHeight >= list.scrollHeight - 4) break;
          list.scrollTop += Math.max(200, list.clientHeight - 80);
        }
      } finally {
        if (previous && unread && unread !== previous) {
          previous.element.click();
          await sleep(SCAN_STEP_MS * 2);
        }
        const list = chats.chatPane();
        if (list) list.scrollTop = scrollBack;
        scanning = false;
        saveMentions(Array.from(found.values()));
      }
    }

    let forceMentions = false;

    /* The palette's "Show chats that mention me": reveal the section and scan
       if nothing is known yet. */
    function showMentions() {
      forceMentions = true;
      collapsed = { ...collapsed, mentions: false };
      render(true);
      root?.querySelector('[data-section="mentions"]')?.scrollIntoView({ block: "nearest" });
      if (!mentions.length) scanMentions();
    }

    function start() {
      load();
      stopRows = chats.observeRows(onRows);
      document.addEventListener("pointerover", onGridHover, true);
      document.addEventListener("pointerout", onDocumentLeave, true);
      document.addEventListener("scroll", hideTools, { capture: true, passive: true });
      const onSearch = (event) => {
        if (event.target.matches?.('#side input[role="textbox"]')) {
          hideTools();
          window.setTimeout(() => { if (root) root.dataset.searching = String(searching()); }, 0);
        }
      };
      document.addEventListener("focusin", onSearch, true);
      document.addEventListener("focusout", onSearch, true);
      document.addEventListener("input", onSearch, true);
      tick = window.setInterval(() => render(), 30000);
    }

    return {
      start,
      /* Cheap: redraws only when pins, reminders, the open chat or the
         language changed. content.js calls it on every WhatsApp mutation. */
      render: () => render(false),
      onStorageChange,
      togglePin,
      isPinned,
      remind,
      clearReminder,
      openMenu,
      showMentions,
      scanMentions,
      pins: () => pins,
      reminders: () => reminders,
      stop() {
        stopRows?.();
        window.clearInterval(tick);
        root?.remove();
        tools?.remove();
        closeMenu();
      }
    };
  }

  global.WRShelf = Object.freeze({ create });
})(typeof globalThis !== "undefined" ? globalThis : this);
