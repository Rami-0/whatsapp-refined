(function initChats(global) {
  "use strict";

  /* The one place that reads WhatsApp's chat list. WhatsApp renders it as a
     virtualised grid: about 24 of the user's chats exist at a time, each an
     absolutely positioned [role="row"], and a row carries no chat id, only
     the chat's name. Everything Refined learns about a chat comes through
     readRow(), and every chat Refined opens goes through openChat(), so the
     next WhatsApp redesign has one file to fix. */

  const MENTION_MARKER = /mention|at-sign|alternate-email/i;
  const OPEN_TIMEOUT_MS = 4000;

  /* WhatsApp keeps a second, empty #pane-side on the page; the real list is
     the one with height. The right-hand drawers (Search messages, contact
     info) can carry their own #pane-side too, so only the left panel's
     (#side) counts. Picking by height across both made the shelf jump
     between them: mounting it shrank one list, which made the other one
     the taller, and so on. */
  function chatPane() {
    let best = null;
    const pick = (selector) => document.querySelectorAll(selector);
    let candidates = pick("#side #pane-side");
    if (!candidates.length) candidates = pick('#pane-side[data-scrolltracepolicy="wa.web.chatlist"]');
    if (!candidates.length) candidates = pick("#pane-side");
    candidates.forEach((pane) => {
      if (!best || pane.clientHeight > best.clientHeight) best = pane;
    });
    return best && best.clientHeight > 0 ? best : null;
  }

  function chatGrid() {
    return chatPane()?.querySelector('[role="grid"]') || null;
  }

  function renderedRows() {
    const grid = chatGrid();
    return grid ? Array.from(grid.querySelectorAll('[role="row"]')) : [];
  }

  function iconNames(row) {
    const names = [];
    row.querySelectorAll("title, [data-icon]").forEach((node) => {
      names.push(node.getAttribute("data-icon") || node.textContent || "");
    });
    return names.join(" ");
  }

  /* A chat's name as one comparable string. WhatsApp draws emoji as <img
     alt="❤️">, which textContent drops, so walk the nodes and keep each
     image's alt. Rows and the open chat's header both go through this, so
     "Mom ❤️" is the same key on both sides. */
  function titleText(node) {
    if (!node) return "";
    let text = "";
    const walk = (current) => {
      current.childNodes.forEach((child) => {
        if (child.nodeType === Node.TEXT_NODE) text += child.textContent;
        else if (child.nodeName === "IMG") text += child.getAttribute("alt") || "";
        else if (child.nodeType === Node.ELEMENT_NODE) walk(child);
      });
    };
    walk(node);
    return text.replace(/\s+/g, " ").trim();
  }

  function rowName(row) {
    const span = row.querySelector('[data-testid="cell-frame-title"] span[title]');
    const fromTitle = (span?.getAttribute("title") || "").replace(/\s+/g, " ").trim();
    return fromTitle || titleText(row.querySelector('[data-testid="cell-frame-title"]'));
  }

  /* The FAQ describes the mention marker as an "@" beside the unread badge.
     Its markup has not been seen live yet, so match both an icon name and a
     bare "@" leaf next to the badge. */
  function rowHasMention(row, icons) {
    if (MENTION_MARKER.test(icons)) return true;
    const badge = row.querySelector('[data-testid="icon-unread-count"]');
    const area = badge?.parentElement?.parentElement || row;
    return Array.from(area.querySelectorAll("span, div")).some((node) => node.children.length === 0 && node.textContent.trim() === "@");
  }

  function readRow(row) {
    const name = rowName(row);
    if (!name) return null;
    const icons = iconNames(row);
    const badge = row.querySelector('[data-testid="icon-unread-count"]');
    const unreadLabel = badge?.getAttribute("aria-label") || badge?.closest("[aria-label]")?.getAttribute("aria-label") || "";
    const unread = Number((unreadLabel.match(/\d[\d,.]*/) || [badge?.textContent || ""])[0].replace(/[^\d]/g, "")) || (badge ? 1 : 0);
    const avatar = Array.from(row.querySelectorAll("img")).find((img) => img.width >= 32 && /^https?:|^blob:/.test(img.src));
    return {
      name,
      unread,
      mention: unread > 0 && rowHasMention(row, icons),
      muted: /notifications-off|muted/i.test(icons),
      pinnedNative: /push-pin|pinned/i.test(icons),
      avatar: avatar?.src || "",
      time: (row.querySelector('[data-testid="chat-list-timestamp"]')?.textContent || "").trim(),
      row
    };
  }

  function readRows() {
    return renderedRows().map(readRow).filter(Boolean);
  }

  function findRow(name) {
    return renderedRows().find((row) => rowName(row) === name) || null;
  }

  /* WhatsApp's handler sits on the row's cell-frame-container (verified on
     the live client: the same events on the gridcell or the row do nothing).
     It opens on mousedown in some builds and on click in others, so send the
     full sequence. */
  function activate(row) {
    const target = row.querySelector('[data-testid="cell-frame-container"]') || row.querySelector('[role="gridcell"]') || row;
    const init = { bubbles: true, cancelable: true, view: window, button: 0, buttons: 1 };
    ["pointerdown", "mousedown", "pointerup", "mouseup", "click"].forEach((type) => {
      if (type === "click") return;
      const Event = type.startsWith("pointer") ? PointerEvent : MouseEvent;
      target.dispatchEvent(new Event(type, init));
    });
    target.click();
  }

  function searchBox() {
    return document.querySelector('#side input[role="textbox"]');
  }

  /* React tracks an input's value itself, so assigning .value is ignored
     unless it goes through the native setter before the input event.
     `focus: false` clears the box without taking focus from wherever
     WhatsApp put it (the message box of the chat just opened). */
  function setSearch(value, { focus = true } = {}) {
    const input = searchBox();
    if (!input) return false;
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
    if (focus) input.focus();
    setter.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
    return true;
  }

  function waitFor(predicate, timeout = OPEN_TIMEOUT_MS) {
    return new Promise((resolve) => {
      const started = Date.now();
      const tick = () => {
        const value = predicate();
        if (value || Date.now() - started > timeout) return resolve(value || null);
        window.setTimeout(tick, 80);
      };
      tick();
    });
  }

  /* Opens a chat by name: clicks its row when it is on screen, otherwise
     types the name into WhatsApp's search and clicks the match. Resolves true
     when a chat was opened. Never sends or types into a conversation. */
  /* Each call takes a ticket; a newer open, or the user switching chats
     themself, voids the older one, so a slow search can never pull the user
     into a chat they did not pick last. */
  let openTicket = 0;

  async function openChat(name) {
    const ticket = ++openTicket;
    const visible = findRow(name);
    if (visible) {
      activate(visible);
      return true;
    }
    const startedIn = openChatName();
    if (!setSearch(name)) return false;
    const match = await waitFor(() => ticket !== openTicket || openChatName() !== startedIn || findRow(name));
    const current = ticket === openTicket && openChatName() === startedIn;
    const opened = current && match instanceof Element;
    if (opened) activate(match);
    if (ticket === openTicket) {
      /* Clear the search without taking focus back from the message box
         WhatsApp just focused in the opened chat. */
      window.setTimeout(() => {
        if (ticket === openTicket) setSearch("", { focus: false });
      }, 250);
    }
    return opened;
  }

  /* The open chat's name. The header's span[title] is "click here for
     contact info", so read the title element's text instead. */
  function openChatName() {
    return titleText(document.querySelector('#main header [data-testid="conversation-info-header-chat-title"]'));
  }

  /* Calls back with the rendered rows whenever WhatsApp redraws the list,
     at most once per frame. Returns a stop function. */
  function observeRows(callback) {
    let observed = null;
    let observer = null;
    let frame = 0;
    const emit = () => {
      frame = 0;
      callback(readRows());
    };
    const schedule = () => {
      if (!frame) frame = window.requestAnimationFrame(emit);
    };
    const attach = () => {
      const grid = chatGrid();
      if (!grid || grid === observed) return;
      observer?.disconnect();
      observed = grid;
      observer = new MutationObserver(schedule);
      observer.observe(grid, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ["aria-label", "title", "src", "style"] });
      schedule();
    };
    attach();
    const timer = window.setInterval(attach, 1500);
    return () => {
      window.clearInterval(timer);
      observer?.disconnect();
      window.cancelAnimationFrame(frame);
    };
  }

  global.WRChats = Object.freeze({ titleText, chatPane, chatGrid, readRow, readRows, findRow, openChat, openChatName, observeRows, setSearch });
})(typeof globalThis !== "undefined" ? globalThis : this);
