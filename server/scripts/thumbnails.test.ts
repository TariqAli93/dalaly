import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import AdmZip from "adm-zip";
import { config } from "../src/infrastructure/config.js";
import { pool } from "../src/infrastructure/database/pool.js";
import { login } from "../src/modules/auth/auth.service.js";
import { hashPin } from "../src/modules/auth/crypto.js";
import { exportBackup, restoreBackup } from "../src/modules/backup/backup.service.js";
import { resolveImageAbsolutePath, resolveThumbnailPath } from "../src/modules/images/images.service.js";
import { removalTestContext } from "./removal-test-context.js";

// Needs PostgreSQL (DB_* from .env); creates and drops its own dalaly_removal_test_* database.
// Table rows get their primary image with the paged list, and its small
// thumbnail when one exists; originals are never changed.

// 1×1 images: an "original" PNG and a JPEG thumbnail as the renderer sends them.
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);
const JPEG = Buffer.from(
  "/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=",
  "base64",
);
const original = (name: string) => ({ data: `data:image/png;base64,${PNG.toString("base64")}`, original_name: name });
const thumbnail = `data:image/jpeg;base64,${JPEG.toString("base64")}`;

type Row = { id: number; primary_image: { id: number; thumbnail: boolean } | null };

test("list rows carry their primary image and thumbnails never touch originals", async (t) => {
  const ctx = await removalTestContext("thumbnails");
  try {
    const send = (method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE", url: string, body?: unknown, token = ctx.token) =>
      ctx.app.inject({
        method,
        url,
        ...(body === undefined ? {} : { payload: JSON.stringify(body) }),
        headers: { authorization: `Bearer ${token}`, ...(body === undefined ? {} : { "content-type": "application/json" }) },
      });
    const pagedRow = async (list: "properties" | "rentals", id: number) => {
      const result = await send("GET", `/api/${list}/paged?page=1&page_size=100`);
      assert.equal(result.statusCode, 200, result.body);
      const row = (result.json().items as Row[]).find((item) => item.id === id);
      assert.ok(row, `${list} ${id} is on the page`);
      return row.primary_image;
    };
    const upload = async (url: string, images: unknown[]) => {
      const result = await send("POST", url, { images });
      assert.equal(result.statusCode, 201, result.body);
      return (result.json() as Array<{ id: number; file_path: string }>).map((row) => ({ id: Number(row.id), filePath: row.file_path }));
    };
    const sha256 = async (file: string) => crypto.createHash("sha256").update(await fs.readFile(file)).digest("hex");
    const propertyImages = `/api/properties/${ctx.property.id}/images`;
    const rentalImages = `/api/rentals/${ctx.rental.id}/images`;

    await t.test("a property without images has no primary image", async () => {
      assert.equal(await pagedRow("properties", ctx.property.id), null);
      assert.equal(await pagedRow("rentals", ctx.rental.id), null);
    });

    const [first, second] = await upload(propertyImages, [original("a.png"), original("b.png")]);

    await t.test("the primary image is the flagged one, else the first in order, as the gallery shows it", async () => {
      assert.deepEqual(await pagedRow("properties", ctx.property.id), { id: first.id, thumbnail: false });
      assert.equal((await send("PATCH", `${propertyImages}/${second.id}/primary`)).statusCode, 200);
      assert.deepEqual(await pagedRow("properties", ctx.property.id), { id: second.id, thumbnail: false });

      await pool.query("UPDATE property_images SET is_primary = false WHERE property_id = $1", [ctx.property.id]);
      assert.equal((await send("PUT", `${propertyImages}/order`, { ids: [second.id, first.id] })).statusCode, 200);
      assert.equal((await pagedRow("properties", ctx.property.id))?.id, second.id);
      assert.equal((await send("PUT", `${propertyImages}/order`, { ids: [first.id, second.id] })).statusCode, 200);
      assert.equal((await pagedRow("properties", ctx.property.id))?.id, first.id);
    });

    await t.test("a thumbnail made later is stored beside the images folder and the original stays as it was", async () => {
      const originalFile = resolveImageAbsolutePath(first.filePath)!;
      const before = { hash: await sha256(originalFile), mtime: (await fs.stat(originalFile)).mtimeMs };
      const thumbnailUrl = `${propertyImages}/${first.id}/thumbnail`;
      assert.equal((await send("GET", thumbnailUrl)).statusCode, 404, "no thumbnail yet");

      const saved = await send("PUT", thumbnailUrl, { data: thumbnail });
      assert.equal(saved.statusCode, 200, saved.body);
      assert.deepEqual(await pagedRow("properties", ctx.property.id), { id: first.id, thumbnail: true });

      const served = await ctx.app.inject({ url: `${thumbnailUrl}?token=${encodeURIComponent(ctx.token)}` });
      assert.equal(served.statusCode, 200);
      assert.equal(served.headers["content-type"], "image/jpeg");
      assert.deepEqual(served.rawPayload, JPEG);

      assert.equal(await sha256(originalFile), before.hash);
      assert.equal((await fs.stat(originalFile)).mtimeMs, before.mtime);
      const stored = resolveThumbnailPath(first.filePath)!;
      assert.ok(!stored.startsWith(path.resolve(config.imagesDir) + path.sep), "not inside the images folder");
      assert.ok(stored.startsWith(path.resolve(ctx.root) + path.sep));
    });

    await t.test("only a JPEG thumbnail of reasonable size is accepted", async () => {
      const url = `${propertyImages}/${second.id}/thumbnail`;
      const png = await send("PUT", url, { data: `data:image/png;base64,${PNG.toString("base64")}` });
      assert.equal(png.statusCode, 400);
      const notJpeg = await send("PUT", url, { data: `data:image/jpeg;base64,${PNG.toString("base64")}` });
      assert.equal(notJpeg.statusCode, 400);
      assert.match(notJpeg.json().message, /JPEG/);
      const huge = await send("PUT", url, { data: `data:image/jpeg;base64,/9j/${"A".repeat(400_000)}` });
      assert.equal(huge.statusCode, 400);
      const badUpload = await send("POST", propertyImages, { images: [{ ...original("c.png"), thumbnail: "data:image/jpeg;base64,AAAA" }] });
      assert.equal(badUpload.statusCode, 400);
      const rows = await pool.query("SELECT count(*)::int AS count FROM property_images WHERE property_id = $1", [ctx.property.id]);
      assert.equal(rows.rows[0].count, 2, "a rejected thumbnail stores no original either");
      assert.equal((await pagedRow("properties", ctx.property.id))?.thumbnail, true, "the first image's thumbnail is unchanged");
    });

    await t.test("thumbnails belong to their own property and need the image permission to write", async () => {
      const other = (
        await pool.query(
          "INSERT INTO properties(code,name,property_type,legal_type,area_value,area_unit,pricing_method,total_price,owner_name,owner_phone,governorate,address_details) VALUES('THUMB-P2','عقار آخر','بيت','طابو ملك صرف',100,'متر','total',1,'مالك','07700000009','بغداد','الكرادة') RETURNING id",
        )
      ).rows[0];
      assert.equal((await send("GET", `/api/properties/${other.id}/images/${first.id}/thumbnail`)).statusCode, 404);
      assert.equal((await send("PUT", `/api/properties/${other.id}/images/${second.id}/thumbnail`, { data: thumbnail })).statusCode, 404);

      const role = (await pool.query("INSERT INTO roles(name) VALUES('thumbnail_reader') RETURNING id")).rows[0];
      await pool.query("INSERT INTO role_permissions(role_id, permission_id) SELECT $1, id FROM permissions WHERE key = 'properties.read'", [role.id]);
      const user = (
        await pool.query("INSERT INTO users(username, display_name, pin_hash) VALUES('reader', 'reader', $1) RETURNING id", [await hashPin("5678")])
      ).rows[0];
      await pool.query("INSERT INTO user_roles(user_id, role_id) VALUES($1, $2)", [user.id, role.id]);
      const reader = (await login("reader", "5678"))!.token;
      assert.equal((await send("GET", `${propertyImages}/${first.id}/thumbnail`, undefined, reader)).statusCode, 200);
      assert.equal((await send("PUT", `${propertyImages}/${second.id}/thumbnail`, { data: thumbnail }, reader)).statusCode, 403);
    });

    await t.test("an upload sends its thumbnail with the original", async () => {
      const [rentalImage] = await upload(rentalImages, [{ ...original("r.png"), thumbnail }]);
      assert.deepEqual(await pagedRow("rentals", ctx.rental.id), { id: rentalImage.id, thumbnail: true });
      const served = await send("GET", `${rentalImages}/${rentalImage.id}/thumbnail`);
      assert.equal(served.statusCode, 200);
      assert.deepEqual(served.rawPayload, JPEG);
      assert.deepEqual(await fs.readFile(resolveImageAbsolutePath(rentalImage.filePath)!), PNG);

      const [later] = await upload(rentalImages, [original("r2.png")]);
      assert.equal((await send("PUT", `${rentalImages}/${later.id}/thumbnail`, { data: thumbnail })).statusCode, 200);
      assert.equal((await send("GET", `/api/rentals/${ctx.rental.id + 1000}/images/${later.id}/thumbnail`)).statusCode, 404);
    });

    await t.test("the favorites lists, shown in the same tables, carry the primary image too", async () => {
      assert.equal((await send("POST", `/api/favorites/${ctx.property.id}`)).statusCode, 200);
      assert.equal((await send("POST", `/api/rental-favorites/${ctx.rental.id}`)).statusCode, 200);
      const properties = (await send("GET", "/api/favorites")).json() as Row[];
      assert.deepEqual(properties.find((row) => row.id === ctx.property.id)?.primary_image, { id: first.id, thumbnail: true });
      const rentals = (await send("GET", "/api/rental-favorites")).json() as Row[];
      assert.equal(rentals.find((row) => row.id === ctx.rental.id)?.primary_image?.thumbnail, true);
    });

    await t.test("a stored path cannot reach outside the thumbnails folder", async () => {
      assert.equal(resolveThumbnailPath("../../outside"), null);
      const escaped = (
        await pool.query(
          "INSERT INTO rentals(code,name,property_type,area_value,area_unit,rent_price,rent_period,owner_name,owner_phone,governorate,address_details) VALUES('THUMB-R2','إيجار آخر','بيت',100,'متر',1,'monthly','مالك','07700000009','بغداد','المنصور') RETURNING id",
        )
      ).rows[0];
      const image = (
        await pool.query("INSERT INTO rental_images(rental_id, file_path, is_primary) VALUES($1, '../../../outside.png', true) RETURNING id", [escaped.id])
      ).rows[0];
      assert.deepEqual(await pagedRow("rentals", Number(escaped.id)), { id: Number(image.id), thumbnail: false });
      assert.equal((await send("GET", `/api/rentals/${escaped.id}/images/${image.id}/thumbnail`)).statusCode, 404);
      assert.equal((await send("PUT", `/api/rentals/${escaped.id}/images/${image.id}/thumbnail`, { data: thumbnail })).statusCode, 400);
    });

    await t.test("backups leave thumbnails out, and after a restore they still match their originals", async () => {
      const output = path.join(ctx.root, "backups", "thumbnails.zip");
      assert.equal((await exportBackup(output, ctx.adminId)).ok, true);
      const zipBytes = await fs.readFile(output);
      const entries = new AdmZip(zipBytes).getEntries().map((entry) => entry.entryName);
      assert.ok(entries.some((name) => name.startsWith("images/properties/")), "originals are archived");
      assert.ok(!entries.some((name) => name.includes("thumbnails") || name.endsWith(".png.jpg")), "thumbnails are not");

      const restored = await restoreBackup(zipBytes, "full", ctx.adminId);
      assert.equal(restored.ok, true);
      // A full restore replaces the users table and with it the session.
      ctx.token = (await login("removal_admin", "1234"))!.token;
      const served = await send("GET", `${propertyImages}/${first.id}/thumbnail`);
      assert.equal(served.statusCode, 200);
      assert.deepEqual(served.rawPayload, JPEG);
      assert.deepEqual(await fs.readFile(resolveImageAbsolutePath(first.filePath)!), PNG);
    });

    await t.test("deleting an image deletes its thumbnail with it", async () => {
      const stored = resolveThumbnailPath(first.filePath)!;
      await fs.access(stored);
      assert.equal((await send("DELETE", `${propertyImages}/${first.id}`)).statusCode, 200);
      await assert.rejects(fs.access(stored));
      await assert.rejects(fs.access(resolveImageAbsolutePath(first.filePath)!));
      assert.deepEqual(await pagedRow("properties", ctx.property.id), { id: second.id, thumbnail: false });
    });
  } finally {
    await ctx.close();
    await fs.rm(ctx.root, { recursive: true, force: true });
  }
});
