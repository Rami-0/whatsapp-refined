# Changelog

All notable changes to Refined WhatsApp™ Web are documented in this file.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.1.0] — 2026-08-07

### Changed

- Renamed the product to **Refined WhatsApp™ Web** across the manifest,
  interface, documentation, and store copy.
- Visual pass to match WhatsApp Web's current design language: WhatsApp green
  accents for active folders, sidebar actions, and the resize handle in both
  light and dark themes.
- Unread badges now use WhatsApp's unread-marker green with the correct badge
  text color per theme, preferring WhatsApp's own theme token when present.
- Fully rounded (pill) shapes for folder buttons, sidebar actions, badges,
  layout choice chips, and the popup's primary button; softer 14 px radius for
  grouped settings cards; rounded left edge on the settings drawer.

### Added

- WhatsApp-style tooltips on the folder rail, sidebar actions, and the drawer
  close button — the same white rounded card WhatsApp uses for its own nav
  tooltips, keyboard-accessible (shown on focus), and never clipped by the
  rail's scroll area.
- `npm run package` now also produces a minimal `dist/unpacked/` build
  (~120 KB) for loading as an unpacked extension without docs, store assets,
  or development files.
- Version tags now publish the packaged ZIP and its SHA-256 checksum as GitHub
  Release assets; generated `dist/` files are no longer stored in Git.

### Fixed

- No more "Extension context invalidated" console errors when the extension
  is reloaded or updated while WhatsApp Web (or its embedded settings drawer)
  stays open — every `chrome.storage` access is now guarded.

## [1.0.1] — 2026-08-07

### Fixed

- Restored the original extension name across the manifest, popup, and
  store copy.

## [1.0.0] — 2026-08-07

### Added

- Initial release: chat-folder sidebar layout, resizable chat panel, privacy
  blur options with hover reveal, hidden-interface toggles, platform-aware
  keyboard shortcuts, in-page settings drawer, and toolbar pause/activate
  popup.
