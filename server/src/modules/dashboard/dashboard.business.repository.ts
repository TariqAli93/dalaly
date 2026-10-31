import { sql } from "drizzle-orm";
import { rawRows } from "../../infrastructure/database/raw-query.js";
import { CURRENCIES, type Currency } from "../../shared/money.js";
import type { AuthUser } from "../auth/auth.service.js";
import { listOverdueInstallments } from "../leases/leases.repository.js";
import { uncontactedCustomers } from "../reports/operations.repository.js";
import { incomeStatement } from "../reports/reports.repository.js";
import { officeToday } from "../reports/reports.rules.js";
import { listTasksPage } from "../tasks/tasks.repository.js";
import { inParallel, QUERY_WIDTH } from "./dashboard.repository.js";
import { taskPageQuerySchema } from "../tasks/tasks.schema.js";

/**
 * The dashboard's business summary: what needs doing today and what is
 * slipping, across tasks, deals, customers, leases and money. Each section
 * follows its domain's read permission and is null without it; its figures
 * reuse the definitions of the tasks list, the operational reports and the
 * financial reports, so a figure here and the page it opens agree.
 * docs/OPERATIONS_DASHBOARD.md, "Business summary".
 */

export interface BusinessAccess {
  /** Any follow-up read permission: the tasks list reads what it may. */
  tasks: boolean;
  deals: boolean;
  people: boolean;
  requests: boolean;
  leases: boolean;
  /** reports.financial: the month's money. */
  money: boolean;
}

/** A deal is stalled when its stage has not moved for this many days. */
export const STALLED_DAYS = 14;
/** Deals won within this many days are recent. */
export const RECENT_DAYS = 30;
/** Customers with something open and no contact for this many days. */
export const CONTACT_DAYS = 30;
/** Leases whose last day is within this many days. */
export const EXPIRING_DAYS = 30;

/** Open deals from negotiation on: the active negotiations. */
const NEGOTIATING = ["negotiating", "agreed", "contract_preparation", "contract_issued"];

const count = (value: unknown) => Number(value ?? 0);
const text = (value: unknown) => (value as string | null) ?? null;

async function tasks(user: AuthUser, limit: number) {
  const page = (due: "today" | "week" | "overdue") =>
    listTasksPage(
      taskPageQuerySchema.parse({
        page: 1,
        page_size: limit,
        status: "open",
        due,
        sort_by: "scheduled_at",
        sort_order: "asc",
      }),
      user,
    );
  // One query at a time: the sections run two at a time (QUERY_WIDTH).
  const today = await page("today");
  const week = await page("week");
  const overdue = await page("overdue");
  const shape = (result: Awaited<ReturnType<typeof page>>) => ({
    total: result.total,
    items: result.items,
  });
  return { today: shape(today), week: shape(week), overdue: shape(overdue) };
}

const DEAL_ROW = sql`d.id, d.code, d.title, d.deal_type, d.stage, d.currency, d.agreed_price::text,
  d.client_person_id, p.full_name AS client_name, u.display_name AS user_name,
  d.stage_changed_at, d.closed_at, count(*) OVER () AS total`;
const DEAL_FROM = sql`FROM deals d
  LEFT JOIN people p ON p.id = d.client_person_id
  LEFT JOIN users u ON u.id = d.assigned_user_id`;
const OPEN = sql`d.stage NOT IN ('won', 'lost', 'cancelled')`;

function dealRows(rows: Awaited<ReturnType<typeof rawRows>>) {
  return {
    total: count(rows[0]?.total),
    items: rows.map((row) => ({
      id: Number(row.id),
      code: row.code as string,
      title: text(row.title),
      deal_type: row.deal_type as string,
      stage: row.stage as string,
      currency: row.currency as Currency,
      agreed_price: text(row.agreed_price),
      client_person_id:
        row.client_person_id === null ? null : Number(row.client_person_id),
      client_name: text(row.client_name),
      user_name: text(row.user_name),
      stage_changed_at: row.stage_changed_at as Date,
      closed_at: (row.closed_at as Date | null) ?? null,
    })),
  };
}

async function deals(limit: number) {
  const stages = sql.join(
    NEGOTIATING.map((stage) => sql`${stage}`),
    sql`, `,
  );
  const negotiating = await rawRows(sql`SELECT ${DEAL_ROW} ${DEAL_FROM}
    WHERE d.stage IN (${stages})
    ORDER BY d.stage_changed_at DESC, d.id DESC LIMIT ${limit}`);
  const stalled = await rawRows(sql`SELECT ${DEAL_ROW} ${DEAL_FROM}
    WHERE ${OPEN} AND d.stage_changed_at < now() - make_interval(days => ${STALLED_DAYS})
    ORDER BY d.stage_changed_at, d.id LIMIT ${limit}`);
  const won = await rawRows(sql`SELECT ${DEAL_ROW} ${DEAL_FROM}
    WHERE d.stage = 'won' AND d.closed_at >= now() - make_interval(days => ${RECENT_DAYS})
    ORDER BY d.closed_at DESC, d.id DESC LIMIT ${limit}`);
  return {
    stalled_days: STALLED_DAYS,
    recent_days: RECENT_DAYS,
    negotiating: dealRows(negotiating),
    stalled: dealRows(stalled),
    recently_won: dealRows(won),
  };
}

async function leases(limit: number) {
  const today = officeToday();
  const expiring = await rawRows(sql`SELECT l.id, l.code, l.currency, l.rent_amount::text, l.frequency,
        l.end_date::text, (l.end_date - ${today}::date) AS days_left,
        l.tenant_person_id, t.full_name AS tenant_name, count(*) OVER () AS total
      FROM leases l LEFT JOIN people t ON t.id = l.tenant_person_id
      WHERE l.status = 'active'
        AND l.end_date BETWEEN ${today}::date AND ${today}::date + ${EXPIRING_DAYS}::int
      ORDER BY l.end_date, l.id LIMIT ${limit}`);
  // The overdue installments of leases/installments/overdue, per currency.
  const overdueTotals = await rawRows(sql`SELECT l.currency, count(*)::int AS installments,
        sum(i.amount - least(p.paid, i.amount))::numeric(18,2)::text AS left
      FROM lease_installments i
      JOIN leases l ON l.id = i.lease_id
      CROSS JOIN LATERAL (SELECT coalesce(sum(v.amount), 0) AS paid FROM vouchers v
        WHERE v.lease_installment_id = i.id AND v.status = 'posted') p
      WHERE l.office_collects AND l.status IN ('active', 'terminated', 'renewed')
        AND i.due_date < ${today}
        AND NOT (l.status = 'terminated' AND i.due_date > l.termination_date)
        AND p.paid < i.amount
      GROUP BY l.currency ORDER BY l.currency`);
  const overdue = await listOverdueInstallments({
    page: 1,
    page_size: limit,
    sort_order: "asc",
  });
  return {
    expiring_days: EXPIRING_DAYS,
    expiring: {
      total: count(expiring[0]?.total),
      items: expiring.map((row) => ({
        id: Number(row.id),
        code: row.code as string,
        currency: row.currency as Currency,
        rent_amount: row.rent_amount as string,
        frequency: row.frequency as string,
        end_date: row.end_date as string,
        days_left: count(row.days_left),
        tenant_person_id:
          row.tenant_person_id === null ? null : Number(row.tenant_person_id),
        tenant_name: text(row.tenant_name),
      })),
    },
    overdue: {
      total: overdueTotals.reduce((sum, row) => sum + count(row.installments), 0),
      by_currency: overdueTotals.map((row) => ({
        currency: row.currency as Currency,
        installments: count(row.installments),
        left: row.left as string,
      })),
      items: overdue.items,
    },
  };
}

/**
 * This month's money, per currency: commissions collected (receipts
 * allocated to commissions dated this month), commissions outstanding now
 * (active commissions less what was collected on them), and the income
 * statement's revenue, expenses and net for the month to date.
 */
async function money() {
  const today = officeToday();
  const from = `${today.slice(0, 8)}01`;
  const collected = await rawRows(sql`SELECT currency, sum(amount)::numeric(18,2)::text AS amount
      FROM vouchers
      WHERE commission_id IS NOT NULL AND kind = 'receipt' AND status = 'posted'
        AND voucher_date BETWEEN ${from} AND ${today}
      GROUP BY currency`);
  const outstanding = await rawRows(sql`SELECT c.currency, count(*) FILTER (WHERE c.amount > x.collected)::int AS commissions,
        sum(greatest(c.amount - x.collected, 0))::numeric(18,2)::text AS amount
      FROM commissions c
      CROSS JOIN LATERAL (SELECT coalesce(sum(v.amount), 0) AS collected FROM vouchers v
        WHERE v.commission_id = c.id AND v.status = 'posted') x
      WHERE c.status = 'active'
      GROUP BY c.currency`);
  const statement = await incomeStatement({ from, to: today, group: "none" });
  const present = new Set([
    ...collected.map((row) => row.currency as string),
    ...outstanding.map((row) => row.currency as string),
    ...statement.sections.map((section) => section.currency as string),
  ]);
  return {
    from,
    to: today,
    currencies: CURRENCIES.filter((currency) => present.has(currency)).map(
      (currency) => {
        const totals = statement.sections.find(
          (section) => section.currency === currency,
        )?.totals;
        const owed = outstanding.find((row) => row.currency === currency);
        return {
          currency,
          commissions_collected:
            (collected.find((row) => row.currency === currency)
              ?.amount as string) ?? "0.00",
          commissions_outstanding: (owed?.amount as string) ?? "0.00",
          commissions_open: count(owed?.commissions),
          revenue: totals?.revenue ?? "0.00",
          expenses: totals?.expenses ?? "0.00",
          net: totals?.net ?? "0.00",
        };
      },
    ),
  };
}

/** The business summary, `limit` records per list. */
export async function businessSummary(
  user: AuthUser,
  access: BusinessAccess,
  limit = 5,
) {
  // Two sections at a time, each one query at a time: every running query
  // holds a pool connection (docs/ARCHITECTURE.md, the dashboard summary).
  const {
    taskSection,
    dealSection,
    customers,
    leaseSection,
    moneySection,
  } = await inParallel(QUERY_WIDTH, {
    taskSection: async () => (access.tasks ? tasks(user, limit) : null),
    dealSection: async () => (access.deals ? deals(limit) : null),
    customers: async () =>
      access.people
        ? uncontactedCustomers({
            to: officeToday(),
            days: CONTACT_DAYS,
            requests: access.requests,
            limit,
          })
        : null,
    leaseSection: async () => (access.leases ? leases(limit) : null),
    moneySection: async () => (access.money ? money() : null),
  });
  return {
    generated_at: new Date(),
    tasks: taskSection,
    deals: dealSection,
    customers: customers
      ? { contact_days: CONTACT_DAYS, needing_contact: customers }
      : null,
    leases: leaseSection,
    money: moneySection,
  };
}

/**
 * The notification center: how many of each thing needs attention, from
 * the same definitions, without the records. Only what has a count.
 */
export async function businessAlerts(user: AuthUser, access: BusinessAccess) {
  // No alert reads the month's money: leave it out.
  const summary = await businessSummary(user, { ...access, money: false }, 1);
  const alerts = [
    {
      key: "tasks_overdue",
      severity: "error",
      count: summary.tasks?.overdue.total ?? 0,
    },
    {
      key: "installments_overdue",
      severity: "error",
      count: summary.leases?.overdue.total ?? 0,
    },
    {
      key: "tasks_today",
      severity: "info",
      count: summary.tasks?.today.total ?? 0,
    },
    {
      key: "deals_stalled",
      severity: "warning",
      count: summary.deals?.stalled.total ?? 0,
    },
    {
      key: "leases_expiring",
      severity: "warning",
      count: summary.leases?.expiring.total ?? 0,
    },
    {
      key: "customers_needing_contact",
      severity: "info",
      count: summary.customers?.needing_contact.total ?? 0,
    },
  ] as const;
  return {
    generated_at: summary.generated_at,
    alerts: alerts.filter((alert) => alert.count > 0),
  };
}
