import { eq, inArray, sql } from "drizzle-orm";
import { db } from "../../infrastructure/database/db.js";
import { accounts } from "../../infrastructure/database/schema.js";
import { CURRENCIES, type Currency } from "../../shared/money.js";
import type { AccountType } from "./accounting.rules.js";

/**
 * The office's default chart of accounts. Each entry has a `system_key` that
 * the ledger, receipts and commissions find it by; its code and name are only
 * labels (the name can be changed, nothing else). Headings group the posting
 * accounts, which come in one account per currency: `cash.IQD`, `cash.USD`.
 *
 * Money collected for a landlord or seller is a liability (client funds),
 * never income; only the office's commission and fees are revenue.
 */

type Heading = {
  key: string;
  code: string;
  name: string;
  type: AccountType;
  /** Posting accounts of this heading, one per currency. */
  perCurrency?: boolean;
  children?: Heading[];
};

const CURRENCY_SUFFIX: Record<Currency, { digit: string; name: string }> = {
  IQD: { digit: "1", name: "دينار" },
  USD: { digit: "2", name: "دولار" },
};

const CHART: Heading[] = [
  {
    key: "assets",
    code: "1",
    name: "الأصول",
    type: "asset",
    children: [
      {
        key: "cash",
        code: "11",
        name: "الصندوق",
        type: "asset",
        perCurrency: true,
      },
      {
        key: "bank",
        code: "12",
        name: "المصرف",
        type: "asset",
        perCurrency: true,
      },
      {
        key: "receivables",
        code: "13",
        name: "ذمم العملاء المدينة",
        type: "asset",
        perCurrency: true,
      },
    ],
  },
  {
    key: "liabilities",
    code: "2",
    name: "الالتزامات",
    type: "liability",
    children: [
      {
        key: "client_funds",
        code: "21",
        name: "أمانات العملاء",
        type: "liability",
        perCurrency: true,
      },
      {
        key: "payables",
        code: "22",
        name: "الذمم الدائنة",
        type: "liability",
        perCurrency: true,
      },
      {
        key: "commissions_payable",
        code: "23",
        name: "عمولات الموظفين المستحقة",
        type: "liability",
        perCurrency: true,
      },
    ],
  },
  {
    key: "equity",
    code: "3",
    name: "حقوق الملكية",
    type: "equity",
    children: [
      {
        key: "capital",
        code: "31",
        name: "رأس المال",
        type: "equity",
        perCurrency: true,
      },
      {
        key: "retained_earnings",
        code: "32",
        name: "الأرباح المحتجزة",
        type: "equity",
        perCurrency: true,
      },
    ],
  },
  {
    key: "revenue",
    code: "4",
    name: "الإيرادات",
    type: "revenue",
    children: [
      {
        key: "brokerage_income",
        code: "41",
        name: "عمولات الوساطة",
        type: "revenue",
        perCurrency: true,
      },
      {
        key: "other_income",
        code: "42",
        name: "إيرادات أخرى",
        type: "revenue",
        perCurrency: true,
      },
    ],
  },
  {
    key: "expenses",
    code: "5",
    name: "المصروفات",
    type: "expense",
    children: [
      {
        key: "commission_expense",
        code: "51",
        name: "عمولات الموظفين",
        type: "expense",
        perCurrency: true,
      },
      {
        key: "operating_expenses",
        code: "52",
        name: "المصروفات التشغيلية",
        type: "expense",
        perCurrency: true,
      },
    ],
  },
];

export type DefaultAccount = {
  systemKey: string;
  parentKey: string | null;
  code: string;
  name: string;
  accountType: AccountType;
  currency: Currency | null;
  isPostable: boolean;
};

/** The chart flattened, each account after its heading. */
export const DEFAULT_ACCOUNTS: DefaultAccount[] = (() => {
  const out: DefaultAccount[] = [];
  const walk = (heading: Heading, parentKey: string | null) => {
    out.push({
      systemKey: heading.key,
      parentKey,
      code: heading.code,
      name: heading.name,
      accountType: heading.type,
      currency: null,
      isPostable: false,
    });
    for (const child of heading.children ?? []) walk(child, heading.key);
    if (heading.perCurrency)
      for (const currency of CURRENCIES)
        out.push({
          systemKey: `${heading.key}.${currency}`,
          parentKey: heading.key,
          code: `${heading.code}0${CURRENCY_SUFFIX[currency].digit}`,
          name: `${heading.name} — ${CURRENCY_SUFFIX[currency].name}`,
          accountType: heading.type,
          currency,
          isPostable: true,
        });
  };
  for (const heading of CHART) walk(heading, null);
  return out;
})();

/** The posting account of a system key in a currency: `cash` + IQD. */
export const systemAccountKey = (key: string, currency: Currency) =>
  `${key}.${currency}`;

/**
 * Adds the default accounts that are missing, found by system key; existing
 * ones are left as they are. Runs after migrations at startup and after a
 * restore of an archive made before the chart existed. Cheap when nothing is
 * missing: one query.
 */
export async function ensureDefaultChart(database: typeof db = db) {
  // A migrations folder from before 0008 (the upgrade tests) has no table.
  const table = await database.execute<{ name: string | null }>(
    sql`SELECT to_regclass('accounts')::text AS name`,
  );
  if (!table.rows[0]?.name) return 0;
  const keys = DEFAULT_ACCOUNTS.map((account) => account.systemKey);
  const existing = new Map(
    (
      await database
        .select({ id: accounts.id, systemKey: accounts.systemKey })
        .from(accounts)
        .where(inArray(accounts.systemKey, keys))
    ).map((row) => [row.systemKey!, row.id]),
  );
  if (existing.size === keys.length) return 0;
  return database.transaction(async (tx) => {
    let added = 0;
    // Headings come first in DEFAULT_ACCOUNTS, so each parent exists (or was
    // just added) by the time its children are.
    for (const account of DEFAULT_ACCOUNTS) {
      if (existing.has(account.systemKey)) continue;
      const [row] = await tx
        .insert(accounts)
        .values({
          code: account.code,
          name: account.name,
          accountType: account.accountType,
          parentId: account.parentKey
            ? (existing.get(account.parentKey) ?? null)
            : null,
          currency: account.currency,
          isPostable: account.isPostable,
          systemKey: account.systemKey,
        })
        .onConflictDoNothing()
        .returning({ id: accounts.id });
      if (row) {
        existing.set(account.systemKey, row.id);
        added++;
        continue;
      }
      // Another process added it meanwhile, or an office account holds its
      // code: the ledger then reports the missing system account by name.
      const [found] = await tx
        .select({ id: accounts.id })
        .from(accounts)
        .where(eq(accounts.systemKey, account.systemKey));
      if (found) existing.set(account.systemKey, found.id);
      else
        console.warn(
          `Default account ${account.systemKey} not added: code ${account.code} is taken.`,
        );
    }
    return added;
  });
}
