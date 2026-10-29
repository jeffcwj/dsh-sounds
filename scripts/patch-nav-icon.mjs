// Patch the DSH settings shell's navIcon() so the "声音" settings section
// (id "dsh-sounds") shows a speaker glyph instead of the default gear icon.
//
// Why a patch: the settings nav glyphs are hardcoded in
// @deepseek-ai/dsh-client-ui-settings-general — `navIcon(id)` maps only the
// built-in section ids (account/models/agent-presets/plugins/archived-sessions)
// and every other section id falls back to IconSettingsOutlineMedium. The
// settings.section slot contract has no icon field and the shipped icon set
// has no speaker/volume glyph, so a client plugin cannot register one.
//
// This script appends one `if (id === "dsh-sounds")` branch with an inline
// speaker SVG to the installed bundle. Idempotent: a second run detects the
// marker and skips. A dsh upgrade that reinstalls the package reverts the
// patch — re-run this script (it finds the new install automatically).
//
// Usage:
//   node scripts/patch-nav-icon.mjs            # patch every installed 0.2.x copy
//   node scripts/patch-nav-icon.mjs --check    # report status only, exit 1 if unpatched
//   DSH_VERSION_DIR=C:\...\versions\0.2.2-alpha.2 node scripts/patch-nav-icon.mjs
import { existsSync, readFileSync, readdirSync, realpathSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const MARKER = '/* dsh-sounds: speaker nav icon (see scripts/patch-nav-icon.mjs) */';
const ANCHOR = 'if (id === "plugins") return';
const PACKAGE_SUFFIX = join("node_modules", "@deepseek-ai", "dsh-client-ui-settings-general", "lib", "client.js");
const defaultVersionDir = "C:\\Users\\Lenovo\\.dsh-win\\versions\\0.2.2-alpha.2";
const checkOnly = process.argv.includes("--check");

function targets() {
  const versionDir = process.env.DSH_VERSION_DIR ?? defaultVersionDir;
  const found = new Set();
  if (!existsSync(versionDir)) return [];
  const pnpm = join(versionDir, "node_modules", ".pnpm");
  if (existsSync(pnpm)) {
    for (const dir of readdirSync(pnpm)) {
      if (!dir.startsWith("@deepseek-ai+dsh-client-ui-")) continue;
      const candidate = join(pnpm, dir, PACKAGE_SUFFIX);
      if (!existsSync(candidate)) continue;
      try {
        found.add(realpathSync(candidate));
      } catch {
        found.add(candidate);
      }
    }
  }
  const direct = join(versionDir, PACKAGE_SUFFIX);
  if (existsSync(direct)) {
    try {
      found.add(realpathSync(direct));
    } catch {
      found.add(direct);
    }
  }
  return [...found];
}

const iconBranch = [
  MARKER,
  '\t\t\tif (id === "dsh-sounds") return (0, react_jsx_runtime.jsx)("svg", {',
  "\t\t\t\tclassName: SettingsRoot_module_css_default.navIcon,",
  "\t\t\t\twidth: 16,",
  "\t\t\t\theight: 16,",
  '\t\t\t\tviewBox: "0 0 24 24",',
  '\t\t\t\tfill: "currentColor",',
  '\t\t\t\t"aria-hidden": true,',
  '\t\t\t\tchildren: (0, react_jsx_runtime.jsx)("path", {',
  '\t\t\t\t\td: "M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z",',
  "\t\t\t\t})",
  "\t\t\t});",
  "",
].join("\n");

const all = targets();
if (all.length === 0) {
  console.error(`no dsh-client-ui-settings-general bundle found under ${process.env.DSH_VERSION_DIR ?? defaultVersionDir}`);
  process.exit(2);
}

let patched = 0;
let already = 0;
for (const target of all) {
  const source = readFileSync(target, "utf8");
  const state = source.includes(MARKER) ? "already" : source.includes(ANCHOR) ? "patchable" : "anchor-missing";
  console.log(`${state}\t${target}`);
  if (state === "already") already += 1;
  if (state === "patchable") {
    if (!checkOnly) {
      writeFileSync(target, source.replace(ANCHOR, iconBranch + "\t\t\t" + ANCHOR));
      patched += 1;
    }
  }
}

if (patched > 0) console.log(`patched ${patched} bundle(s): dsh-sounds now renders a speaker glyph (restart the host / hard-refresh the page)`);
if (already > 0 && checkOnly) console.log("patched already");
if (checkOnly && patched === 0 && already === 0) process.exit(1);
