/**
 * يولّد صور عقارات تجريبية (رسوم توضيحية مجرّدة، بلا صور أشخاص أو أماكن
 * حقيقية) لاستخدامها في بيانات العرض. يُشغَّل مرة واحدة، والمخرجات تُحفظ في
 * source-assets/demo/images ثم يستهلكها seed-demo-images.mjs.
 *
 *   node scripts/generate-demo-images.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { chromium } from "@playwright/test";
import { ROOT } from "./web-demo-env.mjs";

const OUT_DIR = path.join(ROOT, "source-assets", "demo", "images");

/** لوحة ألوان دلالي: تيل/سيج/أوكر — نفس عائلة ألوان الواجهة. */
const SCENES = [
  { file: "house-01.png", label: "بيت سكني", sky: "#cfe0df", body: "#116466", accent: "#c27c3a", kind: "house" },
  { file: "house-02.png", label: "بيت طابقين", sky: "#e3e7e0", body: "#5b6f62", accent: "#c27c3a", kind: "house2" },
  { file: "villa-01.png", label: "فيلا", sky: "#dbe6e6", body: "#0f5a5c", accent: "#d8a15f", kind: "villa" },
  { file: "land-01.png", label: "قطعة أرض", sky: "#dfe8dc", body: "#6d8a6f", accent: "#c27c3a", kind: "land" },
  { file: "land-02.png", label: "أرض بواجهة", sky: "#d9e4e8", body: "#4f7f86", accent: "#c27c3a", kind: "land2" },
  { file: "farm-01.png", label: "مزرعة", sky: "#e2ead9", body: "#587a4a", accent: "#c27c3a", kind: "farm" },
];

function svgFor(scene) {
  const { sky, body, accent, kind, label } = scene;

  const shapes = {
    house: `
      <rect x="180" y="360" width="480" height="300" fill="${body}"/>
      <polygon points="140,360 420,190 700,360" fill="${accent}"/>
      <rect x="300" y="470" width="110" height="190" fill="${sky}" opacity="0.85"/>
      <rect x="470" y="440" width="120" height="100" fill="${sky}" opacity="0.6"/>
      <rect x="720" y="450" width="300" height="210" fill="${body}" opacity="0.35"/>`,
    house2: `
      <rect x="200" y="270" width="420" height="390" fill="${body}"/>
      <rect x="620" y="400" width="260" height="260" fill="${body}" opacity="0.6"/>
      <polygon points="170,270 410,150 650,270" fill="${accent}"/>
      <rect x="250" y="330" width="90" height="90" fill="${sky}" opacity="0.8"/>
      <rect x="400" y="330" width="90" height="90" fill="${sky}" opacity="0.8"/>
      <rect x="250" y="490" width="90" height="170" fill="${sky}" opacity="0.7"/>
      <rect x="660" y="450" width="80" height="80" fill="${sky}" opacity="0.6"/>`,
    villa: `
      <rect x="120" y="300" width="620" height="360" fill="${body}"/>
      <rect x="740" y="380" width="220" height="280" fill="${body}" opacity="0.7"/>
      <rect x="120" y="270" width="840" height="34" fill="${accent}"/>
      <rect x="180" y="360" width="150" height="110" fill="${sky}" opacity="0.85"/>
      <rect x="380" y="360" width="150" height="110" fill="${sky}" opacity="0.85"/>
      <rect x="580" y="360" width="110" height="110" fill="${sky}" opacity="0.85"/>
      <ellipse cx="540" cy="690" rx="300" ry="34" fill="${accent}" opacity="0.25"/>`,
    land: `
      <rect x="120" y="420" width="840" height="240" fill="${body}" opacity="0.45"/>
      <path d="M120 420 L960 420 L900 660 L180 660 Z" fill="${body}" opacity="0.75"/>
      <line x1="180" y1="660" x2="120" y2="420" stroke="${accent}" stroke-width="8"/>
      <line x1="900" y1="660" x2="960" y2="420" stroke="${accent}" stroke-width="8"/>
      <rect x="440" y="300" width="200" height="90" fill="${accent}" opacity="0.85"/>`,
    land2: `
      <rect x="100" y="440" width="880" height="220" fill="${body}" opacity="0.55"/>
      <rect x="100" y="410" width="880" height="30" fill="${accent}" opacity="0.9"/>
      <rect x="140" y="480" width="380" height="150" fill="${body}" opacity="0.8"/>
      <rect x="560" y="480" width="380" height="150" fill="${body}" opacity="0.6"/>
      <circle cx="820" cy="250" r="70" fill="${accent}" opacity="0.5"/>`,
    farm: `
      <rect x="100" y="450" width="880" height="210" fill="${body}" opacity="0.55"/>
      <g fill="${body}">
        <circle cx="240" cy="400" r="70"/><rect x="230" y="400" width="20" height="90"/>
        <circle cx="430" cy="380" r="85"/><rect x="420" y="380" width="20" height="110"/>
        <circle cx="640" cy="405" r="65"/><rect x="630" y="405" width="20" height="85"/>
      </g>
      <rect x="760" y="360" width="180" height="130" fill="${accent}" opacity="0.85"/>
      <polygon points="740,360 850,290 960,360" fill="${body}"/>`,
  }[kind];

  return `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="720" viewBox="0 0 1080 720">
    <defs>
      <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="${sky}"/>
        <stop offset="100%" stop-color="#ffffff"/>
      </linearGradient>
    </defs>
    <rect width="1080" height="720" fill="url(#bg)"/>
    ${shapes}
    <rect x="0" y="660" width="1080" height="60" fill="#ffffff" opacity="0.9"/>
    <text x="540" y="700" text-anchor="middle" font-family="Tahoma, Segoe UI, Arial"
          font-size="26" fill="#3a3a3a">${label} — صورة تجريبية</text>
  </svg>`;
}

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1080, height: 720 } });

fs.mkdirSync(OUT_DIR, { recursive: true });

for (const scene of SCENES) {
  await page.setContent(
    `<body style="margin:0">${svgFor(scene)}</body>`,
    { waitUntil: "load" },
  );
  const target = path.join(OUT_DIR, scene.file);
  await page.screenshot({ path: target, type: "png" });
  console.log(`✚ ${path.relative(ROOT, target)}`);
}

await browser.close();
console.log(`\n✓ تم توليد ${SCENES.length} صورة تجريبية في source-assets/demo/images`);
