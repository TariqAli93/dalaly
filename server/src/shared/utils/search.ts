import { sql, type SQL } from "drizzle-orm";

/** كلمات البحث الشامل: النص مقسوماً على المسافات (AND بين الكلمات). */
export function searchTokens(term?: string): string[] {
  return (term ?? "").trim().split(/\s+/).filter(Boolean);
}

/**
 * نمط LIKE/ILIKE يطابق أي قيمة تحوي النص كما كُتب: تُهرَّب % و _ و \ (محارف
 * LIKE، و\ محرف التهريب الافتراضي)، فلا يصير ما يكتبه المستخدم محرفاً بديلاً.
 */
export function containsPattern(text: string): string {
  return `%${text.replace(/[\\%_]/g, "\\$&")}%`;
}

/**
 * هل يحوي عمود search_text (هجرة 0003) الكلمة كما كُتبت؟ تُصغَّر الأحرف بـ
 * lower() كالعمود نفسه، فيطابق الشرط ما كان ILIKE يطابقه في أي حقل منفرد.
 * الكلمة لا تحوي مسافة، والمسافة تفصل الحقول في العمود، فلا تمتد مطابقة عبر
 * حقلين.
 */
export function searchTextContains(searchText: SQL, token: string): SQL {
  return sql`${searchText} like lower(${containsPattern(token)})`;
}
