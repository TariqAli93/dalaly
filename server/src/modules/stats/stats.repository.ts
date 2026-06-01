import { count, eq } from "drizzle-orm";
import { db } from "../../infrastructure/database/db.js";
import { properties } from "../../infrastructure/database/schema.js";

export async function getSummaryStats() {
  const [total, available, sold, archived, byType, byLegalType, byPricingMethod] = await Promise.all([
    db.select({ count: count() }).from(properties),
    db.select({ count: count() }).from(properties).where(eq(properties.status, "available")),
    db.select({ count: count() }).from(properties).where(eq(properties.status, "sold")),
    db.select({ count: count() }).from(properties).where(eq(properties.status, "archived")),
    db
      .select({
        name: properties.propertyType,
        count: count()
      })
      .from(properties)
      .groupBy(properties.propertyType)
      .orderBy(properties.propertyType),
    db
      .select({
        name: properties.legalType,
        count: count()
      })
      .from(properties)
      .groupBy(properties.legalType)
      .orderBy(properties.legalType),
    db
      .select({
        name: properties.pricingMethod,
        count: count()
      })
      .from(properties)
      .groupBy(properties.pricingMethod)
      .orderBy(properties.pricingMethod)
  ]);

  return {
    total: total[0]?.count ?? 0,
    available: available[0]?.count ?? 0,
    sold: sold[0]?.count ?? 0,
    archived: archived[0]?.count ?? 0,
    by_type: byType,
    by_legal_type: byLegalType,
    by_pricing_method: byPricingMethod
  };
}
