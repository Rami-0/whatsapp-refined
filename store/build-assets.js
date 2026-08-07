const { chromium } = require("playwright");
const sharp = require("sharp");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const root = path.resolve(__dirname, "..");
const assets = path.join(__dirname, "assets");
const demoUrl = pathToFileURL(path.join(root, "demo", "index.html")).href;

function escapeXml(value) {
  return String(value).replace(/[<>&'"]/g, (character) => ({
    "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;"
  })[character]);
}

function svgOverlay(width, height, content) {
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
    <style>
      .title { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif; font-weight: 700; letter-spacing: -0.04em; }
      .copy { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif; font-weight: 450; }
    </style>
    ${content}
  </svg>`);
}

async function buildPromoAssets() {
  const art = path.join(__dirname, "source", "whatsapp-web-refined-marketing-artwork.png");
  const icon = path.join(root, "icons", "icon128.png");

  const marqueeText = svgOverlay(1400, 560, `
    <defs>
      <linearGradient id="shade" x1="0" x2="1">
        <stop offset="0" stop-color="#07110f" stop-opacity=".98"/>
        <stop offset=".48" stop-color="#07110f" stop-opacity=".78"/>
        <stop offset=".8" stop-color="#07110f" stop-opacity=".05"/>
      </linearGradient>
    </defs>
    <rect width="1400" height="560" fill="url(#shade)"/>
    <text class="copy" x="108" y="256" fill="#aebcb8" font-size="28">WhatsApp Web</text>
    <text class="title" x="104" y="330" fill="#f4faf7" font-size="76">Refined</text>
    <text class="copy" x="108" y="378" fill="#aebcb8" font-size="25">Your space. Your settings.</text>
    <rect x="108" y="416" width="52" height="4" rx="2" fill="#06cf9c"/>
    <text class="copy" x="108" y="464" fill="#d9fdd3" font-size="22">Layout · Privacy · Shortcuts</text>
  `);

  await sharp(art)
    .resize(1400, 560, { fit: "cover", position: "center" })
    .composite([
      { input: marqueeText, left: 0, top: 0 },
      { input: icon, left: 96, top: 86 }
    ])
    .png({ compressionLevel: 9 })
    .toFile(path.join(assets, "promo-marquee-1400x560.png"));

  const smallText = svgOverlay(440, 280, `
    <defs>
      <linearGradient id="shade" x1="0" x2="1">
        <stop offset="0" stop-color="#07110f" stop-opacity=".98"/>
        <stop offset=".68" stop-color="#07110f" stop-opacity=".62"/>
        <stop offset="1" stop-color="#07110f" stop-opacity=".2"/>
      </linearGradient>
    </defs>
    <rect width="440" height="280" fill="url(#shade)"/>
    <text class="copy" x="40" y="198" fill="#b9c8c3" font-size="18">WhatsApp Web</text>
    <text class="title" x="38" y="240" fill="#f4faf7" font-size="43">${escapeXml("Refined")}</text>
  `);

  await sharp(art)
    .resize(440, 280, { fit: "cover", position: "right" })
    .composite([
      { input: smallText, left: 0, top: 0 },
      { input: icon, left: 24, top: 36 }
    ])
    .png({ compressionLevel: 9 })
    .toFile(path.join(assets, "promo-small-440x280.png"));

  await sharp(icon).png({ compressionLevel: 9 }).toFile(path.join(assets, "icon-128.png"));
}

async function buildScreenshots() {
  const browser = await chromium.launch({
    headless: true,
    executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
  const shots = [
    ["screenshot-1-layout-1280x800.png", "sidebar&wide&settings&panel=layout", "layout"],
    ["screenshot-2-privacy-1280x800.png", "sidebar&privacy&settings&panel=privacy", "privacy"],
    ["screenshot-3-folders-1280x800.png", "sidebar&wide&hide-ai&hide-channels", null],
    ["screenshot-4-shortcuts-1280x800.png", "sidebar&settings&panel=shortcuts", "shortcuts"]
  ];

  for (const [filename, query, panel] of shots) {
    await page.goto(`${demoUrl}?${query}`, { waitUntil: "load" });
    await page.waitForTimeout(900);
    if (panel) {
      const tab = page.frameLocator(".wr-settings-frame").locator(`[data-panel-target="${panel}"]`);
      await tab.waitFor();
      await tab.click();
      await page.waitForTimeout(250);
    }
    await page.screenshot({ path: path.join(assets, filename), type: "png" });
  }

  await browser.close();
}

(async () => {
  await buildPromoAssets();
  await buildScreenshots();
  console.log("Built WhatsApp Web Refined Chrome Web Store assets in store/assets");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
