import { sql } from "drizzle-orm";
import { db } from "../../infrastructure/database/db.js";
import { properties } from "../../infrastructure/database/schema.js";

export async function getSummaryStats() {
  const [totals, byType, byLegalType, byPricingMethod] = await Promise.all([
    db
      .select({
        total: sql<number>`count(*)::int`,
        available: sql<number>`count(*) filter (where ${properties.status} = 'available')::int`,
        sold: sql<number>`count(*) filter (where ${properties.status} = 'sold')::int`,
        archived: sql<number>`count(*) filter (where ${properties.status} = 'archived')::int`
      })
      .from(properties),
    db
      .select({
        name: properties.propertyType,
        count: sql<number>`count(*)::int`
      })
      .from(properties)
      .groupBy(properties.propertyType)
      .orderBy(properties.propertyType),
    db
      .select({
        name: properties.legalType,
        count: sql<number>`count(*)::int`
      })
      .from(properties)
      .groupBy(properties.legalType)
      .orderBy(properties.legalType),
    db
      .select({
        name: properties.pricingMethod,
        count: sql<number>`count(*)::int`
      })
      .from(properties)
      .groupBy(properties.pricingMethod)
      .orderBy(properties.pricingMethod)
  ]);

  return {
    ...totals[0],
    by_type: byType,
    by_legal_type: byLegalType,
    by_pricing_method: byPricingMethod
  };
}
