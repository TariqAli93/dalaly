import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { config } from "../src/infrastructure/config.js";
import { pool } from "../src/infrastructure/database/pool.js";
import {
  resolveImageAbsolutePath,
  resolveThumbnailPath,
  storeImages,
} from "../src/modules/images/images.service.js";
import { resolveManagedFile } from "../src/modules/documents/documents.storage.js";
import { removalTestContext } from "./removal-test-context.js";

// Needs PostgreSQL (DB_* from .env); creates and drops its own dalaly_removal_test_* database.
// Image, follow-up, document and logo operations act only on the record in
// the URL, and no file is left on disk without its row (Phase 1a).

const PNG =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
const JPEG =
  "/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=";
const image = (name: string) => ({
  data: `data:image/png;base64,${PNG}`,
  original_name: name,
  thumbnail: `data:image/jpeg;base64,${JPEG}`,
});

type ImageRow = { id: number; file_path: string; is_primary: boolean };

function filesIn(dir: string) {
  return fs.existsSync(dir) ? fs.readdirSync(dir) : [];
}

test("file and follow-up operations stay on their own record", async (t) => {
  const ctx = await removalTestContext("fileintegrity");
  try {
    const send = (
      method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE",
      url: string,
      body?: unknown,
    ) =>
      ctx.app.inject({
        method,
        url,
        ...(body === undefined ? {} : { payload: JSON.stringify(body) }),
        headers: {
          authorization: `Bearer ${ctx.token}`,
          ...(body === undefined ? {} : { "content-type": "application/json" }),
        },
      });
    const newProperty = async (code: string) =>
      Number(
        (
          await pool.query(
            "INSERT INTO properties(code,property_type,legal_type,area_value,area_unit,pricing_method,total_price,owner_name,owner_phone) VALUES($1,'بيت','طابو ملك صرف',100,'متر','total',1000,'مالك','0770') RETURNING id",
            [code],
          )
        ).rows[0].id,
      );
    const newRental = async (code: string) =>
      Number(
        (
          await pool.query(
            "INSERT INTO rentals(code,property_type,area_value,area_unit,rent_price,rent_period,owner_name,owner_phone) VALUES($1,'بيت',100,'متر',500000,'monthly','مالك','0770') RETURNING id",
            [code],
          )
        ).rows[0].id,
      );
    const upload = async (url: string, names: string[]) => {
      const result = await send("POST", url, { images: names.map(image) });
      assert.equal(result.statusCode, 201, result.body);
      return result.json() as ImageRow[];
    };
    const images = async (url: string) =>
      (await send("GET", url)).json() as ImageRow[];

    const propertyA = ctx.property.id;
    const propertyB = await newProperty("FI-B");
    const urlA = `/api/properties/${propertyA}/images`;
    const urlB = `/api/properties/${propertyB}/images`;
    const [a1, a2] = await upload(urlA, ["a1.png", "a2.png"]);
    const [b1] = await upload(urlB, ["b1.png"]);

    await t.test("another property's image cannot be deleted, read or made primary through this one", async () => {
      assert.equal((await send("DELETE", `${urlA}/${b1.id}`)).statusCode, 404);
      assert.equal((await send("GET", `${urlA}/${b1.id}/file`)).statusCode, 404);
      assert.equal((await send("PATCH", `${urlA}/${b1.id}/primary`)).statusCode, 404);
      const [b] = await images(urlB);
      assert.equal(b.id, b1.id, "B keeps its image");
      assert.equal(b.is_primary, true, "and it stays primary");
      assert.ok(fs.existsSync(resolveImageAbsolutePath(b1.file_path)!), "B's file stays");
      assert.equal((await images(urlA)).find((row) => row.is_primary)?.id, a1.id, "A's primary is unchanged");
    });

    await t.test("an unknown image is a 404 that leaves the primary image as it was", async () => {
      assert.equal((await send("PATCH", `${urlA}/999999/primary`)).statusCode, 404);
      assert.equal((await images(urlA)).filter((row) => row.is_primary).length, 1);
      assert.equal((await send("PATCH", `${urlA}/${a2.id}/primary`)).statusCode, 200);
      const rows = await images(urlA);
      assert.deepEqual(rows.filter((row) => row.is_primary).map((row) => row.id), [a2.id]);
    });

    await t.test("deleting the primary image makes the first remaining one primary", async () => {
      assert.equal((await send("DELETE", `${urlA}/${a2.id}`)).statusCode, 200);
      assert.equal(fs.existsSync(resolveImageAbsolutePath(a2.file_path)!), false);
      assert.equal(fs.existsSync(resolveThumbnailPath(a2.file_path)!), false);
      const rows = await images(urlA);
      assert.deepEqual(rows.map((row) => [row.id, row.is_primary]), [[a1.id, true]]);
    });

    await t.test("an upload to a missing listing is a 404 and writes nothing", async () => {
      const missing = 987654;
      assert.equal(
        (await send("POST", `/api/properties/${missing}/images`, { images: [image("x.png")] })).statusCode,
        404,
      );
      assert.equal(
        (await send("POST", `/api/rentals/${missing}/images`, { images: [image("x.png")] })).statusCode,
        404,
      );
      assert.deepEqual(filesIn(path.join(config.imagesDir, String(missing))), []);
      assert.deepEqual(filesIn(path.join(config.imagesDir, "rentals", String(missing))), []);
    });

    await t.test("a batch with one file that is not an image saves none of it", async () => {
      const before = filesIn(path.join(config.imagesDir, String(propertyB)));
      const result = await send("POST", urlB, {
        images: [image("ok.png"), { data: `data:image/png;base64,${Buffer.from("<html>not an image</html>").toString("base64")}` }],
      });
      assert.equal(result.statusCode, 400, result.body);
      assert.equal((await images(urlB)).length, 1);
      assert.deepEqual(filesIn(path.join(config.imagesDir, String(propertyB))), before);
    });

    await t.test("a stored file is named after its content, not its declared type", async () => {
      const [row] = (
        await send("POST", urlB, { images: [{ data: `data:image/jpeg;base64,${PNG}` }] })
      ).json() as ImageRow[];
      assert.match(row.file_path, /\.png$/);
    });

    await t.test("when the rows cannot be saved, the batch's files are removed", async () => {
      const dir = path.join(config.imagesDir, String(propertyB));
      const before = filesIn(dir);
      await assert.rejects(
        storeImages("", propertyB, [image("a.png"), image("b.png")], async (files) => {
          for (const file of files) assert.ok(fs.existsSync(resolveImageAbsolutePath(file.filePath)!));
          throw new Error("insert failed");
        }),
        /insert failed/,
      );
      assert.deepEqual(filesIn(dir), before);
    });

    await t.test("simultaneous uploads to an empty listing make exactly one primary image", async () => {
      const id = await newProperty("FI-C");
      const url = `/api/properties/${id}/images`;
      await Promise.all([upload(url, ["c1.png"]), upload(url, ["c2.png"]), upload(url, ["c3.png"])]);
      const rows = await images(url);
      assert.equal(rows.length, 3);
      assert.equal(rows.filter((row) => row.is_primary).length, 1);
      assert.equal(new Set(rows.map((row) => row.file_path)).size, 3);
    });

    await t.test("deleting a listing removes its image files, thumbnails and folder", async () => {
      const property = await newProperty("FI-D");
      const [p] = await upload(`/api/properties/${property}/images`, ["d.png"]);
      assert.equal((await send("DELETE", `/api/properties/${property}`)).statusCode, 200);
      assert.equal(fs.existsSync(resolveImageAbsolutePath(p.file_path)!), false);
      assert.equal(fs.existsSync(resolveThumbnailPath(p.file_path)!), false);
      assert.equal(fs.existsSync(path.join(config.imagesDir, String(property))), false);

      const rental = await newRental("FI-R");
      const [r] = await upload(`/api/rentals/${rental}/images`, ["r.png"]);
      assert.equal((await send("DELETE", `/api/rentals/${rental}`)).statusCode, 200);
      assert.equal(fs.existsSync(resolveImageAbsolutePath(r.file_path)!), false);
      assert.equal(fs.existsSync(path.join(config.imagesDir, "rentals", String(rental))), false);
    });

    await t.test("rental images: another rental's image is out of reach, and a deletion is audited", async () => {
      const rentalA = ctx.rental.id;
      const rentalB = await newRental("FI-RB");
      const [ra] = await upload(`/api/rentals/${rentalA}/images`, ["ra.png"]);
      const [rb] = await upload(`/api/rentals/${rentalB}/images`, ["rb.png"]);
      assert.equal((await send("DELETE", `/api/rentals/${rentalA}/images/${rb.id}`)).statusCode, 404);
      assert.equal((await send("PATCH", `/api/rentals/${rentalA}/images/${rb.id}/primary`)).statusCode, 404);
      assert.equal((await send("DELETE", `/api/rentals/${rentalA}/images/${ra.id}`)).statusCode, 200);
      const audit = await pool.query(
        "SELECT count(*)::int AS n FROM audit_logs WHERE entity_type = 'rental' AND entity_id = $1 AND action = 'image_removed'",
        [rentalA],
      );
      assert.equal(audit.rows[0].n, 1);
    });

    await t.test("a follow-up is changed and deleted only through its own listing", async () => {
      const otherProperty = await newProperty("FI-F");
      const created = await send("POST", `/api/properties/${propertyA}/followups`, { type: "phone_call", notes: "أ" });
      assert.equal(created.statusCode, 201, created.body);
      const followup = created.json() as { id: number };
      const wrong = `/api/properties/${otherProperty}/followups/${followup.id}`;
      assert.equal((await send("PUT", wrong, { type: "meeting", notes: "ب" })).statusCode, 404);
      assert.equal((await send("DELETE", wrong)).statusCode, 404);
      const [kept] = (await send("GET", `/api/properties/${propertyA}/followups`)).json() as Array<{ id: number; type: string }>;
      assert.deepEqual([kept.id, kept.type], [followup.id, "phone_call"]);
      assert.equal((await send("POST", "/api/properties/987654/followups", { type: "other" })).statusCode, 404);

      const otherRental = await newRental("FI-RF");
      const rentalFollowup = (await send("POST", `/api/rentals/${ctx.rental.id}/followups`, { type: "visit" })).json() as { id: number };
      const wrongRental = `/api/rentals/${otherRental}/followups/${rentalFollowup.id}`;
      assert.equal((await send("PUT", wrongRental, { type: "other" })).statusCode, 404);
      assert.equal((await send("DELETE", wrongRental)).statusCode, 404);
      assert.equal((await send("POST", "/api/rentals/987654/followups", { type: "other" })).statusCode, 404);
    });

    await t.test("a document whose row cannot be saved leaves no file", async () => {
      const personDir = path.join(config.documentsDir, `people-${ctx.people[1].id}`);
      const before = filesIn(personDir);
      const file = { document_name: "هوية", data: `data:image/png;base64,${PNG}`, file_type: "image/png" };
      assert.equal((await send("POST", "/api/documents/people/987654", file)).statusCode, 404);
      const badLink = await send("POST", `/api/documents/people/${ctx.people[1].id}`, { ...file, agreement_id: 987654 });
      assert.equal(badLink.statusCode, 409, badLink.body);
      assert.deepEqual(filesIn(personDir), before);
      assert.equal((await send("POST", `/api/documents/people/${ctx.people[1].id}`, file)).statusCode, 201);
      assert.equal(filesIn(personDir).length, before.length + 1);
    });

    await t.test("replacing the logo removes the previous file", async () => {
      const logo = { data: `data:image/png;base64,${PNG}`, file_type: "image/png", original_name: "logo.png" };
      const first = (await send("POST", "/api/office/logo", logo)).json() as { logo_file_path: string };
      const second = (await send("POST", "/api/office/logo", logo)).json() as { logo_file_path: string };
      assert.notEqual(first.logo_file_path, second.logo_file_path);
      assert.equal(fs.existsSync(resolveManagedFile(first.logo_file_path)), false);
      assert.equal(fs.existsSync(resolveManagedFile(second.logo_file_path)), true);
    });
  } finally {
    await ctx.close();
    fs.rmSync(ctx.root, { recursive: true, force: true });
  }
});
