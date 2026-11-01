<script setup lang="ts">
import { computed, nextTick, onMounted, ref, useTemplateRef, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import AppPage from "../components/app/AppPage.vue";
import MoneyStrip, {
  type MoneyCell,
} from "../components/shared/MoneyStrip.vue";
import MoneyFlow from "../components/accounting/MoneyFlow.vue";
import VoucherList from "../components/accounting/VoucherList.vue";
import CommissionList from "../components/accounting/CommissionList.vue";
import PayableShares from "../components/accounting/PayableShares.vue";
import VoucherDialog from "../components/accounting/VoucherDialog.vue";
import ExpenseCategoriesDialog from "../components/accounting/ExpenseCategoriesDialog.vue";
import { useAccountingSummary } from "../composables/useAccountingSummary";
import { usePermissions } from "../composables/usePermissions";
import { useRefresh } from "../composables/useRefresh";
import { useNewFromQuery } from "../composables/useNewFromQuery";
import { useSnackbar } from "../composables/useSnackbar";
import { voucherKindLabel } from "../constants/accounting";
import {
  commissionCollection,
  sharePayment,
} from "../utils/commissionVouchers";
import { formatAmount, formatNumber } from "../utils/format";
import { PERIOD_PRESETS, periodRange, type PeriodKey } from "../utils/periods";
import type {
  CommissionRecord,
  CommissionSplitRecord,
  VoucherDetail,
  VoucherKind,
  VoucherPayload,
} from "../types";

/**
 * الحسابات: مساحة واحدة لصاحب المكتب تجيب أولاً عن ثلاثة أسئلة: كم في
 * الصناديق الآن، وكم بقي له من عمولات لم يقبضها، ومن أين جاء المال وأين صُرف.
 * تحتها الحركات المالية (السندات) والعمولات وحصص الموظفين في لوح واحد، وأوامر
 * القبض والمصروف وتسديد العمولة ظاهرة دائماً. الأرقام كلها من الخادم لكل عملة
 * (useAccountingSummary)؛ التفاصيل المحاسبية (الصناديق، القيود، الدليل) عند
 * الطلب من «عرض التفاصيل».
 */
const route = useRoute();
const router = useRouter();
const { can } = usePermissions();
const { setRefreshHandler } = useRefresh();
const { notifySuccess } = useSnackbar();

// ─── الفترة ─────────────────────────────────────────────────────────────
const PERIOD_KEY = "dalaly.accounting.period.v1";
function savedPeriod(): PeriodKey {
  try {
    const value = localStorage.getItem(PERIOD_KEY);
    return PERIOD_PRESETS.some((item) => item.value === value)
      ? (value as PeriodKey)
      : "month";
  } catch {
    return "month";
  }
}
const periodKey = ref<PeriodKey>(savedPeriod());
watch(periodKey, (value) => {
  try {
    localStorage.setItem(PERIOD_KEY, value);
  } catch {
    // التفضيل يبقى لهذه الجلسة فقط.
  }
});
const period = computed(() => periodRange(periodKey.value));
const periodLabel = computed(
  () => PERIOD_PRESETS.find((item) => item.value === periodKey.value)!.title,
);

const summary = useAccountingSummary(period);
const countNote = (counts: number[], noun: string) =>
  counts.length
    ? counts.map((count) => `${formatNumber(count, 0)} ${noun}`).join(" · ")
    : `لا ${noun}`;
const cells = computed<MoneyCell[]>(() => [
  {
    key: "balance",
    label: "صافي الرصيد",
    values: summary.balance.value,
    note: summary.clientFunds.value.some(
      (row) => !/^-?0+(\.0+)?$/.test(row.amount),
    )
      ? "في الصناديق والمصارف، ويشمل أمانات الزبائن"
      : "في الصناديق والمصارف",
  },
  {
    key: "outstanding",
    label: "العمولات المتبقية",
    values: summary.outstanding.value,
    note: `حتى اليوم · ${countNote(summary.openCount.value, "عمولة لم تُقبض كلها")}`,
    tone: "warning",
    action: can("commissions.read"),
  },
  {
    key: "collected",
    label: "العمولات المقبوضة",
    values: summary.collected.value,
    note: `من عمولات ${periodLabel.value}`,
    action: can("commissions.read"),
  },
  {
    key: "recorded",
    label: "إجمالي العمولات",
    values: summary.recorded.value,
    note: `${periodLabel.value} · ${countNote(summary.recordedCount.value, "عمولة")}`,
    action: can("commissions.read"),
  },
  {
    key: "expenses",
    label: "المصروفات",
    values: summary.expenses.value,
    note: periodLabel.value,
    action: can("vouchers.read"),
  },
]);
/** Client funds held, shown under the balance: they belong to customers. */
const heldNote = computed(() =>
  summary.clientFunds.value.filter((row) => !/^-?0+(\.0+)?$/.test(row.amount)),
);

// ─── القوائم ────────────────────────────────────────────────────────────
type View = "vouchers" | "commissions" | "shares";
const views = computed(() =>
  [
    {
      value: "vouchers" as View,
      title: "الحركات المالية",
      icon: "mdi-swap-vertical",
      show: can("vouchers.read"),
    },
    {
      value: "commissions" as View,
      title: "العمولات",
      icon: "mdi-percent-circle-outline",
      show: can("commissions.read"),
    },
    {
      value: "shares" as View,
      title: "حصص الموظفين",
      icon: "mdi-account-cash-outline",
      show: can("commissions.read"),
    },
  ].filter((item) => item.show),
);
const queryView = route.query.view;
const view = ref<View | null>(
  views.value.find((item) => item.value === queryView)?.value ??
    (route.query.state ? "commissions" : null) ??
    views.value[0]?.value ??
    null,
);
// ?state=open من لوحة التحكم ورابط «العمولات» القديم.
const initialState =
  route.query.state === "open" ||
  route.query.state === "settled" ||
  route.query.state === "cancelled"
    ? route.query.state
    : null;
// القائمة المعروضة في العنوان، فيعود إليها الرجوع من سند أو عمولة. لا يُستبدل
// العنوان عند الفتح: ذلك يلغي التحويل من الروابط القديمة.
watch(view, (value) => {
  if (value && value !== route.query.view)
    void router.replace({ query: { ...route.query, view: value } });
});

const voucherList = useTemplateRef<{ reload: () => Promise<void> }>(
  "voucherList",
);
const commissionList = useTemplateRef<{
  reload: () => Promise<void>;
  showOutstanding: () => void;
}>("commissionList");
const shareList = useTemplateRef<{ reload: () => Promise<void> }>("shareList");

/** «تسديد عمولة» and the outstanding card: the commissions still owed. */
async function showOutstanding() {
  if (!can("commissions.read")) return;
  view.value = "commissions";
  await nextTick();
  commissionList.value?.showOutstanding();
  document
    .querySelector<HTMLInputElement>(".acc__list .dal-toolbar__search input")
    ?.focus();
}
function onCell(key: string) {
  if (key === "outstanding") void showOutstanding();
  else if (key === "collected" || key === "recorded") {
    view.value = "commissions";
  } else if (key === "expenses") view.value = "vouchers";
}

// ─── السندات ────────────────────────────────────────────────────────────
const dialog = ref(false);
const dialogKind = ref<VoucherKind>("receipt");
const dialogPreset = ref<Partial<VoucherPayload> | null>(null);
const dialogNote = ref<string | null>(null);
function openVoucher(
  kind: VoucherKind,
  preset: Partial<VoucherPayload> | null = null,
  note: string | null = null,
) {
  dialogKind.value = kind;
  dialogPreset.value = preset;
  dialogNote.value = note;
  dialog.value = true;
}
const openReceipt = () => openVoucher("receipt");
const openExpense = () => openVoucher("payment", { purpose: "expense" });
function collect(commission: CommissionRecord) {
  const { preset, note } = commissionCollection(commission);
  openVoucher("receipt", preset, note);
}
function pay(share: CommissionSplitRecord) {
  const { preset, note } = sharePayment(share);
  openVoucher("payment", preset, note);
}
// يبقى المستخدم هنا ليسجّل غيره، والسند على بعد نقرة للطباعة.
function onIssued(voucher: VoucherDetail) {
  notifySuccess(`صدر ${voucherKindLabel(voucher.kind)} ${voucher.code}.`, {
    label: "فتح السند للطباعة",
    run: () => void router.push(`/accounting/vouchers/${voucher.id}`),
  });
  void reload();
}

const categoriesDialog = ref(false);

useNewFromQuery((value) => {
  if (value === "receipt" && can("vouchers.receipt")) openReceipt();
  else if (value === "expense" && can("vouchers.payment")) openExpense();
  else if (value === "payment" && can("vouchers.payment"))
    openVoucher("payment");
  else if (value === "commission") void showOutstanding();
});

async function reload() {
  await Promise.all([
    summary.load(),
    voucherList.value?.reload(),
    commissionList.value?.reload(),
    shareList.value?.reload(),
  ]);
}
onMounted(() => setRefreshHandler(reload));

// «عرض التفاصيل»: ما يحتاجه المحاسب لا صاحب المكتب كل يوم.
const details = computed(() =>
  [
    {
      title: "سند صرف (أمانة، دين، سحب، حصة…)",
      icon: "mdi-cash-refund",
      run: () => openVoucher("payment"),
      show: can("vouchers.payment"),
    },
    {
      title: "تصنيفات المصروفات",
      icon: "mdi-shape-outline",
      run: () => (categoriesDialog.value = true),
      show: can("vouchers.read"),
    },
    {
      title: "الصناديق والمصارف والتحويلات",
      icon: "mdi-safe-square-outline",
      to: "/accounting/cash",
      show: can("cash.read"),
    },
    {
      title: "القيود",
      icon: "mdi-book-open-variant",
      to: "/accounting/journal",
      show: can("accounting.read"),
    },
    {
      title: "دليل الحسابات",
      icon: "mdi-file-tree-outline",
      to: "/accounting/accounts",
      show: can("accounting.read"),
    },
    {
      title: "التقارير المالية",
      icon: "mdi-chart-box-outline",
      to: `/reports?report=income-statement&from=${period.value.from}&to=${period.value.to}`,
      show: can("reports.financial"),
    },
  ].filter((item) => item.show),
);
</script>

<template>
  <AppPage title="الحسابات">
    <template #header-actions>
      <v-btn
        v-if="can('vouchers.payment')"
        variant="tonal"
        prepend-icon="mdi-cash-minus"
        @click="openExpense"
        >تسجيل مصروف</v-btn
      >
      <v-btn
        v-if="can('vouchers.receipt') && can('commissions.read')"
        variant="tonal"
        prepend-icon="mdi-percent-circle-outline"
        @click="showOutstanding"
        >تسديد عمولة</v-btn
      >
      <v-btn
        v-if="can('vouchers.receipt')"
        color="primary"
        variant="flat"
        prepend-icon="mdi-cash-plus"
        @click="openReceipt"
        >تسجيل قبض</v-btn
      >
      <v-menu v-if="details.length" location="bottom end">
        <template #activator="{ props: menu }">
          <v-btn
            v-bind="menu"
            variant="text"
            prepend-icon="mdi-text-box-search-outline"
            append-icon="mdi-chevron-down"
            >عرض التفاصيل</v-btn
          >
        </template>
        <v-list density="compact" min-width="260" aria-label="التفاصيل">
          <v-list-item
            v-for="item in details"
            :key="item.title"
            :title="item.title"
            :prepend-icon="item.icon"
            :to="item.to"
            @click="item.run?.()"
          />
        </v-list>
      </v-menu>
    </template>

    <div class="acc">
      <template v-if="summary.available.value">
        <div class="acc__period">
          <v-btn-toggle
            v-model="periodKey"
            mandatory
            divided
            density="compact"
            variant="outlined"
            color="primary"
            aria-label="فترة الأرقام"
          >
            <v-btn
              v-for="item in PERIOD_PRESETS"
              :key="item.value"
              :value="item.value"
              >{{ item.title }}</v-btn
            >
          </v-btn-toggle>
          <span class="acc__hint"
            >كل مبلغ بعملته، ولا يُجمع الدينار إلى الدولار.</span
          >
        </div>
        <MoneyStrip
          :cells="cells"
          :loading="summary.loading.value"
          label="ملخّص المال"
          @select="onCell"
        />
        <p v-if="heldNote.length" class="acc__held">
          من الرصيد أمانات للزبائن (عربون أو إيجار أو ثمن يُسلَّم لأصحابه):
          <template v-for="(row, index) in heldNote" :key="row.currency">
            <template v-if="index"> · </template>
            <bdi>{{ formatAmount(row.amount, row.currency) }}</bdi>
          </template>
        </p>
        <v-alert
          v-if="summary.error.value"
          type="error"
          variant="tonal"
          density="compact"
        >
          تعذّر تحميل الأرقام: {{ summary.error.value }}
          <template #append>
            <v-btn variant="text" size="small" @click="summary.load()"
              >إعادة المحاولة</v-btn
            >
          </template>
        </v-alert>
        <v-alert
          v-if="summary.truncated.value"
          type="warning"
          variant="tonal"
          density="compact"
          >أرقام العمولات تشمل أول 2000 عمولة في الفترة فقط؛ اختر فترة
          أقصر.</v-alert
        >
      </template>

      <div class="acc__body">
        <section
          v-if="view"
          class="dal-panel dal-listpanel acc__list"
          aria-label="الحركات والعمولات"
        >
          <v-tabs
            v-model="view"
            class="dal-panel__tabs"
            density="compact"
            color="primary"
            aria-label="القائمة"
          >
            <v-tab
              v-for="item in views"
              :key="item.value"
              :value="item.value"
              :prepend-icon="item.icon"
              >{{ item.title }}</v-tab
            >
          </v-tabs>
          <VoucherList v-if="view === 'vouchers'" ref="voucherList" />
          <CommissionList
            v-else-if="view === 'commissions'"
            ref="commissionList"
            :initial-state="initialState"
            @collect="collect"
          />
          <PayableShares v-else ref="shareList" @pay="pay" />
        </section>
        <v-alert v-else type="info" variant="tonal">
          قائمة الحركات والعمولات تحتاج صلاحية عرض السندات أو العمولات. تجد ما
          تسمح به صلاحياتك في «عرض التفاصيل».
        </v-alert>

        <MoneyFlow
          v-if="summary.available.value"
          class="acc__flow"
          :flows="summary.flows.value"
          :expense-categories="summary.expenseCategories.value"
          :loading="summary.loading.value"
          :period-label="periodLabel"
        />
      </div>
    </div>

    <VoucherDialog
      v-model="dialog"
      :kind="dialogKind"
      :preset="dialogPreset"
      :allocation-note="dialogNote"
      @saved="onIssued"
    />
    <ExpenseCategoriesDialog v-model="categoriesDialog" />
  </AppPage>
</template>

<style scoped>
.acc {
  display: grid;
  gap: var(--dal-gutter);
  container-type: inline-size;
  container-name: acc;
}
.acc__period {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 12px;
}
.acc__hint,
.acc__held {
  font-size: calc(12px * var(--dal-font-scale));
  color: var(--dal-muted);
}
.acc__held {
  margin: calc(-1 * var(--dal-gutter) / 2) 0 0;
}
.acc__body {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 340px;
  gap: var(--dal-gutter);
  align-items: start;
}
/* القائمة بارتفاع مساحة العمل: الجدول يتمرّر داخلها وتذييله ظاهر. */
.acc__list {
  height: calc(100dvh - var(--dal-bar-height) - 2 * var(--dal-gutter));
  min-height: 420px;
}
/* الجدول أولاً: بجانبه لوح «من أين جاء المال» حين يتّسع لعموده (1920px)، وتحته
   في الشاشات الأصغر (1366px) فلا تُخفى أعمدة الجدول. */
@container acc (max-width: 1240px) {
  .acc__body {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
