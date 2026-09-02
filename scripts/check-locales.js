/* Validates every _locales/<locale>/messages.json against the English source:
   same keys, intact $PLACEHOLDER$ tokens, matching placeholder definitions,
   and a Chrome-Web-Store-safe appDesc length. */
const fs = require("node:fs");
const path = require("node:path");

const localesDir = path.resolve(__dirname, "..", "_locales");
const read = (locale) => JSON.parse(fs.readFileSync(path.join(localesDir, locale, "messages.json"), "utf8"));
const placeholderTokens = (value) => (value.match(/\$[A-Za-z0-9_]+\$/g) || []).sort().join(",");

const source = read("en");
const sourceKeys = Object.keys(source);
const locales = fs.readdirSync(localesDir).filter((entry) => entry !== "en" && fs.statSync(path.join(localesDir, entry)).isDirectory());
const errors = [];

for (const locale of locales) {
  let messages;
  try {
    messages = read(locale);
  } catch (error) {
    errors.push(`${locale}: invalid JSON (${error.message})`);
    continue;
  }
  for (const key of sourceKeys) {
    if (!messages[key]?.message) {
      errors.push(`${locale}: missing key '${key}'`);
      continue;
    }
    if (placeholderTokens(messages[key].message) !== placeholderTokens(source[key].message)) {
      errors.push(`${locale}: '${key}' placeholder mismatch ('${messages[key].message}')`);
    }
    if (JSON.stringify(messages[key].placeholders || null) !== JSON.stringify(source[key].placeholders || null)) {
      errors.push(`${locale}: '${key}' placeholders definition differs from en`);
    }
  }
  for (const key of Object.keys(messages)) {
    if (!source[key]) errors.push(`${locale}: unknown key '${key}'`);
  }
  const descLength = [...(messages.appDesc?.message || "")].length;
  if (descLength > 132) errors.push(`${locale}: appDesc is ${descLength} characters (Chrome Web Store limit is 132)`);
}

if (errors.length) {
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log(`${locales.length + 1} locales are consistent with en (${sourceKeys.length} keys).`);
