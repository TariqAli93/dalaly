import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const requiredAssets = [
  path.join(root, "apps", "renderer", "dist", "index.html"),
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
