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
    let journalId = 0;
    let voucherId = 0;
    let voucherPersonId = 0;
    let commissionId = 0;
    let transferId = 0;
    let leaseId = 0;
    let cashAccountId = 0;

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
      // The journal: a draft, posted on its update, reversed; a deleted draft;
      // a month closed and reopened.
      cashAccountId = chart.find((row: { system_key: string | null }) => row.system_key === "cash.IQD").id;
      const entryLines = [
        { account_id: officeAccount.id, debit: "750000", credit: null, person_id: person.id, deal_id: deal.id, memo: "إيجار" },
        { account_id: cashAccountId, debit: null, credit: "750000", person_id: null, deal_id: null, memo: null },
      ];
      const entry = await api("POST", "/api/accounting/journal", { entry_date: "2026-10-01", currency: "IQD", description: "إيجار المكتب", lines: entryLines, post: false });
      const posted = await api("PUT", `/api/accounting/journal/${entry.id}`, { entry_date: "2026-10-01", currency: "IQD", description: "إيجار المكتب", lines: entryLines, post: true });
      journalId = posted.id;
      await api("POST", `/api/accounting/journal/${posted.id}/reverse`, { entry_date: "2026-10-02", reason: "فحص" });
      const draft = await api("POST", "/api/accounting/journal", { entry_date: "2026-10-03", currency: "IQD", description: "مسودة", lines: entryLines, post: false });
      await api("POST", `/api/accounting/journal/${draft.id}/post`);
      const extra = await api("POST", "/api/accounting/journal", { entry_date: "2026-10-04", currency: "IQD", description: "تُحذف", lines: entryLines, post: false });
      await api("DELETE", `/api/accounting/journal/${extra.id}`);
      await api("POST", "/api/accounting/periods", { period: "2026-07", notes: null });
      await api("DELETE", "/api/accounting/periods/2026-07");
      await api("POST", "/api/accounting/periods", { period: "2026-06", notes: "فحص" });
      // Vouchers: a client-funds receipt, part of it paid out, a voided one.
      const held = await api("POST", "/api/vouchers", {
        kind: "receipt", voucher_date: "2026-10-05", currency: "IQD", amount: "1000000", purpose: "client_funds",
        money_account_id: cashAccountId, other_account_id: null, person_id: person.id, party_name: null, deal_id: deal.id,
        description: "عربون", reference: "صك 12",
      });
      voucherId = held.id;
      voucherPersonId = person.id;
      await api("POST", "/api/vouchers", {
        kind: "payment", voucher_date: "2026-10-06", currency: "IQD", amount: "200000", purpose: "client_funds",
        money_account_id: cashAccountId, other_account_id: null, person_id: person.id, party_name: null, deal_id: null,
        description: "تسليم جزء من العربون", reference: null,
      });
      const mistaken = await api("POST", "/api/vouchers", {
        kind: "receipt", voucher_date: "2026-10-07", currency: "IQD", amount: "5000", purpose: "other_income",
        money_account_id: cashAccountId, other_account_id: null, person_id: null, party_name: "مراجع", deal_id: null,
        description: "خطأ", reference: null,
      });
      await api("POST", `/api/vouchers/${mistaken.id}/void`, { void_date: "2026-10-08", reason: "فحص" });
      // Commissions: a fixed one with a share, collected in part and the share
      // paid in part; another recorded and cancelled.
      const [staffMember] = await api("GET", "/api/commissions/staff");
      const commission = await api("POST", "/api/commissions", {
        deal_id: deal.id, payer_role: "client", basis: "fixed", rate: null, amount: "300000", currency: "IQD",
        commission_date: "2026-10-09", description: "عمولة الفحص",
        splits: [{ user_id: staffMember.id, basis: "percent", rate: "20", amount: null }],
      });
      commissionId = commission.id;
      await api("POST", "/api/vouchers", {
        kind: "receipt", voucher_date: "2026-10-10", currency: "IQD", amount: "100000", purpose: "commission",
        money_account_id: cashAccountId, other_account_id: null, person_id: null, party_name: null, deal_id: null,
        description: "تحصيل جزء من العمولة", reference: null, commission_id: commission.id, commission_split_id: null,
      });
      await api("POST", "/api/vouchers", {
        kind: "payment", voucher_date: "2026-10-11", currency: "IQD", amount: "20000", purpose: "commission",
        money_account_id: cashAccountId, other_account_id: null, person_id: null, party_name: null, deal_id: null,
        description: "دفع جزء من الحصة", reference: null, commission_id: null, commission_split_id: commission.splits[0].id,
      });
      const ownerCommission = await api("POST", "/api/commissions", {
        deal_id: deal.id, payer_role: "owner", basis: "fixed", rate: null, amount: "1", currency: "USD",
        commission_date: "2026-10-09", description: null, splits: [],
      });
      await api("POST", `/api/commissions/${ownerCommission.id}/cancel`, { cancel_date: "2026-10-12", reason: "فحص" });
      // Cash: an expense category on a payment, a transfer and its void, a
      // reconciliation, a category added and edited.
      const categories = await api("GET", "/api/expense-categories");
      await api("POST", "/api/vouchers", {
        kind: "payment", voucher_date: "2026-10-13", currency: "IQD", amount: "1000", purpose: "expense",
        money_account_id: cashAccountId, other_account_id: null, person_id: null, party_name: "مولدة", deal_id: null,
        description: "اشتراك المولدة", reference: null, expense_category_id: categories[0].id,
      });
      const bankIqd = chart.find((row: { system_key: string | null }) => row.system_key === "bank.IQD").id;
      const transfer = await api("POST", "/api/cash/transfers", {
        transfer_date: "2026-10-14", currency: "IQD", from_account_id: cashAccountId, to_account_id: bankIqd,
        amount: "5000", description: "إيداع", reference: null,
      });
      transferId = transfer.id;
      const second = await api("POST", "/api/cash/transfers", {
        transfer_date: "2026-10-14", currency: "IQD", from_account_id: cashAccountId, to_account_id: bankIqd,
        amount: "1000", description: "خطأ", reference: null,
      });
      await api("POST", `/api/cash/transfers/${second.id}/void`, { void_date: "2026-10-15", reason: "فحص" });
      await api("POST", "/api/cash/reconciliations", {
        account_id: bankIqd, statement_date: "2026-10-15", statement_balance: "5000.00", adjust: false, notes: null,
      });
      const added = await api("POST", "/api/expense-categories", {
        name: "تصنيف الفحص", iqd_account_id: categories[0].iqd_account_id, usd_account_id: null, is_active: true,
      });
      await api("PUT", `/api/expense-categories/${added.id}`, {
        name: "تصنيف الفحص", iqd_account_id: categories[0].iqd_account_id, usd_account_id: null, is_active: false,
      });
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
      // Leases: the issued contract put in force, one by hand (previewed
      // first) and cancelled.
      await api("GET", `/api/leases/agreement/${lease.id}`);
      leaseId = (await api("POST", "/api/leases/activate", { agreement_id: lease.id, office_collects: true, notes: null })).id;
      const handTerms = { currency: "IQD", rent_amount: "500000", frequency: "quarterly", start_date: "2026-01-01", end_date: "2026-12-31" };
      await api("POST", "/api/leases/schedule", handTerms);
      const byHand = await api("POST", "/api/leases", {
        ...handTerms, rental_id: null, landlord_person_id: ctx.people[0].id, tenant_person_id: ctx.people[1].id,
        deposit: null, office_collects: false, notes: "فحص",
      });
      await api("POST", `/api/leases/${byHand.id}/cancel`, { reason: "فحص" });
      // Lease payments: rent against an installment, a deposit, a payout; an
      // older lease with overdue rent, ended early; the contract's renewed.
      const [firstInstallment] = (await api("GET", `/api/leases/${leaseId}`)).installments;
      await api("POST", "/api/vouchers", {
        kind: "receipt", voucher_date: "2026-11-02", currency: "IQD", amount: "500000", purpose: "client_funds",
        money_account_id: cashAccountId, other_account_id: null, person_id: null, party_name: null, deal_id: null,
        description: "إيجار تشرين الثاني", reference: null, lease_installment_id: firstInstallment.id,
      });
      await api("POST", "/api/vouchers", {
        kind: "receipt", voucher_date: "2026-11-02", currency: "IQD", amount: "750000", purpose: "client_funds",
        money_account_id: cashAccountId, other_account_id: null, person_id: ctx.people[1].id, party_name: null, deal_id: null,
        held_for_person_id: ctx.people[1].id, description: "تأمين", reference: null, lease_id: leaseId,
      });
      await api("POST", "/api/vouchers", {
        kind: "payment", voucher_date: "2026-11-03", currency: "IQD", amount: "400000", purpose: "client_funds",
        money_account_id: cashAccountId, other_account_id: null, person_id: ctx.people[0].id, party_name: null, deal_id: null,
        description: "تسليم المؤجر", reference: null, lease_id: leaseId,
      });
      const older = await api("POST", "/api/leases", {
        currency: "IQD", rent_amount: "300000", frequency: "monthly", start_date: "2020-01-01", end_date: "2020-12-31",
        rental_id: null, landlord_person_id: ctx.people[0].id, tenant_person_id: ctx.people[1].id,
        deposit: null, office_collects: true, notes: null,
      });
      await api("POST", `/api/leases/${older.id}/terminate`, { termination_date: "2020-06-30", reason: "فحص" });
      await api("POST", `/api/leases/${leaseId}/renew`, { rent_amount: "800000", frequency: "monthly", end_date: "2028-10-31", notes: null });
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
        "/api/accounting/journal/paged?page=1&page_size=10&sort_by=entry_date&sort_order=desc",
        `/api/accounting/journal/${journalId}`,
        `/api/accounting/accounts/${cashAccountId}/statement?from=2026-10-01`,
        "/api/accounting/periods",
        "/api/vouchers/paged?page=1&page_size=10&sort_by=voucher_date&sort_order=desc",
        `/api/vouchers/${voucherId}`,
        "/api/vouchers/money-accounts",
        `/api/vouchers/client-funds?person_id=${voucherPersonId}`,
        "/api/commissions/paged?page=1&page_size=10&sort_by=commission_date&sort_order=desc",
        `/api/commissions/${commissionId}`,
        "/api/commissions/payable",
        "/api/commissions/staff",
        "/api/cash/balances",
        "/api/cash/transfers/paged?page=1&page_size=10&sort_by=transfer_date&sort_order=desc",
        `/api/cash/transfers/${transferId}`,
        "/api/cash/reconciliations",
        "/api/expense-categories",
        `/api/finance/deals/${dealId}`,
        `/api/finance/people/${voucherPersonId}`,
        "/api/leases/paged?page=1&page_size=10&sort_by=start_date&sort_order=desc",
        `/api/leases/${leaseId}`,
        `/api/leases/agreement/${agreementId}`,
        "/api/leases/installments/overdue?page=1&page_size=10",
        `/api/vouchers/paged?page=1&page_size=10&sort_by=voucher_date&sort_order=desc&lease_id=${leaseId}`,
        "/api/reports/financial/trial-balance?from=2020-01-01",
        "/api/reports/financial/income-statement?from=2020-01-01&group=month",
        "/api/reports/financial/balance-sheet",
        "/api/reports/financial/cash-flow?from=2020-01-01",
        "/api/reports/financial/commissions?from=2020-01-01",
        "/api/reports/financial/receivables",
        "/api/reports/financial/payables",
        `/api/reports/financial/ledger/${cashAccountId}?from=2026-10-01`,
        "/api/reports/operations/deals?from=2020-01-01",
        "/api/reports/operations/customers?from=2020-01-01",
        "/api/reports/operations/listings?kind=sale&from=2020-01-01",
        "/api/reports/operations/listings?kind=rental&from=2020-01-01",
        "/api/reports/operations/leases?from=2020-01-01",
        "/api/dashboard/business",
        "/api/dashboard/alerts",
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
