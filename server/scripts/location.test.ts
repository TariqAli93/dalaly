import assert from "node:assert/strict";
import { test } from "node:test";
import { buildMapLink, coordinateNumber, mapLinkUrl, parseMapLink, parseGoogleMapsUrl, validCoordinates } from "../src/shared/utils/map-location.js";
import { propertyPayloadSchema } from "../src/modules/properties/properties.schema.js";
import { rentalPayloadSchema } from "../src/modules/rentals/rentals.schema.js";
import { resolveMapLink } from "../src/modules/locations/map-link.service.js";
import { safeExternalUrl, safeMapLinkUrl } from "../../apps/desktop/src/external-links.js";

const property = { property_type: "أرض", legal_type: "طابو ملك صرف", area_value: 100, area_unit: "متر", pricing_method: "سعر إجمالي مباشر", total_price: 1000000, owner_name: "اختبار", owner_phone: "07700000000" };
const rental = { property_type: "house", area_value: 100, area_unit: "متر", rent_price: 250000, rent_period: "monthly", owner_name: "اختبار", owner_phone: "07700000000" };

test("Google URL coordinate formats, including pin precedence over viewport", () => {
  for (const url of [
    "https://www.google.com/maps?q=33.3152,44.3661",
    "https://www.google.com/maps/@33.3152,44.3661,15z",
    "https://www.google.com/maps/search/?api=1&query=33.3152%2C44.3661",
    "https://maps.google.com/?q=33.3152,44.3661",
    "https://www.google.com/maps/place/Baghdad/@32,43,15z/data=!3m1!4b1!4m2!3d33.3152!4d44.3661",
    "https://www.google.com/maps/place/33.3152,44.3661",
  ]) assert.deepEqual(parseGoogleMapsUrl(url), { lat: 33.3152, lng: 44.3661 });
});

test("OpenStreetMap links round-trip coordinates and prefer the saved pin", () => {
  for (const point of [{ lat: -90, lng: 180 }, { lat: 0, lng: 0 }, { lat: 33.3152, lng: 44.3661 }])
    assert.deepEqual(parseMapLink(buildMapLink(point)), point);
  assert.deepEqual(parseMapLink("https://www.openstreetmap.org/?mlat=33.3152&mlon=44.3661#map=12/32/43"), { lat: 33.3152, lng: 44.3661 });
  assert.deepEqual(parseMapLink("https://openstreetmap.org/#map=16/33.3152/44.3661"), { lat: 33.3152, lng: 44.3661 });
  for (const value of ["https://openstreetmap.org/?mlat=33", "https://openstreetmap.org/?mlat=91&mlon=44", "https://openstreetmap.org/#map=16/abc/44", "https://openstreetmap.org/user/test", "https://openstreetmap.org.evil.test/?mlat=33&mlon=44"])
    assert.equal(parseMapLink(value), null);
});

test("unresolved, malformed and untrusted links never fabricate a position", () => {
  for (const url of ["https://maps.app.goo.gl/abc", "https://www.google.com/maps/place/Baghdad", "https://www.google.com/maps?q=91,0", "https://www.google.com/maps/@abc,2,15z", "https://www.google.com/maps/%FF", "https://evil.test/maps?q=1,2"])
    assert.equal(parseGoogleMapsUrl(url), null);
});

test("coordinate conversion distinguishes absence, zero and invalid values", () => {
  for (const value of [null, undefined, "", "  "]) assert.equal(coordinateNumber(value), null);
  assert.deepEqual(validCoordinates("0", 0), { lat: 0, lng: 0 });
  for (const value of [false, true, [], {}, "abc", "0x10", Infinity, NaN]) assert.equal(validCoordinates(value, 0), null);
});

for (const [name, schema, base] of [["property", propertyPayloadSchema, property], ["rental", rentalPayloadSchema, rental]] as const) {
  test(`${name}: optional coordinates, blank fields, numeric output and explicit clearing`, () => {
    const absent = schema.parse(base);
    assert.equal(absent.latitude, undefined);
    assert.equal(absent.longitude, undefined);
    const blank = schema.parse({ ...base, latitude: "", longitude: "  ", location_link: "" });
    assert.equal(blank.latitude, null); assert.equal(blank.longitude, null); assert.equal(blank.location_link, null);
    const valid = schema.parse({ ...base, latitude: "33.3152", longitude: "44.3661" });
    assert.equal(valid.latitude, 33.3152); assert.equal(valid.longitude, 44.3661);
    assert.equal(schema.parse({ ...base, latitude: null, longitude: null }).latitude, null);
    assert.equal(schema.parse({ ...base, location_link: buildMapLink({ lat: 33, lng: 44 }) }).location_link, buildMapLink({ lat: 33, lng: 44 }));
    assert.equal(schema.parse({ ...base, location_link: "https://www.google.com/maps?q=33,44" }).location_link, "https://www.google.com/maps?q=33,44");
  });
  test(`${name}: range, pair and unsafe URL validation`, () => {
    for (const change of [
      { latitude: 91, longitude: 0 }, { latitude: 0, longitude: -181 },
      { latitude: "abc", longitude: 0 }, { latitude: false, longitude: 0 },
      { latitude: 33 }, { latitude: null, longitude: 44 }, { longitude: null },
      { location_link: "javascript:alert(1)" }, { location_link: "https://www.google.com.evil.test/maps?q=1,2" },
      { location_link: "https://openstreetmap.org.evil.test/" }, { location_link: "https://user:pass@openstreetmap.org/" },
    ]) assert.equal(schema.safeParse({ ...base, ...change }).success, false);
  });
}

test("short links: validate each redirect, prevent SSRF and cap redirect loops", async () => {
  let calls = 0;
  const redirect = (location: string) => async () => { calls++; return new Response(null, { status: 302, headers: { location } }); };
  assert.deepEqual(await resolveMapLink("https://maps.app.goo.gl/test", redirect("https://www.google.com/maps?q=33.3152,44.3661") as typeof fetch), { lat: 33.3152, lng: 44.3661 });
  calls = 0;
  assert.equal(await resolveMapLink("https://maps.app.goo.gl/test", redirect("http://127.0.0.1/private") as typeof fetch), null);
  assert.equal(calls, 1);
  calls = 0;
  assert.equal(await resolveMapLink("https://maps.app.goo.gl/test", redirect("https://maps.app.goo.gl/test") as typeof fetch), null);
  assert.equal(calls, 5);
  calls = 0;
  assert.equal(await resolveMapLink("https://evil.test/", redirect("https://www.google.com/maps?q=1,2") as typeof fetch), null);
  assert.equal(calls, 0);
  assert.deepEqual(await resolveMapLink(buildMapLink({ lat: 33, lng: 44 }), redirect("https://evil.test") as typeof fetch), { lat: 33, lng: 44 });
  assert.equal(calls, 0);
});

test("Electron link guards reject executable schemes and spoofed mapping hosts", () => {
  for (const url of ["javascript:alert(1)", "file:///C:/Windows/test.exe", "data:text/html,test", "https://user:pass@www.google.com/maps", "https://www.google.com.evil.test/maps", "https://www.google.com/url?q=evil", "https://127.0.0.1/maps", "https://www.openstreetmap.org.evil.test/", "https://user:pass@openstreetmap.org/", "https://openstreetmap.org:8443/", "http://openstreetmap.org/"])
    assert.equal(safeMapLinkUrl(url), null);
  assert.equal(safeExternalUrl("file:///test"), null);
  const url = "https://www.google.com/maps?q=33,44";
  for (const value of [url, buildMapLink({ lat: 33, lng: 44 }), "https://www.openstreetmap.org/search?query=Baghdad"])
    assert.equal(safeMapLinkUrl(value), mapLinkUrl(value)?.href);
});
