import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const requiredAssets = [
  path.join(root, "apps", "renderer", "dist", "index.html"),
  path.join(root, "apps", "renderer", "dist", "splash.html"),
  path.join(root, "apps", "renderer", "dist", ".vite", "manifest.json"),
  path.join(root, "server", "dist", "index.js")
];

const missing = requiredAssets.filter((asset) => !fs.existsSync(asset));

if (missing.length) {
  console.error("Production build is missing required assets:");
  for (const asset of missing) {
    console.error(`- ${asset}`);
  }
  process.exit(1);
}

console.log("Production assets verified.");

const rendererDist = path.join(root, "apps", "renderer", "dist");
const manifest = JSON.parse(fs.readFileSync(path.join(rendererDist, ".vite", "manifest.json"), "utf8"));
const bundledFiles = new Set(Object.values(manifest).flatMap(entry => [entry.file, ...(entry.css ?? []), ...(entry.assets ?? [])]).filter(Boolean));
const missingBundles = [...bundledFiles].filter(file => !fs.existsSync(path.join(rendererDist, file)));
const hasBundled = (name) => [...bundledFiles].some(file => file.includes(name));
if (missingBundles.length || !hasBundled("splash-background") || !hasBundled("Cairo-") || !hasBundled("materialdesignicons-webfont")) {
  console.error("Renderer is missing bundled splash/font assets:", missingBundles);
  process.exit(1);
}
console.log("Offline splash, fonts, and renderer bundles verified.");
