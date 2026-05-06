/**
 * Generates PNG icons for Tauri from the SVG logo.
 * Run: node scripts/gen-icons.mjs
 * Requires: npm install -g sharp-cli  OR  Inkscape in PATH
 */
import { execSync } from "child_process";
import { existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const src = resolve(root, "apps/web/public/logo.svg");
const outDir = resolve(root, "apps/desktop/src-tauri/icons");

const SIZES = [
  { file: "32x32.png", size: 32 },
  { file: "128x128.png", size: 128 },
  { file: "128x128@2x.png", size: 256 },
  { file: "icon.png", size: 512 },
];

// Try sharp-cli first, then Inkscape
function convertWithSharp(svgPath, outPath, size) {
  execSync(
    `npx sharp-cli --input "${svgPath}" --output "${outPath}" resize ${size} ${size}`,
    { stdio: "inherit" }
  );
}

function convertWithInkscape(svgPath, outPath, size) {
  execSync(
    `inkscape --export-type=png --export-filename="${outPath}" -w ${size} -h ${size} "${svgPath}"`,
    { stdio: "inherit" }
  );
}

for (const { file, size } of SIZES) {
  const outPath = resolve(outDir, file);
  console.log(`Generating ${file} (${size}×${size})…`);
  try {
    convertWithSharp(src, outPath, size);
  } catch {
    try {
      convertWithInkscape(src, outPath, size);
    } catch {
      console.warn(`  ⚠ Could not generate ${file} — install sharp-cli or Inkscape`);
    }
  }
}

console.log("Done. Icons written to apps/desktop/src-tauri/icons/");
