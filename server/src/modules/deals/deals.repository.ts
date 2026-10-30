import {
  and,
  asc,
  desc,
  eq,
  ilike,
  inArray,
  or,
  sql,
  type SQL,
} from "drizzle-orm";
import { alias, type AnyPgColumn } from "drizzle-orm/pg-core";
import { db } from "../../infrastructure/database/db.js";
import {
  withRecordCodeLock,
  type Transaction,
} from "../../infrastructure/database/record-codes.js";
import {
  agreements,
  dealOffers,
  dealStageHistory,
  deals,
  people,
  properties,
  purchaseRequests,
  rentalRequests,
  rentals,
  users,
  type Deal,
} from "../../infrastructure/database/schema.js";
import { DomainError } from "../../shared/errors.js";
import { toApiObject } from "../../shared/utils/case.js";
import {
  pageOffset,
  sortNullsLast,
  type SortOrder,
} from "../../shared/utils/paging.js";
import { containsPattern } from "../../shared/utils/search.js";
import {
  dealFundsHeld,
  dealLiveCommissions,
} from "../accounting/finance.repository.js";
import { listActivities } from "../activities/activities.repository.js";
import { recordAudit } from "../audit/audit.service.js";
import { assertTaskLinks } from "../tasks/tasks.links.js";
import {
  CLOSED_STAGES,
  OPEN_STAGES,
  isClosed,
  stageMoveError,
  type DealStage,
} from "./deals.rules.js";
import type {
  DealFilters,
  DealPageQuery,
  DealPayload,
  DealSortKey,
} from "./deals.schema.js";

const ENTITY = "deal";
const client = alias(people, "client");
const owner = alias(people, "owner");
const assignee = alias(users, "assignee");

/** A deal with the names of what it links to. */
function selectDeals() {
  return db
    .select({
      deal: deals,
      clientName: client.fullName,
      clientPhone: client.phonePrimary,
      ownerName: owner.fullName,
      assignedUserName: assignee.displayName,
      listingCode: sql<
        string | null
      >`coalesce(${properties.code}, ${rentals.code})`,
      listingName: sql<
        string | null
      >`coalesce(${properties.name}, 'عقار ' || ${properties.code}, ${rentals.name}, 'إيجار ' || ${rentals.code})`,
      requestCode: sql<
        string | null
      >`coalesce(${purchaseRequests.code}, ${rentalRequests.code})`,
      agreementCode: agreements.code,
      agreementStatus: agreements.status,
    })
    .from(deals)
    .innerJoin(client, eq(deals.clientPersonId, client.id))
    .leftJoin(owner, eq(deals.ownerPersonId, owner.id))
    .leftJoin(assignee, eq(deals.assignedUserId, assignee.id))
    .leftJoin(properties, eq(deals.propertyId, properties.id))
    .leftJoin(rentals, eq(deals.rentalId, rentals.id))
    .leftJoin(
      purchaseRequests,
      eq(deals.purchaseRequestId, purchaseRequests.id),
    )
    .leftJoin(rentalRequests, eq(deals.rentalRequestId, rentalRequests.id))
    .leftJoin(agreements, eq(deals.agreementId, agreements.id));
}

type DealRow = Awaited<
  ReturnType<ReturnType<typeof selectDeals>["execute"]>
>[number];

function dealApi(row: DealRow): Record<string, unknown> {
  return {
    ...toApiObject(row.deal),
    client_name: row.clientName,
    client_phone: row.clientPhone,
    owner_name: row.ownerName,
    assigned_user_name: row.assignedUserName,
    listing_code: row.listingCode,
    listing_name: row.listingName,
    request_code: row.requestCode,
    agreement_code: row.agreementCode,
    agreement_status: row.agreementStatus,
  };
}

const OPEN = sql.raw(
  `(${OPEN_STAGES.map((stage) => `'${stage}'`).join(", ")})`,
);

function conditions(filters: DealFilters, userId?: number) {
  const where: SQL[] = [];
  if (filters.deal_type) where.push(eq(deals.dealType, filters.deal_type));
  if (filters.stage) where.push(eq(deals.stage, filters.stage));
  if (filters.state === "open") where.push(sql`${deals.stage} IN ${OPEN}`);
  else if (filters.state === "closed")
    where.push(inArray(deals.stage, [...CLOSED_STAGES]));
  if (filters.assigned === "me")
    where.push(eq(deals.assignedUserId, userId ?? 0));
  else if (filters.assigned === "unassigned")
    where.push(sql`${deals.assignedUserId} IS NULL`);
  else if (typeof filters.assigned === "number")
    where.push(eq(deals.assignedUserId, filters.assigned));
  if (filters.person_id)
    where.push(
      or(
        eq(deals.clientPersonId, filters.person_id),
        eq(deals.ownerPersonId, filters.person_id),
      )!,
    );
  if (filters.property_id)
    where.push(eq(deals.propertyId, filters.property_id));
  if (filters.rental_id) where.push(eq(deals.rentalId, filters.rental_id));
  if (filters.stalled_days) {
    const days = filters.stalled_days;
    where.push(sql`${deals.stage} IN ${OPEN}
      AND ${deals.stageChangedAt} < now() - make_interval(days => ${days})
      AND NOT EXISTS (SELECT 1 FROM activities a WHERE a.deal_id = ${deals.id}
        AND greatest(a.created_at, a.updated_at) >= now() - make_interval(days => ${days}))
      AND NOT EXISTS (SELECT 1 FROM deal_offers o WHERE o.deal_id = ${deals.id}
        AND greatest(o.created_at, o.updated_at) >= now() - make_interval(days => ${days}))`);
  }
  const q = filters.q?.trim();
  if (q) {
    const pattern = containsPattern(q);
    where.push(
      or(
        ilike(deals.code, pattern),
        ilike(deals.title, pattern),
        ilike(client.fullName, pattern),
        ilike(owner.fullName, pattern),
        ilike(properties.code, pattern),
        ilike(rentals.code, pattern),
      )!,
    );
  }
  return and(...where);
}

const SORT_COLUMNS: Record<DealSortKey, AnyPgColumn> = {
  updated_at: deals.updatedAt,
  created_at: deals.createdAt,
  stage_changed_at: deals.stageChangedAt,
  expected_close_date: deals.expectedCloseDate,
  asking_price: deals.askingPrice,
  agreed_price: deals.agreedPrice,
  code: deals.code,
};

function orderBy(key: DealSortKey, order: SortOrder): SQL[] {
  return [
    sortNullsLast(SORT_COLUMNS[key], order),
    order === "asc" ? asc(deals.id) : desc(deals.id),
  ];
}

export async function listDealsPage(query: DealPageQuery, userId?: number) {
  const where = conditions(query, userId);
  const rows = await selectDeals()
    .where(where)
    .orderBy(...orderBy(query.sort_by, query.sort_order))
    .limit(query.page_size)
    .offset(pageOffset(query.page, query.page_size));
  const [{ total }] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(deals)
    .innerJoin(client, eq(deals.clientPersonId, client.id))
    .leftJoin(owner, eq(deals.ownerPersonId, owner.id))
    .leftJoin(properties, eq(deals.propertyId, properties.id))
    .leftJoin(rentals, eq(deals.rentalId, rentals.id))
    .where(where);
  return {
    items: rows.map(dealApi),
    total,
    page: query.page,
    page_size: query.page_size,
  };
}

/**
 * The pipeline: per stage and currency, how many deals and what their asking
 * and agreed prices and expected commissions add up to (exact numeric sums;
 * IQD and USD are never added together).
 */
export async function dealPipeline(filters: DealFilters, userId?: number) {
  const rows = await db
    .select({
      stage: deals.stage,
      currency: deals.currency,
      count: sql<number>`count(*)::int`,
      asking_total: sql<string>`coalesce(sum(${deals.askingPrice}), 0)::numeric(18,2)::text`,
      agreed_total: sql<string>`coalesce(sum(${deals.agreedPrice}), 0)::numeric(18,2)::text`,
      expected_commission_total: sql<string>`coalesce(sum(${deals.expectedCommission}), 0)::numeric(18,2)::text`,
    })
    .from(deals)
    .innerJoin(client, eq(deals.clientPersonId, client.id))
    .leftJoin(owner, eq(deals.ownerPersonId, owner.id))
    .leftJoin(properties, eq(deals.propertyId, properties.id))
    .leftJoin(rentals, eq(deals.rentalId, rentals.id))
    .where(conditions(filters, userId))
    .groupBy(deals.stage, deals.currency)
    .orderBy(deals.stage, deals.currency);
  return { stages: rows };
}

export async function getDeal(id: number) {
  const [row] = await selectDeals().where(eq(deals.id, id));
  return row ? dealApi(row) : null;
}

/** Offers as the deal page lists them, with who recorded each. */
function selectOffers() {
  return db
    .select({
      id: dealOffers.id,
      deal_id: dealOffers.dealId,
      party: dealOffers.party,
      amount: dealOffers.amount,
      status: dealOffers.status,
      notes: dealOffers.notes,
      created_by_name: users.displayName,
      created_at: dealOffers.createdAt,
      updated_at: dealOffers.updatedAt,
    })
    .from(dealOffers)
    .leftJoin(users, eq(dealOffers.createdBy, users.id));
}

/** A deal with its offers, stage history and activities, for its page. */
export async function getDealDetail(id: number) {
  const deal = await getDeal(id);
  if (!deal) return null;
  const historyUser = alias(users, "history_user");
  const [offers, history, activities] = await Promise.all([
    selectOffers()
      .where(eq(dealOffers.dealId, id))
      .orderBy(desc(dealOffers.createdAt), desc(dealOffers.id)),
    db
      .select({
        id: dealStageHistory.id,
        from_stage: dealStageHistory.fromStage,
        to_stage: dealStageHistory.toStage,
        reason: dealStageHistory.reason,
        user_name: historyUser.displayName,
        created_at: dealStageHistory.createdAt,
      })
      .from(dealStageHistory)
      .leftJoin(historyUser, eq(dealStageHistory.userId, historyUser.id))
      .where(eq(dealStageHistory.dealId, id))
      .orderBy(desc(dealStageHistory.createdAt), desc(dealStageHistory.id)),
    listActivities({ deal_id: id }),
  ]);
  return { ...deal, offers, history, activities };
}

async function generateCode(tx: Transaction) {
  const [last] = await tx
    .select({ code: deals.code })
    .from(deals)
    .orderBy(desc(deals.id))
    .limit(1);
  const next = last?.code ? Number(last.code.split("-")[1] ?? 0) + 1 : 1;
  return `D-${String(next).padStart(4, "0")}`;
}

/**
 * Checks what a deal links to and fills what can be taken from its listing
 * (the owner and the asking price) when the payload leaves it out.
 */
async function resolveLinks(payload: DealPayload) {
  const sale = payload.deal_type === "sale";
  if (sale ? payload.rental_id : payload.property_id)
    throw new DomainError(
      400,
      sale
        ? "صفقة البيع تكون على عرض بيع لا على عرض إيجار."
        : "صفقة الإيجار تكون على عرض إيجار لا على عرض بيع.",
    );
  if (sale ? payload.rental_request_id : payload.purchase_request_id)
    throw new DomainError(
      400,
      sale ? "صفقة البيع ترتبط بطلب شراء." : "صفقة الإيجار ترتبط بطلب إيجار.",
    );
  await assertTaskLinks({
    person_id: payload.client_person_id,
    assigned_user_id: payload.assigned_user_id,
  });
  let ownerPersonId = payload.owner_person_id;
  let askingPrice = payload.asking_price;
  const listingId = sale ? payload.property_id : payload.rental_id;
  if (listingId) {
    const [listing] = sale
      ? await db
          .select({
            owner: properties.ownerPersonId,
            price: properties.totalPrice,
          })
          .from(properties)
          .where(eq(properties.id, listingId))
      : await db
          .select({ owner: rentals.ownerPersonId, price: rentals.rentPrice })
          .from(rentals)
          .where(eq(rentals.id, listingId));
    if (!listing) throw new DomainError(400, "العرض المحدد غير موجود.");
    if (ownerPersonId === undefined) ownerPersonId = listing.owner;
    // An empty asking price is the listing's price.
    if (askingPrice === null && listing.price) askingPrice = listing.price;
  }
  if (ownerPersonId) {
    await assertTaskLinks({ person_id: ownerPersonId });
    if (ownerPersonId === payload.client_person_id)
      throw new DomainError(
        400,
        sale
          ? "البائع والمشتري لا يكونان الشخص نفسه."
          : "المؤجر والمستأجر لا يكونان الشخص نفسه.",
      );
  }
  const requestId = sale
    ? payload.purchase_request_id
    : payload.rental_request_id;
  if (requestId) {
    const table = sale ? purchaseRequests : rentalRequests;
    const [request] = await db
      .select({ personId: table.personId })
      .from(table)
      .where(eq(table.id, requestId));
    if (!request || request.personId !== payload.client_person_id)
      throw new DomainError(400, "الطلب المحدد ليس من طلبات هذا الزبون.");
  }
  return { ownerPersonId: ownerPersonId ?? null, askingPrice };
}

function dealValues(
  payload: DealPayload,
  links: Awaited<ReturnType<typeof resolveLinks>>,
) {
  const sale = payload.deal_type === "sale";
  return {
    dealType: payload.deal_type,
    title: payload.title,
    priority: payload.priority,
    propertyId: sale ? (payload.property_id ?? null) : null,
    rentalId: sale ? null : (payload.rental_id ?? null),
    clientPersonId: payload.client_person_id,
    ownerPersonId: links.ownerPersonId,
    assignedUserId: payload.assigned_user_id ?? null,
    purchaseRequestId: sale ? (payload.purchase_request_id ?? null) : null,
    rentalRequestId: sale ? null : (payload.rental_request_id ?? null),
    currency: payload.currency,
    askingPrice: links.askingPrice,
    agreedPrice: payload.agreed_price,
    expectedCommission: payload.expected_commission,
    expectedCloseDate: payload.expected_close_date ?? null,
    notes: payload.notes,
  };
}

export async function createDeal(payload: DealPayload, userId?: number) {
  const links = await resolveLinks(payload);
  const created = await withRecordCodeLock("deals", async (tx) => {
    const [row] = await tx
      .insert(deals)
      .values({
        ...dealValues(payload, links),
        code: await generateCode(tx),
        createdBy: userId ?? null,
        updatedBy: userId ?? null,
      })
      .returning();
    await tx.insert(dealStageHistory).values({
      dealId: row.id,
      fromStage: null,
      toStage: row.stage,
      userId: userId ?? null,
    });
    return row;
  });
  const deal = await getDeal(created.id);
  await recordAudit({
    entityType: ENTITY,
    entityId: created.id,
    action: "created",
    newValue: deal,
    userId,
  });
  return deal;
}

async function lockDeal(tx: Transaction, id: number) {
  const [row] = await tx
    .select()
    .from(deals)
    .where(eq(deals.id, id))
    .for("update");
  return row ?? null;
}

export async function updateDeal(
  id: number,
  payload: DealPayload,
  userId?: number,
) {
  const before = await getDeal(id);
  if (!before) return null;
  if (before.deal_type !== payload.deal_type)
    throw new DomainError(400, "لا يتغير نوع الصفقة بعد إنشائها.");
  const links = await resolveLinks(payload);
  await db.transaction(async (tx) => {
    const current = await lockDeal(tx, id);
    if (!current) return;
    await tx
      .update(deals)
      .set({
        ...dealValues(payload, links),
        updatedBy: userId ?? null,
        updatedAt: new Date(),
      })
      .where(eq(deals.id, id));
  });
  const after = await getDeal(id);
  await recordAudit({
    entityType: ENTITY,
    entityId: id,
    action:
      before.agreed_price !== after?.agreed_price ? "price_changed" : "updated",
    oldValue: before,
    newValue: after,
    userId,
  });
  return after;
}

/**
 * Moves a deal inside the caller's transaction, which holds its row lock:
 * checks the move, then records it.
 */
export async function moveDealStageIn(
  tx: Transaction,
  deal: Deal,
  to: DealStage,
  input: { reason?: string | null; lost_reason?: string | null },
  userId?: number,
) {
  const [agreement] = deal.agreementId
    ? await tx
        .select({ status: agreements.status })
        .from(agreements)
        .where(eq(agreements.id, deal.agreementId))
    : [];
  // Recording a commission takes the same deal lock, so none slips in.
  const openMoney =
    to === "lost" || to === "cancelled"
      ? {
          liveCommissions: await dealLiveCommissions(tx, deal.id),
          fundsHeld: await dealFundsHeld(tx, deal.id),
        }
      : undefined;
  const error = stageMoveError(
    {
      stage: deal.stage,
      agreedPrice: deal.agreedPrice,
      ownerPersonId: deal.ownerPersonId,
      agreementStatus: agreement?.status ?? null,
      openMoney,
    },
    to,
    input,
  );
  if (error) throw new DomainError(409, error, "DEAL_STAGE_REFUSED");
  const now = new Date();
  await tx
    .update(deals)
    .set({
      stage: to,
      stageChangedAt: now,
      closedAt: isClosed(to) ? now : null,
      lostReason: to === "lost" ? (input.lost_reason?.trim() ?? null) : null,
      updatedBy: userId ?? null,
      updatedAt: now,
    })
    .where(eq(deals.id, deal.id));
  await tx.insert(dealStageHistory).values({
    dealId: deal.id,
    fromStage: deal.stage,
    toStage: to,
    reason:
      (to === "lost" ? input.lost_reason?.trim() : input.reason?.trim()) ||
      null,
    userId: userId ?? null,
  });
}

export async function moveDealStage(
  id: number,
  to: DealStage,
  input: { reason?: string | null; lost_reason?: string | null },
  userId?: number,
) {
  const from = await db.transaction(async (tx) => {
    const deal = await lockDeal(tx, id);
    if (!deal) return null;
    await moveDealStageIn(tx, deal, to, input, userId);
    return deal.stage;
  });
  if (from === null) return null;
  await recordAudit({
    entityType: ENTITY,
    entityId: id,
    action: "status_changed",
    oldValue: { stage: from },
    newValue: { stage: to, reason: input.reason ?? input.lost_reason ?? null },
    userId,
  });
  return getDealDetail(id);
}

/** The deal's current stage, for the route's permission check. */
export async function dealStage(id: number) {
  const [row] = await db
    .select({ stage: deals.stage })
    .from(deals)
    .where(eq(deals.id, id));
  return row?.stage ?? null;
}

export async function addDealOffer(
  dealId: number,
  offer: { party: "client" | "owner"; amount: string; notes: string | null },
  userId?: number,
) {
  const created = await db.transaction(async (tx) => {
    const deal = await lockDeal(tx, dealId);
    if (!deal) return null;
    if (isClosed(deal.stage))
      throw new DomainError(409, "الصفقة مغلقة؛ أعد فتحها لتسجيل عرض.");
    const [row] = await tx
      .insert(dealOffers)
      .values({
        dealId,
        party: offer.party,
        amount: offer.amount,
        notes: offer.notes,
        createdBy: userId ?? null,
      })
      .returning();
    await tx
      .update(deals)
      .set({ updatedAt: new Date(), updatedBy: userId ?? null })
      .where(eq(deals.id, dealId));
    return row;
  });
  if (!created) return null;
  const [listed] = await selectOffers().where(eq(dealOffers.id, created.id));
  return listed;
}

/**
 * Settles an offer. Accepting it makes its amount the agreed price, and a
 * deal still before "agreed" moves there, recorded like any other move.
 */
export async function setDealOfferStatus(
  dealId: number,
  offerId: number,
  status: "countered" | "accepted" | "rejected" | "withdrawn",
  userId?: number,
) {
  const result = await db.transaction(async (tx) => {
    const deal = await lockDeal(tx, dealId);
    if (!deal) return null;
    if (isClosed(deal.stage))
      throw new DomainError(409, "الصفقة مغلقة؛ أعد فتحها لتغيير العروض.");
    const [offer] = await tx
      .update(dealOffers)
      .set({ status, updatedAt: new Date() })
      .where(and(eq(dealOffers.id, offerId), eq(dealOffers.dealId, dealId)))
      .returning();
    if (!offer) return null;
    if (status === "accepted") {
      await tx
        .update(deals)
        .set({
          agreedPrice: offer.amount,
          updatedAt: new Date(),
          updatedBy: userId ?? null,
        })
        .where(eq(deals.id, dealId));
      const beforeAgreed =
        OPEN_STAGES.indexOf(deal.stage as (typeof OPEN_STAGES)[number]) <
        OPEN_STAGES.indexOf("agreed");
      if (beforeAgreed)
        await moveDealStageIn(
          tx,
          { ...deal, agreedPrice: offer.amount },
          "agreed",
          { reason: `قُبل عرض بمبلغ ${offer.amount}.` },
          userId,
        );
    }
    return offer;
  });
  if (!result) return null;
  if (status === "accepted")
    await recordAudit({
      entityType: ENTITY,
      entityId: dealId,
      action: "price_changed",
      newValue: { agreed_price: result.amount, offer_id: offerId },
      userId,
    });
  return getDealDetail(dealId);
}
