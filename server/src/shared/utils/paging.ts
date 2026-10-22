import { sql, type SQL } from "drizzle-orm";
import { type AnyPgColumn } from "drizzle-orm/pg-core";

export type SortOrder = "asc" | "desc";

/**
 * المساحة بالمتر المربع لفرز القوائم، بنفس قواعد convertAreaToSquareMeters في
 * الواجهة (apps/renderer/src/utils/area.ts): الدونم = 2500 م²، والمساحة السالبة
 * أو الوحدة غير المعروفة تُعدّ بلا مساحة (null) فتأتي في النهاية.
 */
export function areaInSquareMeters(value: AnyPgColumn, unit: AnyPgColumn): SQL {
  return sql`(case
    when ${value} < 0 then null
    when btrim(${unit}) in ('dunum', 'donum', 'دونم') then ${value} * 2500
    when btrim(${unit}) in ('square_meter', 'sqm', 'm2', 'متر', 'متر مربع') then ${value}
  end)`;
}

/** عنصر ORDER BY بالقيم الفارغة في النهاية دائماً، في الاتجاهين. */
export function sortNullsLast(
  expression: SQL | AnyPgColumn,
  order: SortOrder,
): SQL {
  return order === "asc"
    ? sql`${expression} asc nulls last`
    : sql`${expression} desc nulls last`;
}

/**
 * عدد كل الصفوف المطابقة مع كل صف من الصفحة، فتكفي الصفحة استعلاماً واحداً
 * (فحص الفلاتر والبحث مرة واحدة بدل مرتين).
 */
export function totalRowsColumn() {
  return sql<number>`count(*) over ()`.mapWith(Number);
}

export function pageOffset(page: number, pageSize: number) {
  return (page - 1) * pageSize;
}
