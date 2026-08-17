// Build lib/client.js from src/client.template.js, embedding the bundled
// opencode sound assets as base64 data URIs. Usage: node scripts/build-client.mjs
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const assetsDir = join(root, "assets");
const template = readFileSync(join(root, "src", "client.template.js"), "utf8");

const sounds = {};
for (const file of readdirSync(assetsDir).filter((name) => name.endsWith(".mp3"))) {
  const name = file.replace(/\.mp3$/, "");
  const data = readFileSync(join(assetsDir, file)).toString("base64");
  sounds[name] = `data:audio/mpeg;base64,${data}`;
}

const placeholder = "__SOUNDS_JSON__";
if (!template.includes(placeholder)) throw new Error("template missing __SOUNDS_JSON__ placeholder");
const bundle = template.replace(placeholder, JSON.stringify(sounds));
writeFileSync(join(root, "lib", "client.js"), bundle);
console.log(`built lib/client.js with ${Object.keys(sounds).length} embedded sounds: ${Object.keys(sounds).join(", ")}`);
