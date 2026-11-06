// Business demo data the seed does not create (deals, a draft contract, a
// commission and its receipt, a lease and a rent payment). Everything goes
// through the real HTTP API as the tutorial account — the same calls and
// order server/scripts/workflows.test.ts verifies — so permissions, numbering
// and accounting rules apply exactly as in the app. All names and numbers are
// fictional. Each block is best-effort and reported.

export function createApi(port, log) {
  const base = `http://127.0.0.1:${port}/api`;
  let token = "";
  const call = async (method, path, body) => {
    const response = await fetch(new URL(`${base}${path}`), {
      method,
      headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...(body === undefined ? {} : { "content-type": "application/json" }) },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(30_000),
    });
    const text = await response.text();
    const json = text ? JSON.parse(text) : null;
    if (!response.ok) throw new Error(`${method} ${path}: ${response.status} ${json?.message ?? text.slice(0, 200)}`);
    return json;
  };
  return {
    async login(account) {
      const result = await call("POST", "/auth/login", { username: account.username, pin: account.pin });
      token = result.token;
      log?.info("api.login", { message: `${account.username} (${result.permissions?.length ?? 0} permissions)` });
      return result;
    },
    get: (path) => call("GET", path),
    post: (path, body) => call("POST", path, body ?? {}),
    put: (path, body) => call("PUT", path, body),
    patch: (path, body) => call("PATCH", path, body),
  };
}

const items = (page) => (Array.isArray(page) ? page : page?.items ?? []);

function isoDay(offsetDays = 0) {
  const date = new Date(Date.now() + offsetDays * 86_400_000);
  return date.toISOString().slice(0, 10);
}

export async function createFixtures(api, log) {
  const report = [];
  const step = async (name, task) => {
    try {
      const detail = await task();
      report.push({ name, status: "created", detail });
      log.info("fixture.created", { message: `${name}${detail ? ` — ${detail}` : ""}` });
    } catch (error) {
      report.push({ name, status: "failed", error: error.message });
      log.warn("fixture.failed", { message: `${name}: ${error.message}` });
    }
  };
  const today = isoDay();
  let cash = null;
  await step("chart of accounts", async () => {
    const accounts = await api.get("/accounting/accounts");
    cash = items(accounts).find((account) => account.system_key === "cash.IQD")?.id ?? null;
    if (!cash) throw new Error("no cash.IQD account");
    return `cash account #${cash}`;
  });

  // A sale: a buyer's request, a deal that reaches an agreed price, a draft
  // contract prepared from it, the buyer's commission and part of it received.
  let saleDeal = null;
  await step("sale deal with agreed price and draft contract", async () => {
    const listings = items(await api.get("/properties?page=1&page_size=50&status=available"));
    const listing = listings.find((item) => item.property_type === "بيت" && item.governorate === "بغداد") ?? listings[0];
    if (!listing) throw new Error("no available listing");
    const buyer = await api.post("/people", { full_name: "نور الهدى عباس", phone_primary: "07700000201", roles: ["buyer"], source: "walk_in" });
    const request = await api.post("/purchase-requests", { person_id: buyer.id, property_type: listing.property_type, budget_max: Math.round(Number(listing.total_price) * 1.1), governorate: listing.governorate ?? "بغداد" });
    saleDeal = await api.post("/deals", { deal_type: "sale", property_id: listing.id, client_person_id: buyer.id, purchase_request_id: request.id, expected_commission: String(Math.round(Number(listing.total_price) * 0.02)) });
    for (const stage of ["contacted", "qualified", "viewing_scheduled", "viewing_done", "negotiating"]) await api.post(`/deals/${saleDeal.id}/stage`, { stage });
    await api.post("/activities", { person_id: buyer.id, deal_id: saleDeal.id, type: "phone_call", notes: "تفاوض على السعر بعد المعاينة" });
    const asking = Number(listing.total_price);
    const first = await api.post(`/deals/${saleDeal.id}/offers`, { party: "client", amount: String(Math.round(asking * 0.92)) });
    const counter = await api.post(`/deals/${saleDeal.id}/offers`, { party: "owner", amount: String(Math.round(asking * 0.96)) });
    await api.patch(`/deals/${saleDeal.id}/offers/${first.id}`, { status: "countered" });
    await api.patch(`/deals/${saleDeal.id}/offers/${counter.id}`, { status: "accepted" });
    const prepared = await api.post(`/deals/${saleDeal.id}/agreement`, { template_key: "sale" });
    return `${saleDeal.code} on ${listing.code}, contract draft #${prepared.agreement_id}`;
  });

  await step("commission on the sale and a partial receipt", async () => {
    if (!saleDeal || !cash) throw new Error("needs the sale deal and the cash account");
    const commission = await api.post("/commissions", { deal_id: saleDeal.id, payer_role: "client", basis: "percent", rate: "2", commission_date: today });
    const half = (Number(commission.amount) / 2).toFixed(2);
    const voucher = await api.post("/vouchers", { kind: "receipt", voucher_date: today, currency: "IQD", purpose: "commission", money_account_id: cash, description: "دفعة أولى من عمولة البيع", amount: half, commission_id: commission.id });
    return `${commission.code} ${commission.amount}, receipt ${voucher.code ?? voucher.id} ${half}`;
  });

  await step("early-stage deals for the pipeline board", async () => {
    const listings = items(await api.get("/properties?page=1&page_size=50&status=available")).filter((item) => item.id !== saleDeal?.property_id);
    const people = [
      { full_name: "حيدر صباح الموسوي", phone_primary: "07700000202", stage: "contacted" },
      { full_name: "رنا فاضل الحسيني", phone_primary: "07700000203", stage: "viewing_scheduled" },
    ];
    const codes = [];
    for (const [index, person] of people.entries()) {
      const listing = listings[index];
      if (!listing) break;
      const client = await api.post("/people", { full_name: person.full_name, phone_primary: person.phone_primary, roles: ["buyer"], source: "phone" }).catch(() => api.post("/people", { full_name: person.full_name, phone_primary: person.phone_primary, roles: ["buyer"], source: "walk_in" }));
      const deal = await api.post("/deals", { deal_type: "sale", property_id: listing.id, client_person_id: client.id });
      const order = ["contacted", "qualified", "viewing_scheduled"];
      for (const stage of order.slice(0, order.indexOf(person.stage) + 1)) await api.post(`/deals/${deal.id}/stage`, { stage });
      codes.push(deal.code);
    }
    return codes.join(", ");
  });

  // A lease entered by hand on a seeded rental, with the first rent received.
  await step("lease with schedule and first rent received", async () => {
    if (!cash) throw new Error("needs the cash account");
    const rentals = items(await api.get("/rentals?page=1&page_size=50"));
    const rental = rentals.find((item) => item.status === "available" && item.owner_person_id) ?? rentals.find((item) => item.owner_person_id);
    if (!rental) throw new Error("no rental with a linked owner");
    const tenant = await api.post("/people", { full_name: "عمار جاسم الربيعي", phone_primary: "07700000204", roles: ["tenant"], source: "walk_in" });
    const start = isoDay(-45);
    const end = isoDay(320);
    const lease = await api.post("/leases", { currency: "IQD", rent_amount: String(Math.round(Number(rental.rent_price) || 750000)), frequency: "monthly", start_date: start, end_date: end, rental_id: rental.id, landlord_person_id: rental.owner_person_id, tenant_person_id: tenant.id, deposit: "500000", office_collects: true, notes: "عقد إيجار تجريبي للدليل" });
    const shown = await api.get(`/leases/${lease.id}`);
    const first = (shown.installments ?? []).find((installment) => Number(installment.outstanding ?? installment.amount) > 0);
    // Rent the office collects is held for the landlord (client funds), as in workflows.test.ts.
    if (first) await api.post("/vouchers", { kind: "receipt", voucher_date: today, currency: "IQD", purpose: "client_funds", money_account_id: cash, description: "إيجار الشهر الأول", amount: String(first.outstanding ?? first.amount), lease_installment_id: first.id });
    return `${lease.code ?? `#${lease.id}`} on ${rental.code}${first ? ", first installment received" : ""}`;
  });

  await step("follow-up task for today", async () => {
    const listings = items(await api.get("/properties?page=1&page_size=5"));
    if (!listings[0]) throw new Error("no listing");
    await api.post(`/properties/${listings[0].id}/followups`, { type: "phone_call", notes: "الاتصال بالمالك لتأكيد موعد المعاينة", due_at: new Date(Date.now() + 3 * 3600_000).toISOString() });
    return listings[0].code;
  });
  return report;
}
