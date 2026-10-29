import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { removalTestContext } from "./removal-test-context.js";

// Needs PostgreSQL (DB_* from .env); creates and drops its own dalaly_removal_test_* database.
// The session token travels only in the Authorization header. <img> URLs carry
// a media token derived from the session: GET on image and logo files only,
// revoked with its session (Phase 1b).

const PNG =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
const JPEG =
  "/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=";

test("media tokens open image files only, and session tokens never travel in URLs", async (t) => {
  const ctx = await removalTestContext("mediatokens");
  try {
    const inject = (
      method: "GET" | "POST" | "PUT" | "DELETE",
      url: string,
      options: { token?: string; body?: unknown } = {},
    ) =>
      ctx.app.inject({
        method,
        url,
        ...(options.body === undefined ? {} : { payload: JSON.stringify(options.body) }),
        headers: {
          ...(options.token ? { authorization: `Bearer ${options.token}` } : {}),
          ...(options.body === undefined ? {} : { "content-type": "application/json" }),
        },
      });
    const signIn = async (pin = "1234") =>
      inject("POST", "/api/auth/login", { body: { username: "removal_admin", pin } });

    const session = (await signIn()).json() as { token: string; media_token: string };
    assert.match(session.media_token, /^\d+\.[A-Za-z0-9_-]{43}$/);
    assert.ok(!session.media_token.includes(session.token), "the media token does not contain the session token");

    const images = `/api/properties/${ctx.property.id}/images`;
    const [image] = (
      await inject("POST", images, {
        token: session.token,
        body: { images: [{ data: `data:image/png;base64,${PNG}`, thumbnail: `data:image/jpeg;base64,${JPEG}` }] },
      })
    ).json() as Array<{ id: number }>;
    await inject("POST", "/api/office/logo", {
      token: session.token,
      body: { data: `data:image/png;base64,${PNG}`, file_type: "image/png" },
    });
    const file = `${images}/${image.id}/file`;
    const media = (url: string, value = session.media_token) => `${url}?media=${encodeURIComponent(value)}`;

    await t.test("/auth/me returns the session's media token", async () => {
      const me = (await inject("GET", "/api/auth/me", { token: session.token })).json() as { media_token: string };
      assert.equal(me.media_token, session.media_token);
    });

    await t.test("a media token opens image files, thumbnails and the logo", async () => {
      for (const url of [file, `${images}/${image.id}/thumbnail`, "/api/office/logo"]) {
        const result = await inject("GET", media(url));
        assert.equal(result.statusCode, 200, `${url}: ${result.body.slice(0, 120)}`);
      }
      const rental = `/api/rentals/${ctx.rental.id}/images/1/file`;
      assert.equal((await inject("GET", media(rental))).statusCode, 404, "rental files accept it too (no such image)");
    });

    await t.test("a media token opens nothing else", async () => {
      for (const url of ["/api/properties", images, "/api/auth/me", "/api/users", `/api/documents/1/file`, "/api/backup/download/1"])
        assert.equal((await inject("GET", media(url))).statusCode, 401, url);
      const put = await inject("PUT", media(`${images}/${image.id}/thumbnail`), { body: { data: `data:image/jpeg;base64,${JPEG}` } });
      assert.equal(put.statusCode, 401, "not for writes on a media path");
      assert.equal((await inject("GET", "/api/properties", { token: session.media_token })).statusCode, 401, "not as a bearer token");
    });

    await t.test("the session token is refused in a query string, on every route", async () => {
      for (const url of [file, "/api/properties", "/api/office/logo"]) {
        const result = await inject("GET", `${url}?token=${encodeURIComponent(session.token)}`);
        assert.equal(result.statusCode, 401, url);
      }
      assert.equal((await inject("GET", `${file}?media=${encodeURIComponent(session.token)}`)).statusCode, 401);
    });

    await t.test("a forged or altered media token is refused", async () => {
      const [, signature] = session.media_token.split(".");
      assert.equal((await inject("GET", media(file, `${Number(session.media_token.split(".")[0]) + 1}.${signature}`))).statusCode, 401);
      assert.equal((await inject("GET", media(file, `${session.media_token.slice(0, -1)}A`))).statusCode, 401);
      assert.equal((await inject("GET", media(file, "1.short"))).statusCode, 401);
    });

    await t.test("logging out revokes the media token", async () => {
      const other = (await signIn()).json() as { token: string; media_token: string };
      assert.equal((await inject("GET", media(file, other.media_token))).statusCode, 200);
      await inject("POST", "/api/auth/logout", { token: other.token });
      assert.equal((await inject("GET", media(file, other.media_token))).statusCode, 401);
      assert.equal((await inject("GET", media(file))).statusCode, 200, "other sessions are unaffected");
    });

    await t.test("a burst of parallel wrong PINs is held to the attempt limit", async () => {
      const results = await Promise.all(Array.from({ length: 10 }, () => signIn("0000")));
      const codes = results.map((result) => result.statusCode);
      assert.equal(codes.filter((code) => code === 401).length, 5, codes.join(","));
      assert.equal(codes.filter((code) => code === 429).length, 5, codes.join(","));
      assert.equal((await signIn()).statusCode, 429, "the right PIN waits for the lockout too");
    });
  } finally {
    await ctx.close();
    fs.rmSync(ctx.root, { recursive: true, force: true });
  }
});
