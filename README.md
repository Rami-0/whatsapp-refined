# Pane

Pane is a focused Chrome extension that adds native-feeling layout, privacy, and keyboard controls to WhatsApp Web.

It is an independent project and is not affiliated with, endorsed by, or sponsored by WhatsApp or Meta. WhatsApp is a trademark of WhatsApp LLC.

## Features

- Keep WhatsApp’s filter tabs where they are or mirror them into the existing navigation sidebar.
- Resize the chat panel by dragging its edge, using the keyboard, or choosing an exact saved width.
- Hide message previews, the notification prompt, Meta AI, or Channels.
- Blur previews, opened messages, images, video/GIFs, names, and profile photos with an optional hover reveal.
- Use platform-aware shortcuts for search, new chat, folder navigation, privacy mode, and Pane settings.
- Configure everything from a settings drawer that follows WhatsApp Web’s own spacing, colors, and controls.

## Privacy by design

Pane has no analytics, ads, background service, or network requests. It does not collect or transmit messages, contacts, phone numbers, media, folder names, or usage data. The extension reads only the visible WhatsApp Web interface needed to apply the features you select. Preferences are stored locally through `chrome.storage.local`.

## Install locally

1. Open `chrome://extensions` in Chrome.
2. Enable **Developer mode**.
3. Choose **Load unpacked** and select this folder.
4. Open or refresh [WhatsApp Web](https://web.whatsapp.com/).

Click Pane’s toolbar icon to pause or resume it. Open the full settings drawer from the Settings button added to WhatsApp Web’s navigation sidebar.

## Development

Pane has no runtime dependencies or build step.

```sh
npm test
```

The implementation avoids generated class names where possible and prefers stable IDs, ARIA roles, button state, and known layout regions. Store-ready copy, the privacy policy, brand guidance, and promotional assets live in [`store/`](store/).
