import { sql, type SQL } from "drizzle-orm";

/** كلمات البحث الشامل: النص مقسوماً على المسافات (AND بين الكلمات). */
export function searchTokens(term?: string): string[] {
  return (term ?? "").trim().split(/\s+/).filter(Boolean);
}

/**
 * هل يحوي عمود search_text (هجرة 0003) الكلمة كما كُتبت؟ تُهرَّب % و _ و \
 * (محارف LIKE)، وتُصغَّر الأحرف بـ lower() كالعمود نفسه، فيطابق الشرط ما كان
 * ILIKE يطابقه في أي حقل منفرد. الكلمة لا تحوي مسافة، والمسافة تفصل الحقول في
 * العمود، فلا تمتد مطابقة عبر حقلين.
 */
export function searchTextContains(searchText: SQL, token: string): SQL {
  const pattern = `%${token.replace(/[\\%_]/g, "\\$&")}%`;
  return sql`${searchText} like lower(${pattern})`;
}
