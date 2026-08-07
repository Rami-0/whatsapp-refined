# Contributing to Refined WhatsApp™ Web

Thanks for your interest in improving Refined WhatsApp™ Web! This project is
small on purpose: plain JavaScript and CSS, no build step, no runtime
dependencies.

## Getting started

1. Fork and clone the repository.
2. Open `chrome://extensions`, enable **Developer mode**, choose
   **Load unpacked**, and select the repository folder.
3. Open or refresh [WhatsApp Web](https://web.whatsapp.com/) to see your
   changes. Re-click the reload icon on the extension card after editing.

You can also iterate without a WhatsApp account: open `demo/index.html`
directly in a browser. It is a small mock of WhatsApp Web's DOM that loads the
real content script and stylesheet.

## Development guidelines

- **No dependencies, no build step.** Changes should keep the extension
  loadable as-is from the repository root.
- **Prefer stable selectors.** WhatsApp Web's generated class names change
  frequently. Target IDs (`#side`, `#pane-side`), ARIA roles and labels,
  `data-testid` attributes, and layout regions instead.
- **Follow the host's design language.** New UI should use the `--wr-*`
  tokens in `src/content.css` (which defer to WhatsApp's own theme variables
  where they exist) and match WhatsApp's spacing, radii, and type sizes. See
  `store/brand.md`.
- **Privacy is the product.** No analytics, network requests, remote code, or
  data collection of any kind. Settings live in `chrome.storage.local` only.
- **Accessibility matters.** Keep ARIA attributes, focus-visible states,
  keyboard operability, and `prefers-reduced-motion` handling intact.

## Tests

Pure logic lives in `src/utils.js` and is covered by Node's built-in test
runner:

```sh
npm test
```

Please add or update tests when you change parsing or normalization logic.

## Submitting changes

1. Create a topic branch.
2. Keep commits focused; use clear messages (`fix:`, `feat:`, `docs:` prefixes
   are appreciated).
3. Verify `npm test` passes and the extension loads without console errors on
   WhatsApp Web (or the demo page).
4. Open a pull request describing what changed and why, with screenshots for
   visual changes.

## Reporting issues

Open a GitHub issue with your browser version, the extension version (shown in
the toolbar popup), steps to reproduce, and a screenshot if the problem is
visual. WhatsApp Web updates its DOM regularly, so selector breakage reports
are especially valuable.
