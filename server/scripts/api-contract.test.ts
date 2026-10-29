import assert from "node:assert/strict";
import test from "node:test";
import { pool } from "../src/infrastructure/database/pool.js";
import { mismatches, rendererEndpoints, rendererTypeShape, type RendererEndpoint } from "./renderer-contract.js";
import { removalTestContext } from "./removal-test-context.js";

// Needs PostgreSQL (DB_* from .env); creates and drops its own dalaly_removal_test_* database.
// Every response the renderer reads must have the keys and value types its
// hand-written types in apps/renderer/src/types declare. The expected shape
// of each route comes from the services' own request<T>(path) calls, so a
// field added, renamed or retyped on either side fails here.

const PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

/**
 * Known differences, each an API bug to fix rather than a renderer type to
 * widen. An entry that stops matching fails the test, so the list only
 * shrinks.
 */
const KNOWN_DRIFT: Array<{ route: RegExp; problem: RegExp; reason: string }> = [];

/** The renderer endpoint a concrete URL is a call of; literal segments win over parameters. */
function endpointFor(method: string, url: string, endpoints: RendererEndpoint[]) {
  const pathname = url.split("?")[0].replace(/^\/api/, "");
  const candidates = endpoints.filter(
    (endpoint) =>
      endpoint.method === method &&
      new RegExp(`^${endpoint.path.replace(/:\w+/g, "[^/]+")}$`).test(pathname),
  );
  candidates.sort((a, b) => (a.path.match(/:/g)?.length ?? 0) - (b.path.match(/:/g)?.length ?? 0));
  // One route can be called from several services; each declares its own T.
  return candidates.filter((candidate) => candidate.path === candidates[0]?.path);
}

test("API responses match the renderer's types", async (t) => {
  const ctx = await removalTestContext("contract");
  const endpoints = rendererEndpoints();
  /** Mismatches per renderer route, reported after every call is made. */
  const checked = new Map<string, { endpoint: RendererEndpoint; problems: Set<string> }>();
  const errorShape = rendererTypeShape("ApiErrorBody");

  const send = (method: string, url: string, body?: unknown, token: string | null = ctx.token) =>
    ctx.app.inject({
      method: method as "GET",
      url,
      ...(body === undefined ? {} : { payload: JSON.stringify(body) }),
      headers: {
        ...(token ? { authorization: `Bearer ${token}` } : {}),
        ...(body === undefined ? {} : { "content-type": "application/json" }),
      },
    });

  /** Calls the API like the renderer and checks a successful body against the type the renderer declares. */
  const api = async (method: string, url: string, body?: unknown) => {
    const result = await send(method, url, body);
    assert.ok(result.statusCode >= 200 && result.statusCode < 300, `${method} ${url} → ${result.statusCode} ${result.body}`);
    const json = result.json();
    const matches = endpointFor(method, url, endpoints);
    for (const endpoint of matches) {
      const key = `${endpoint.route} as ${endpoint.typeText.replace(/\s+/g, " ")} (${endpoint.source})`;
      const entry = checked.get(key) ?? { endpoint, problems: new Set<string>() };
      for (const problem of mismatches(json, endpoint.shape)) entry.problems.add(problem.replace(/\[\d+\]/g, "[]"));
      checked.set(key, entry);
    }
    return json;
  };

  const expectError = async (
    result: Awaited<ReturnType<typeof send>>,
    status: number,
    code: string,
  ) => {
    assert.equal(result.statusCode, status, result.body);
    const body = result.json();
    assert.deepEqual(mismatches(body, errorShape), [], `error body vs ApiErrorBody: ${result.body}`);
    assert.equal(body.code, code);
    assert.match(body.message, /[؀-ۿ]/, "the message is Arabic");
    return body;
  };

  try {
    const person = ctx.people[0];
    // The shared fixture's rental has a sale type ("بيت") that the rentals API refuses.
    await pool.query("UPDATE rentals SET property_type = 'house' WHERE id = $1", [ctx.rental.id]);
    let propertyId = 0;
    let rentalId = 0;
    let rentalRequestId = 0;
    let purchaseRequestId = 0;
    let agreementId = 0;
    let activityId = 0;
    let dealId = 0;

    {
      // Records created the way the renderer creates them.
      const governorate = await api("POST", "/api/locations/governorates", { name: "بغداد", is_active: true });
      const district = await api("POST", "/api/locations/districts", { governorate_id: governorate.id, name: "الكرادة", is_active: true });
      const neighborhood = await api("POST", "/api/locations/neighborhoods", { district_id: district.id, name: "حي 1", is_active: true });
      const location = { governorate_id: governorate.id, district_id: district.id, neighborhood_id: neighborhood.id };

      const property = await api("POST", "/api/properties", {
        name: "بيت العقد",
        property_type: "بيت",
        legal_type: "طابو ملك صرف",
        area_value: 200,
        area_unit: "متر",
        pricing_method: "سعر على المتر",
        unit_price: 1000,
        owner_person_id: person.id,
        owner_name: person.full_name,
        owner_phone: person.phone_primary,
        status: "available",
        is_negotiable: true,
        rooms_count: 3,
        amenities: { garden: true },
        latitude: 33.3,
        longitude: 44.4,
        ...location,
      });
      propertyId = property.id;
      await api("PUT", `/api/properties/${propertyId}`, { ...property, notes: "تحديث للسجل" });

      const rental = await api("POST", "/api/rentals", {
        name: "شقة العقد",
        property_type: "apartment",
        rent_price: 750000,
        rent_period: "monthly",
        area_value: 120,
        area_unit: "متر",
        owner_person_id: person.id,
        owner_name: person.full_name,
        owner_phone: person.phone_primary,
        status: "available",
        is_negotiable: false,
        amenities: { elevator: true },
        ...location,
      });
      rentalId = rental.id;

      const image = { data: `data:image/png;base64,${PNG}`, original_name: "a.png" };
      await api("POST", `/api/properties/${propertyId}/images`, { images: [image] });
      await api("POST", `/api/rentals/${rentalId}/images`, { images: [image] });
      await api("POST", `/api/properties/${propertyId}/followups`, {
        type: "phone_call",
        notes: "اتصال",
        scheduled_at: new Date(Date.now() + 86_400_000).toISOString(),
        person_id: person.id,
        assigned_user_id: ctx.adminId,
        priority: "high",
      });
      await api("POST", `/api/rentals/${rentalId}/followups`, { type: "visit", notes: "زيارة", outcome: "أعجبه" });
      await api("POST", `/api/favorites/${propertyId}`);
      await api("POST", `/api/rental-favorites/${rentalId}`);

      rentalRequestId = (await api("POST", "/api/rental-requests", {
        person_id: person.id,
        property_type: "apartment",
        rent_period: "monthly",
        budget_max: 1_000_000,
        area_min: 80,
        rooms_count: 2,
        ...location,
      })).id;
      purchaseRequestId = (await api("POST", "/api/purchase-requests", {
        person_id: person.id,
        property_type: "بيت",
        budget_max: 300_000_000,
        area_min: 100,
        ...location,
      })).id;

      const activity = await api("POST", "/api/activities", {
        person_id: person.id,
        purchase_request_id: purchaseRequestId,
        type: "meeting",
        notes: "اجتماع في المكتب",
        scheduled_at: new Date(Date.now() + 2 * 86_400_000).toISOString(),
        assigned_user_id: ctx.adminId,
      });
      activityId = activity.id;
      const deal = await api("POST", "/api/deals", {
        deal_type: "sale",
        property_id: propertyId,
        client_person_id: ctx.people[1].id,
        purchase_request_id: null,
        assigned_user_id: ctx.adminId,
        expected_close_date: "2026-12-31",
      });
      dealId = deal.id;
      const offer = await api("POST", `/api/deals/${deal.id}/offers`, { party: "client", amount: "140000000" });
      await api("PATCH", `/api/deals/${deal.id}/offers/${offer.id}`, { status: "accepted" });
      await api("POST", `/api/deals/${deal.id}/stage`, { stage: "contract_preparation" });
      await api("PATCH", `/api/tasks/activity/${activity.id}`, { priority: "urgent" });
      const chart = await api("GET", "/api/accounting/accounts");
      const expenses = chart.find((row: { system_key: string | null }) => row.system_key === "expenses");
      const officeAccount = await api("POST", "/api/accounting/accounts", {
        code: "5301",
        name: "إيجار المكتب",
        account_type: "expense",
        parent_id: expenses.id,
        currency: "IQD",
        is_postable: true,
      });
      await api("PUT", `/api/accounting/accounts/${officeAccount.id}`, { ...officeAccount, description: "إيجار شهري" });
      // An audited change to the customer, for /people/:id/audit.
      const current = await api("GET", `/api/people/${person.id}`);
      await api("PUT", `/api/people/${person.id}`, { ...current, notes: "زبون الفحص" });

      const [documentType] = await api("GET", "/api/documents/types");
      await api("POST", `/api/documents/people/${person.id}`, {
        person_id: person.id,
        document_type_id: documentType.id,
        document_name: "هوية",
        document_number: "123",
        document_side: "front",
        data: `data:image/png;base64,${PNG}`,
        file_type: "image/png",
        original_name: "id.png",
        expires_at: new Date(Date.now() - 86_400_000).toISOString(),
      });

      await api("PUT", "/api/office", { company_name: "مكتب العقد", phone_primary: "07700000009" });
      // A lease drafted and issued the way the renderer does it, so it has a
      // revision, an export and a Word file, and a template with history.
      const lease = await api("POST", "/api/agreements", { template_key: "residential_rent" });
      agreementId = lease.id;
      const savedLease = await api("PUT", `/api/agreements/${lease.id}`, {
        base_rev: lease.draft_rev,
        parties: [
          { role: "landlord", person_id: ctx.people[0].id },
          { role: "tenant", person_id: ctx.people[1].id },
        ],
        rental_id: rentalId,
        terms: { ...lease.terms, contract_place: "بغداد", rent_amount: 750000, start_date: "2026-11-01", end_date: "2027-10-31" },
      });
      await api("POST", `/api/agreements/${lease.id}/issue`, { base_rev: savedLease.draft_rev });
      await api("POST", `/api/agreements/${lease.id}/exports`, { format: "pdf", revision: 1, file_name: "عقد.pdf" });
      const saleTemplate = await api("GET", "/api/agreements/templates/sale");
      await api("PUT", "/api/agreements/templates/sale", { base_version: saleTemplate.version, definition: saleTemplate.definition });
      const [permission] = await api("GET", "/api/permissions");
      const role = await api("POST", "/api/roles", { name: "دور العقد", description: "للاختبار", permission_ids: [permission.id] });
      await api("POST", "/api/users", { username: "contract_user", display_name: "مستخدم العقد", pin: "1234", is_active: true, role_ids: [role.id] });
      await api("POST", "/api/backup/create");
    }

    {
      // Every list and detail the renderer reads.
      const id = { property: propertyId, rental: rentalId, person: ctx.people[0].id };
      const urls = [
        "/api/auth/me",
        "/api/setup/status",
        "/api/backup/history",
        "/api/office",
        "/api/dashboard/summary",
        "/api/dashboard/overview?stale_days=30",
        "/api/dashboard/matching?kind=all&page=1&page_size=8",
        "/api/documents/types",
        "/api/documents",
        "/api/documents/paged?page=1&page_size=10",
        `/api/documents/people/${id.person}/requirements?scope=sale`,
        "/api/favorites",
        "/api/favorites/ids",
        `/api/properties/${id.property}/followups`,
        `/api/properties/${id.property}/images`,
        "/api/locations",
        "/api/people",
        "/api/people/paged?page=1&page_size=10",
        `/api/people/${id.person}`,
        `/api/people/duplicates?phone=${encodeURIComponent(ctx.people[0].phone_primary)}`,
        `/api/people/${id.person}/audit`,
        "/api/permissions",
        "/api/properties",
        "/api/properties/paged?page=1&page_size=10",
        `/api/properties/paged?owner_person_id=${id.person}&include_archived=true`,
        `/api/properties/${id.property}`,
        `/api/properties/${id.property}/audit`,
        "/api/remote-access/status",
        `/api/rentals/${id.rental}/followups`,
        "/api/rentals",
        "/api/rentals/paged?page=1&page_size=10",
        `/api/rentals/${id.rental}`,
        `/api/rentals/${id.rental}/audit`,
        `/api/rentals/${id.rental}/images`,
        "/api/rental-favorites",
        "/api/rental-favorites/ids",
        "/api/rental-requests",
        "/api/rental-requests/paged?page=1&page_size=10",
        `/api/rental-requests/${rentalRequestId}`,
        "/api/purchase-requests",
        "/api/purchase-requests/paged?page=1&page_size=10",
        `/api/purchase-requests/${purchaseRequestId}`,
        `/api/matching/rental-requests/${rentalRequestId}/offers`,
        `/api/matching/rentals/${id.rental}/requests`,
        `/api/matching/purchase-requests/${purchaseRequestId}/offers`,
        `/api/matching/properties/${id.property}/purchase-requests`,
        "/api/roles",
        "/api/users",
        "/api/agreements/templates",
        "/api/agreements/templates/sale",
        "/api/agreements/templates/sale/versions",
        "/api/agreements/templates/sale/versions/1",
        "/api/agreements/paged?page=1&page_size=10",
        `/api/agreements/${agreementId}`,
        `/api/agreements/${agreementId}/revisions/1`,
        `/api/agreements/${agreementId}/docx?revision=1`,
        "/api/tasks/paged?page=1&page_size=10&sort_by=scheduled_at&sort_order=asc&status=all",
        "/api/tasks/assignees",
        `/api/activities?person_id=${id.person}`,
        `/api/activities/${activityId}`,
        `/api/people/${id.person}/timeline`,
        "/api/deals/paged?page=1&page_size=10&sort_by=updated_at&sort_order=desc",
        "/api/deals/pipeline",
        `/api/deals/${dealId}`,
        "/api/accounting/accounts",
      ];
      for (const url of urls) await api("GET", url);
    }

    const driftSeen = new Set<(typeof KNOWN_DRIFT)[number]>();
    for (const [key, { problems }] of [...checked].sort(([a], [b]) => a.localeCompare(b)))
      await t.test(key, () => {
        const unexpected = [...problems].filter((problem) => {
          const known = KNOWN_DRIFT.find((drift) => drift.route.test(key) && drift.problem.test(problem));
          if (known) driftSeen.add(known);
          return !known;
        });
        assert.deepEqual(unexpected, []);
      });
    await t.test("every known drift still exists (remove the fixed ones)", () =>
      assert.deepEqual(KNOWN_DRIFT.filter((drift) => !driftSeen.has(drift)).map((drift) => drift.reason), []),
    );

    await t.test("no renderer GET is left without a contract check", () => {
      const unchecked = endpoints
        .filter((endpoint) => endpoint.method === "GET" && ![...checked.values()].some((entry) => entry.endpoint === endpoint))
        .map((endpoint) => `${endpoint.route} (${endpoint.source})`);
      assert.deepEqual(unchecked, [], "call these in the contract test");
    });

    await t.test("errors have the ApiErrorBody shape", async () => {
      await expectError(await send("GET", "/api/properties", undefined, null), 401, "UNAUTHORIZED");
      await expectError(await send("GET", "/api/properties/99999999"), 404, "NOT_FOUND");
      await expectError(await send("GET", "/api/no-such-route"), 404, "NOT_FOUND");
      const invalid = await expectError(await send("POST", "/api/properties", {}), 400, "VALIDATION_ERROR");
      assert.ok(invalid.issues.length > 0);
      await expectError(await send("POST", "/api/users", { username: "contract_user", display_name: "مكرر", pin: "1234", is_active: true, role_ids: [] }), 409, "DUPLICATE_VALUE");
      // A business rule thrown as a DomainError deep in a repository.
      const self = await expectError(await send("DELETE", `/api/users/${ctx.adminId}`), 400, "BAD_REQUEST");
      assert.equal(self.message, "لا يمكن للمستخدم حذف نفسه.");
      const restore = await expectError(await send("POST", "/api/backup/restore", { data: Buffer.from("not a zip").toString("base64") }), 400, "BAD_REQUEST");
      assert.match(restore.message, /النسخة الاحتياطية/);

      // A user whose role has no permissions.
      const role = await api("POST", "/api/roles", { name: "بلا صلاحيات", permission_ids: [] });
      await api("POST", "/api/users", { username: "no_rights", display_name: "بلا صلاحيات", pin: "1234", is_active: true, role_ids: [role.id] });
      const { login } = await import("../src/modules/auth/auth.service.js");
      const token = (await login("no_rights", "1234"))!.token;
      await expectError(await send("GET", "/api/users", undefined, token), 403, "FORBIDDEN");
    });
  } finally {
    await ctx.close();
  }
});
