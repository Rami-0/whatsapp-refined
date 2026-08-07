# WhatsApp Refined

A privacy-first Chrome extension that adds useful, customizable controls to WhatsApp Web while preserving WhatsApp's native colors and interaction patterns.

## What it changes

- Keeps WhatsApp's native filter tabs, or moves them into WhatsApp's existing navigation sidebar—never a second rail.
- Adds a Telegram-style draggable chat-panel edge, with keyboard resizing and a saved width.
- Offers native, soft, and rounded chat-row styles.
- Can hide message previews, the notification prompt, Meta AI, or Channels.
- Adds an integrated settings drawer inspired by WAWCD's in-app tool layout.
- Includes a configurable privacy mode for previews, opened messages, images, video/GIFs, names, and profile photos.
- Keeps emoji and interface icons visible when image or avatar privacy is enabled.
- Adds platform-aware Refined shortcuts using Command/Option on macOS and Ctrl/Alt on Windows and Linux.
- Keeps a compact toolbar popup for activation and creator details; full settings stay inside WhatsApp.
- Keeps folder actions native: selecting a mirrored folder clicks WhatsApp's own filter tab, and the Lists action opens WhatsApp's own list menu.

## Privacy

The extension has no analytics, no background service, and no network code. It never stores messages, contacts, phone numbers, media, or folder names. It reads only the visible interface elements required to mirror filters and apply the selected privacy presentation. UI and privacy preferences are stored only in `chrome.storage.local` on the current browser.

## Install locally

1. Open `chrome://extensions` in Chrome.
2. Enable **Developer mode**.
3. Choose **Load unpacked** and select this folder.
4. Open or refresh [WhatsApp Web](https://web.whatsapp.com/).

Use the extension icon—or Settings inside WhatsApp's native navigation—to open settings. Existing left/right rail preferences are migrated automatically into the integrated sidebar.

## Development

No build step or dependencies are required.

```sh
npm test
```

WhatsApp Web changes often. This extension intentionally avoids generated class names and prefers stable IDs, ARIA roles, button state, and layout regions.
