// Patch the DSH settings shell's navIcon() so the "声音" settings section
// (id "dsh-sounds") shows a speaker glyph instead of the default gear icon.
//
// The settings nav glyphs are hardcoded in @deepseek-ai/dsh-client-ui-settings-general
// (models/agent-presets/plugins get special icons; every other section id falls
// back to the gear). There is no registration channel for a section icon, so
// this script applies a tiny local patch to the installed client bundle:
// one extra `if (id === "dsh-sounds")` branch with an inline speaker SVG.
//
// Idempotent: a second run detects the marker comment and skips. A dsh
// upgrade that reinstalls the package reverts the patch — re-run this script.
// Usage: node scripts/patch-nav-icon.mjs
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const target = "C:\\Users\\Lenovo\\.dsh\\profiles\\node_modules\\@deepseek-ai\\dsh-client-ui-settings-general\\lib\\client.js";

const MARKER = '/* dsh-sounds: speaker nav icon (see scripts/patch-nav-icon.mjs) */';
const ANCHOR = 'if (id === "plugins") return';

const branch = [
  MARKER,
  '\t\t\tif (id === "dsh-sounds") return (0, react_jsx_runtime.jsx)("svg", {',
  '\t\t\t\tclassName: SettingsRoot_module_css_default.navIcon,',
  '\t\t\t\twidth: 16,',
  '\t\t\t\theight: 16,',
  '\t\t\t\tviewBox: "0 0 24 24",',
  '\t\t\t\tfill: "currentColor",',
  '\t\t\t\t"aria-hidden": true,',
  '\t\t\t\tchildren: (0, react_jsx_runtime.jsx)("path", {',
  '\t\t\t\t\td: "M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"',
  '\t\t\t\t})',
  '\t\t\t});',
  '',
].join("\n");

const source = readFileSync(target, "utf8");
if (source.includes(MARKER)) {
  console.log("already patched — nothing to do");
} else if (!source.includes(ANCHOR)) {
  throw new Error(`anchor not found in ${target} (dsh upgraded? re-check the bundle format)`);
} else {
  const patched = source.replace(ANCHOR, branch + '\t\t\t' + ANCHOR);
  writeFileSync(target, patched);
  console.log("patched navIcon: dsh-sounds now renders a speaker glyph");
}
