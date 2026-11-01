import {
  computed,
  ref,
  shallowRef,
  toValue,
  watch,
  type MaybeRefOrGetter,
} from "vue";
import * as reportsService from "../services/reports.service";
import * as dashboardService from "../services/dashboard.service";
import { getErrorMessage } from "../services/api.service";
import { usePermissions } from "./usePermissions";
import type {
  BusinessSummary,
  CashFlowReport,
  CommissionsReport,
  Currency,
  IncomeStatementReport,
  PayablesReport,
} from "../types";

/** An amount the server computed, in one currency. */
export type CurrencyAmount = { currency: Currency; amount: string };

/**
 * أرقام صفحة الحسابات كما يحسبها الخادم، لكل عملة على حدة، بلا أي جمع أو
 * طرح هنا:
 * - الرصيد في الصناديق والمصارف آخر الفترة: closing في التدفق النقدي؛
 * - أمانات الزبائن فيه: client_funds في الذمم الدائنة؛
 * - العمولات المتبقية الآن (كل العمولات، لا عمولات الفترة وحدها):
 *   commissions_outstanding في ملخّص لوحة التحكم؛
 * - إجمالي عمولات الفترة والمقبوض منها: تقرير العمولات؛
 * - مصروفات الفترة وصافي ربحها: الإيرادات والمصروفات؛
 * - من أين جاء المال وأين صُرف: فئات التدفق النقدي وتصنيفات المصروفات.
 * كلها تحتاج reports.financial؛ بدونها لا تُطلب.
 */
export function useAccountingSummary(
  period: MaybeRefOrGetter<{ from: string; to: string }>,
) {
  const { can } = usePermissions();
  const available = computed(() => can("reports.financial"));

  const loading = ref(false);
  const error = ref<string | null>(null);
  const cashFlow = shallowRef<CashFlowReport | null>(null);
  const payables = shallowRef<PayablesReport | null>(null);
  const commissions = shallowRef<CommissionsReport | null>(null);
  const income = shallowRef<IncomeStatementReport | null>(null);
  const business = shallowRef<BusinessSummary["money"]>(null);

  let request = 0;
  async function load() {
    if (!available.value) return;
    const current = ++request;
    const { from, to } = toValue(period);
    loading.value = true;
    error.value = null;
    try {
      const [flow, held, recorded, statement, summary] = await Promise.all([
        reportsService.getCashFlow({ from, to }),
        reportsService.getPayables({ as_of: to }),
        reportsService.getCommissionsReport({ from, to }),
        reportsService.getIncomeStatement({ from, to }),
        dashboardService.fetchBusinessSummary(),
      ]);
      if (current !== request) return;
      cashFlow.value = flow;
      payables.value = held;
      commissions.value = recorded;
      income.value = statement;
      business.value = summary.money;
    } catch (cause) {
      if (current === request) error.value = getErrorMessage(cause);
    } finally {
      if (current === request) loading.value = false;
    }
  }
  watch(() => toValue(period), load, { immediate: true, deep: true });

  const pick = <T extends { currency: Currency }>(
    rows: T[] | undefined,
    value: (row: T) => string,
  ): CurrencyAmount[] =>
    (rows ?? []).map((row) => ({ currency: row.currency, amount: value(row) }));

  const balance = computed(() =>
    pick(cashFlow.value?.sections, (section) => section.totals.closing),
  );
  const clientFunds = computed(() =>
    pick(payables.value?.sections, (section) => section.totals.client_funds),
  );
  const outstanding = computed(() =>
    pick(business.value?.currencies, (row) => row.commissions_outstanding),
  );
  /** Commissions not collected in full, now; per currency. */
  const openCount = computed(() =>
    (business.value?.currencies ?? []).map((row) => row.commissions_open),
  );
  const recorded = computed(() =>
    pick(commissions.value?.sections, (section) => section.totals.recorded),
  );
  const recordedCount = computed(() =>
    (commissions.value?.sections ?? []).map((section) => section.totals.count),
  );
  const collected = computed(() =>
    pick(commissions.value?.sections, (section) => section.totals.collected),
  );
  const expenses = computed(() =>
    pick(income.value?.sections, (section) => section.totals.expenses),
  );
  const net = computed(() =>
    pick(income.value?.sections, (section) => section.totals.net),
  );
  /** Where the money came from and went, per currency (cash-flow categories). */
  const flows = computed(() => cashFlow.value?.sections ?? []);
  /** Expenses paid by voucher, by category, per currency. */
  const expenseCategories = computed(() =>
    (income.value?.sections ?? []).map((section) => ({
      currency: section.currency,
      rows: section.expense_categories,
    })),
  );
  const truncated = computed(() => Boolean(commissions.value?.truncated));

  return {
    available,
    loading,
    error,
    load,
    balance,
    clientFunds,
    outstanding,
    openCount,
    recorded,
    recordedCount,
    collected,
    expenses,
    net,
    flows,
    expenseCategories,
    truncated,
  };
}
