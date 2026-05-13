// One-shot script to rasterize public/og-default-tutor.svg → .png at
// 1200×630 (the standard OG image size). Run via:
//
//   pnpm run og:generate
//
// or directly: `node scripts/generate-og-default.mjs`.
//
// Why a script not a build step: the SVG source rarely changes (design
// touchups maybe twice a year), and committing the PNG means Vercel deploys
// don't need to install Sharp's native binaries. Re-run the script whenever
// the SVG changes; the PNG is the source of truth at request time.

import { readFile } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";

// Sharp is a transitive dep of the Next.js stack — pulled in automatically
// when Image Optimization is enabled. Resolve it via the explicit pnpm path
// rather than `import "sharp"` so we don't gain a direct prod dependency.
const __dirname = dirname(fileURLToPath(import.meta.url));
const sharpModulePath = join(
  __dirname,
  "..",
  "node_modules",
  ".pnpm",
  "sharp@0.34.5",
  "node_modules",
  "sharp",
  "lib",
  "index.js",
);
const { default: sharp } = await import(pathToFileURL(sharpModulePath).href);

const SVG_PATH = join(__dirname, "..", "public", "og-default-tutor.svg");
const PNG_PATH = join(__dirname, "..", "public", "og-default-tutor.png");

const svgBuffer = await readFile(SVG_PATH);

await sharp(svgBuffer)
  .resize(1200, 630, { fit: "fill" })
  .png({ compressionLevel: 9, palette: false })
  .toFile(PNG_PATH);

console.log(`✓ Generated ${PNG_PATH}`);
