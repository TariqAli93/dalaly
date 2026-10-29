import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";
import { removalTestContext } from "./removal-test-context.js";

// Needs PostgreSQL (DB_* from .env); creates and drops its own dalaly_removal_test_* database.
test("authentication runs before body parsing and only upload routes take large bodies", async (t) => {
  const ctx = await removalTestContext("limits");
  try {
    const twoMegabytes = "x".repeat(2 * 1024 * 1024);
    const post = (url: string, payload: unknown, token?: string) =>
      ctx.app.inject({
        method: "POST",
        url,
        payload: JSON.stringify(payload),
        headers: {
          "content-type": "application/json",
          ...(token ? { authorization: `Bearer ${token}` } : {}),
        },
      });

    await t.test("an anonymous body is rejected as unauthenticated before it is parsed", async () => {
      // Malformed JSON would be a 400 if the body were parsed first.
      const result = await ctx.app.inject({
        method: "POST",
        url: "/api/people",
        payload: `{${twoMegabytes}`,
        headers: { "content-type": "application/json" },
      });
      assert.equal(result.statusCode, 401);
    });

    await t.test("ordinary routes refuse bodies over 1 MB with an Arabic 413", async () => {
      const result = await post("/api/people", { full_name: twoMegabytes }, ctx.token);
      assert.equal(result.statusCode, 413);
      assert.match(result.json().message, /أكبر من المسموح/);
    });

    await t.test("image uploads still accept multi-megabyte files", async () => {
      // A PNG signature, then 2 MB: uploads check a file's leading bytes.
      const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
      const image = `data:image/png;base64,${Buffer.concat([signature, Buffer.alloc(2 * 1024 * 1024, 7)]).toString("base64")}`;
      const result = await post(`/api/properties/${ctx.property.id}/images`, { images: [{ data: image }] }, ctx.token);
      assert.equal(result.statusCode, 201, result.body.slice(0, 200));
    });

    await t.test("the session token is not accepted from a query string", async () => {
      const list = await ctx.app.inject({ url: `/api/properties/${ctx.property.id}/images?token=${encodeURIComponent(ctx.token)}` });
      assert.equal(list.statusCode, 401);
    });
  } finally {
    await ctx.close();
    await fs.rm(ctx.root, { recursive: true, force: true });
  }
});
