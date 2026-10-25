import { and, eq } from "drizzle-orm";
import { db } from "../../infrastructure/database/db.js";
import {
  people,
  properties,
  purchaseRequests,
  rentalRequests,
  rentals,
} from "../../infrastructure/database/schema.js";
import { toApiObject } from "../../shared/utils/case.js";
import {
  compareMatches,
  evaluateMatch,
  isListedMatch,
  type MatchEvaluation,
  type MatchKind,
} from "./matching.rules.js";

export type { MatchReason } from "./matching.rules.js";
export type MatchResult = MatchEvaluation & {
  record: Record<string, unknown>;
};

/** Listed matches of one side against the other, full matches first. */
function listMatches<T>(
  kind: MatchKind,
  candidates: T[],
  pair: (candidate: T) => {
    request: Record<string, unknown>;
    offer: Record<string, unknown>;
    record: Record<string, unknown>;
  },
): MatchResult[] {
  return candidates
    .map((candidate) => {
      const { request, offer, record } = pair(candidate);
      return { ...evaluateMatch(kind, request, offer), record };
    })
    .filter(isListedMatch)
    .sort(compareMatches);
}

export async function findRentalOfferMatches(
  requestId: number,
): Promise<MatchResult[]> {
  const [request] = await db
    .select()
    .from(rentalRequests)
    .where(
      and(eq(rentalRequests.id, requestId), eq(rentalRequests.status, "open")),
    )
    .limit(1);
  if (!request) return [];
  const offers = await db
    .select()
    .from(rentals)
    .where(eq(rentals.status, "available"));
  return listMatches("rental", offers, (offer) => ({
    request: toApiObject(request),
    offer: toApiObject(offer),
    record: toApiObject(offer, "rentals"),
  }));
}

export async function findRentalRequestMatches(
  rentalId: number,
): Promise<MatchResult[]> {
  const [offer] = await db
    .select()
    .from(rentals)
    .where(and(eq(rentals.id, rentalId), eq(rentals.status, "available")))
    .limit(1);
  if (!offer) return [];
  const requests = await db
    .select({
      request: rentalRequests,
      customerName: people.fullName,
      customerCode: people.code,
    })
    .from(rentalRequests)
    .innerJoin(people, eq(rentalRequests.personId, people.id))
    .where(eq(rentalRequests.status, "open"));
  return listMatches(
    "rental",
    requests,
    ({ request, customerName, customerCode }) => ({
      request: toApiObject(request),
      offer: toApiObject(offer),
      record: {
        ...toApiObject(request),
        customer_name: customerName,
        customer_code: customerCode,
      },
    }),
  );
}

export async function findPurchaseOfferMatches(
  requestId: number,
): Promise<MatchResult[]> {
  const [request] = await db
    .select()
    .from(purchaseRequests)
    .where(
      and(
        eq(purchaseRequests.id, requestId),
        eq(purchaseRequests.status, "open"),
      ),
    )
    .limit(1);
  if (!request) return [];
  const offers = await db
    .select()
    .from(properties)
    .where(eq(properties.status, "available"));
  return listMatches("sale", offers, (offer) => ({
    request: toApiObject(request),
    offer: toApiObject(offer),
    record: toApiObject(offer, "properties"),
  }));
}

export async function findPurchaseRequestMatches(
  propertyId: number,
): Promise<MatchResult[]> {
  const [offer] = await db
    .select()
    .from(properties)
    .where(
      and(eq(properties.id, propertyId), eq(properties.status, "available")),
    )
    .limit(1);
  if (!offer) return [];
  const requests = await db
    .select({
      request: purchaseRequests,
      customerName: people.fullName,
      customerCode: people.code,
    })
    .from(purchaseRequests)
    .innerJoin(people, eq(purchaseRequests.personId, people.id))
    .where(eq(purchaseRequests.status, "open"));
  return listMatches(
    "sale",
    requests,
    ({ request, customerName, customerCode }) => ({
      request: toApiObject(request),
      offer: toApiObject(offer),
      record: {
        ...toApiObject(request),
        customer_name: customerName,
        customer_code: customerCode,
      },
    }),
  );
}
