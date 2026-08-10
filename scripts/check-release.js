const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const packageJson = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const manifest = JSON.parse(fs.readFileSync(path.join(root, "manifest.json"), "utf8"));
const changelog = fs.readFileSync(path.join(root, "CHANGELOG.md"), "utf8");
const tag = process.argv[2] || process.env.GITHUB_REF_NAME;

if (!tag) {
  console.error("Usage: npm run release:check -- <version-tag>");
  process.exit(1);
}

const semver = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?$/;
const errors = [];

if (!semver.test(tag)) errors.push(`Tag '${tag}' is not a valid SemVer version (expected e.g. 1.1.0).`);
if (packageJson.version !== tag) errors.push(`package.json is ${packageJson.version}, but the tag is ${tag}.`);
if (manifest.version !== tag) errors.push(`manifest.json is ${manifest.version}, but the tag is ${tag}.`);
if (!changelog.includes(`## [${tag}]`)) errors.push(`CHANGELOG.md has no '${tag}' release heading.`);

if (errors.length) {
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log(`Release ${tag} is internally consistent.`);
