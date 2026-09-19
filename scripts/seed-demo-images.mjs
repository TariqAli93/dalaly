/**
 * يربط الصور التجريبية بعروض قاعدة العرض (dalaly_demo):
 * ينسخ الملفات إلى مجلد بيانات العرض ويضيف صفوف property_images.
 *
 * يعمل على قاعدة العرض فقط — يرفض التشغيل على أي قاعدة أخرى.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import pg from "pg";
import { ROOT, WEB_DEMO } from "./web-demo-env.mjs";

const SOURCE_DIR = path.join(ROOT, "source-assets", "demo", "images");
const IMAGES_DIR = path.join(ROOT, "server", "data", "web-demo", "images", "properties");

/** أي صور تناسب أي نوع عقار (كلها رسوم مجرّدة بلا بيانات حقيقية). */
const BY_TYPE = {
  بيت: ["house-01.png", "house-02.png", "land-02.png"],
  فيلا: ["villa-01.png", "house-02.png", "land-01.png"],
  أرض: ["land-01.png", "land-02.png", "farm-01.png"],
  مزرعة: ["farm-01.png", "land-01.png", "land-02.png"],
};
const FALLBACK = ["land-01.png", "house-01.png", "villa-01.png"];

if (WEB_DEMO.dbName !== "dalaly_demo") {
  console.error(`✗ هذا السكربت مخصص لقاعدة العرض فقط (dalaly_demo)، لا "${WEB_DEMO.dbName}".`);
  process.exit(1);
}

if (!fs.existsSync(SOURCE_DIR)) {
  console.error("✗ لا توجد صور تجريبية. شغّل: node scripts/generate-demo-images.mjs");
  process.exit(1);
}

const client = new pg.Client({ ...WEB_DEMO.db, database: WEB_DEMO.dbName });
await client.connect();

// نبدأ من حالة نظيفة: صفوف الصور وملفاتها.
await client.query("delete from property_images");
fs.rmSync(IMAGES_DIR, { recursive: true, force: true });
fs.mkdirSync(IMAGES_DIR, { recursive: true });

const { rows } = await client.query(
  "select id, property_type from properties order by id",
);

let count = 0;
for (const property of rows) {
  const files = BY_TYPE[property.property_type] ?? FALLBACK;
  const dir = path.join(IMAGES_DIR, String(property.id));
  fs.mkdirSync(dir, { recursive: true });

  for (const [index, file] of files.entries()) {
    const fileName = `${crypto.randomUUID()}.png`;
    fs.copyFileSync(path.join(SOURCE_DIR, file), path.join(dir, fileName));

    await client.query(
      `insert into property_images
         (property_id, file_path, original_name, is_primary, sort_order)
       values ($1, $2, $3, $4, $5)`,
      [property.id, `${property.id}/${fileName}`, file, index === 0, index],
    );
    count += 1;
  }
}

await client.end();
console.log(`✓ رُبطت ${count} صورة تجريبية بـ ${rows.length} عرض.`);
