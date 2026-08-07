# Changelog

All notable changes to WhatsApp Web Refined are documented in this file.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.1.0] — 2026-08-07

### Changed

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

## [1.0.1] — 2026-08-07

### Fixed

- Restored the WhatsApp Web Refined name across the manifest, popup, and
  store copy.

## [1.0.0] — 2026-08-07

### Added

- Initial release: chat-folder sidebar layout, resizable chat panel, privacy
  blur options with hover reveal, hidden-interface toggles, platform-aware
  keyboard shortcuts, in-page settings drawer, and toolbar pause/activate
  popup.
