# Generated artwork source

Prompts for regenerating the Refined icon reference and Chrome Web Store
promotional artwork. Palette and constraints follow `store/brand.md`.

Generated output is a **design reference for the icon** (trace to SVG by hand —
generators are not crisp enough for 16 px) and the **background layer for the
promo tiles** (text and the icon mark are composited by
`store/build-assets.js`, which crops cover/center at 1400×560 and cover/right
at 440×280 — keep all important detail in the right two-thirds).

## Icon prompt

Minimalist flat vector app icon for a desktop messaging utility. A rounded
square (squircle, ~22% corner radius) filled with a subtle top-to-bottom
WhatsApp-green gradient from #06CF9C to #008069. Centered on it, a bold white
geometric letterform "R" built from interface shapes: the bowl of the R is a
rounded rectangular pane with a thin inset divider line suggesting a resizable
sidebar, the leg kicks forward with a rounded terminal. One tiny accent: a soft
mint (#D9FDD3) dot or divider inside the bowl. Crisp edges, perfectly centered,
generous even padding (mark fills ~70% of the tile), flat design with at most
one soft inner shadow for depth. Must stay legible at 16×16 pixels.
Style: modern flat app icon, vector, Dribbble/App-Store quality, solid shapes,
no texture.
Negative: no speech bubble, no phone handset, no 3D render, no bevel or gloss,
no photorealism, no background scene, no extra text or letters, no watermark,
no border, no noise.

## Promo artwork prompt (marquee + small tile background)

Premium abstract product illustration for a Chrome extension that makes a
desktop messaging app calmer, wider, and more private. Wide horizontal
composition on a deep charcoal studio background (#0B141A to #111B21), calm
empty negative space on the left third for typography.

On the right two-thirds, a floating cluster of three layered, rounded-corner
interface panes in dark surfaces (#202C33) with satin matte finish, arranged
with gentle depth and parallax:
– the front pane is visibly WIDER than the others, with a glowing thin green
  drag-handle (#06CF9C) on its right edge, suggesting a resizable panel;
– the middle pane is rendered as frosted privacy glass — its abstract content
  rows softly blurred behind translucent glass;
– the back pane carries a neat vertical rail of small rounded folder chips,
  one highlighted in soft green (#00A884 at low opacity).

Abstract content only: rounded placeholder bars and circles, no readable text.
Accents in #00A884 and #25D366, one soft mint highlight (#D9FDD3), muted cool
gray details. Soft controlled rim light from the upper left, faint green
ambient glow beneath the cluster, secure and professional mood, native
desktop-software feel. Sharp geometry, high polish, editorial 3D-illustration
style, extremely clean.

Negative: no logos, no brand names, no letters or UI text, no phone handset,
no speech bubble, no people or hands, no device mockup or laptop, no
screenshot, no watermark, no lens flare, no clutter in the left third.

## Workflow

1. Generate the artwork at ≥ 2800×1120, save it over
   `whatsapp-web-refined-marketing-artwork.png`.
2. Rebuild the store tiles:
   `npm install --no-save playwright sharp && node store/build-assets.js`
3. Delete `node_modules` afterwards to keep the repository lean.

Screenshots are never generated — Chrome Web Store policy requires real UI, so
they come from `demo/index.html` via the same build script.
