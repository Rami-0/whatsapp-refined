# Changelog

All notable changes to Refined WhatsApp™ Web are documented in this file.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.2.0] — 2026-09-03

### Added

- Localization into 18 languages (Arabic, German, Spanish, French, Hindi,
  Indonesian, Italian, Japanese, Korean, Dutch, Polish, Brazilian and European
  Portuguese, Russian, Turkish, Vietnamese, Simplified and Traditional
  Chinese) via Chrome's `_locales` i18n system. The extension follows the
  browser's UI language and falls back to English. Brand names stay
  untranslated; the settings drawer switches to right-to-left layout for
  Arabic.
- A **Settings** tab in the drawer, holding the language picker and
  **Reset defaults**. It stays reachable while Refined is paused, since a
  reset is how you turn it back on.
- The **Language** picker moved there from the Layout tab. It defaults to
  following the browser, but any of the 19 languages can be chosen manually —
  for example Arabic on an English browser — and the whole interface,
  including the buttons injected into WhatsApp's sidebar, switches
  immediately.
- A confirmation dialog before **Reset defaults**, which previously wiped
  every preference on a single click.
- Script-aware fonts. Arabic, Devanagari and CJK were left to whatever the
  platform substituted for a Latin-first stack, which rendered them smaller
  and thinner than the text beside them; each script now gets a face built for
  it and a matching size, in both the settings panel and WhatsApp's sidebar.

### Fixed

- The buttons injected into WhatsApp's sidebar ignored a manually chosen
  language and followed the browser instead — their tooltips and labels stayed
  in the browser's language while the settings drawer switched. Chrome does not
  serve the extension's `_locales` folder to a web page, so the content script's
  own request for it came back empty; a service worker now reads it and hands
  the messages over.
- Changing the language reloaded the settings page, which snapped it back to
  the first tab and lost the scroll position. Translations are now re-applied
  in place; nothing else changes.
- The version row, the update badge and the project links in the toolbar popup
  were never translated.

## [1.1.1] — 2026-08-16

### Fixed

- **Hide Channels** left the unread dot behind after a WhatsApp Web update.
  WhatsApp now renders the unread badge as a sibling of the nav button, which
  the old slot lookup stopped short of, so only the icon disappeared. Rail
  entries are now resolved by containment rather than by wrapper shape, and are
  matched on WhatsApp's icon names as well as the accessibility label, so a
  renamed or recounted label ("Channels, 3 unread") no longer breaks hiding.
- Spacing around the Meta AI entry when it is visible. WhatsApp's own divider
  sat above it while the folder rail's divider sat below, boxing the entry
  between two rules with uneven margins. The rail's divider is now the single
  separator in both states and the Meta AI entry follows the same rhythm as
  the rest of the rail.
- **Hide Meta AI** now also finds the entry if WhatsApp moves it into the
  rail's footer section.

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
