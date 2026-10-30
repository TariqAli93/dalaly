<script setup lang="ts">
import { computed, ref, watch } from "vue";
import VoucherDialog from "../accounting/VoucherDialog.vue";
import * as financeService from "../../services/finance.service";
import * as vouchersService from "../../services/vouchers.service";
import { getErrorMessage } from "../../services/api.service";
import { usePermissions } from "../../composables/usePermissions";
import { useSnackbar } from "../../composables/useSnackbar";
import {
  voucherKindLabel,
  voucherPurposeLabel,
} from "../../constants/accounting";
import { dealPartyLabels } from "../../constants/deals";
import { formatAmount, formatDate } from "../../utils/format";
import type {
  DealFinance,
  DealRecord,
  VoucherDetail,
  VoucherKind,
  VoucherPayload,
  VoucherRecord,
} from "../../types";

/**
 * مال الصفقة من القيود المرحَّلة: عمولة المكتب وما حُصِّل منها، والأمانات
 * المحفوظة للبائع أو المؤجر (ليست إيراداً)، وصافي المكتب: إيراده ناقص ما
 * صُرف على الصفقة. ثمن العقار لا يدخل فيه. بجانبها شروط العقد المالية
 * وآخر السندات، وأزرار قبض الأمانة وتسليمها والمصروف على الصفقة.
 */
const props = defineProps<{ deal: DealRecord }>();
const { can } = usePermissions();
const { notifySuccess } = useSnackbar();

const finance = ref<DealFinance | null>(null);
const vouchers = ref<VoucherRecord[]>([]);
const voucherTotal = ref(0);
const loading = ref(false);
const error = ref<string | null>(null);

async function load() {
  loading.value = true;
  error.value = null;
  try {
    const [money, page] = await Promise.all([
      financeService.getDealFinance(props.deal.id),
      vouchersService.listVouchersPage(
        { deal_id: props.deal.id },
        { page: 1, page_size: 8, sort_by: "voucher_date", sort_order: "desc" },
      ),
    ]);
    finance.value = money;
    vouchers.value = page.items;
    voucherTotal.value = page.total;
  } catch (cause) {
    error.value = getErrorMessage(cause);
  } finally {
    loading.value = false;
  }
}
watch(() => props.deal.id, load, { immediate: true });
defineExpose({ reload: load });

const parties = computed(() => dealPartyLabels(props.deal.deal_type));
const open = computed(() => !["lost", "cancelled"].includes(props.deal.stage));
const zero = (value: string) => /^-?0(\.0+)?$/.test(value);
const heldIn = computed(
  () =>
    finance.value?.totals.find((row) => row.currency === props.deal.currency)
      ?.client_funds_held ?? "0.00",
);
/** The contract's commission when it differs from what is recorded. */
const contractGap = computed(() => {
  const contract = finance.value?.contract;
  const totals = finance.value?.totals.find(
    (row) => row.currency === contract?.currency,
  );
  if (!contract?.commission || !totals || zero(totals.commission_recorded))
    return false;
  return contract.commission !== totals.commission_recorded;
});

const dialog = ref(false);
const dialogKind = ref<VoucherKind>("receipt");
const preset = ref<Partial<VoucherPayload> | null>(null);
const note = ref("");
const ownerName = computed(() => props.deal.owner_name ?? parties.value.owner);

function receiveFunds() {
  dialogKind.value = "receipt";
  preset.value = {
    purpose: "client_funds",
    currency: props.deal.currency,
    person_id: props.deal.client_person_id,
    held_for_person_id: props.deal.owner_person_id,
    deal_id: props.deal.id,
    description: `أمانة على الصفقة ${props.deal.code}`,
  };
  note.value = props.deal.owner_person_id
    ? `على الصفقة ${props.deal.code}: تُحفظ لحساب ${ownerName.value}، وليست إيراداً للمكتب.`
    : `لا ${parties.value.owner} في الصفقة ${props.deal.code} بعد: تُحفظ الأمانة للدافع ما لم تختر غيره من طرفيها.`;
  dialog.value = true;
}
function handOver() {
  dialogKind.value = "payment";
  preset.value = {
    purpose: "client_funds",
    currency: props.deal.currency,
    person_id: props.deal.owner_person_id,
    held_for_person_id: props.deal.owner_person_id,
    deal_id: props.deal.id,
    amount: zero(heldIn.value) ? "" : heldIn.value,
    description: `تسليم أمانة الصفقة ${props.deal.code}`,
  };
  note.value = `من أمانة ${ownerName.value} على الصفقة ${props.deal.code}؛ المحتفظ به ${formatAmount(heldIn.value, props.deal.currency)}. لإعادة عربون إلى ${parties.value.client} اختره مستلماً.`;
  dialog.value = true;
}
function spend() {
  dialogKind.value = "payment";
  preset.value = {
    purpose: "expense",
    currency: props.deal.currency,
    deal_id: props.deal.id,
    description: `مصروف على الصفقة ${props.deal.code}`,
  };
  note.value = `مصروف على الصفقة ${props.deal.code}: يُنقص صافي المكتب منها.`;
  dialog.value = true;
}
function onIssued(voucher: VoucherDetail) {
  notifySuccess(`صدر ${voucherKindLabel(voucher.kind)} ${voucher.code}.`);
  void load();
}
</script>

<template>
  <section class="dal-panel deal-money" aria-label="مال الصفقة">
    <div class="deal-money__bar">
      <h2 class="deal-money__title">المال</h2>
      <v-spacer />
      <v-btn
        v-if="open && can('vouchers.receipt')"
        variant="text"
        size="small"
        prepend-icon="mdi-cash-plus"
        @click="receiveFunds"
        >قبض أمانة</v-btn
      >
      <v-btn
        v-if="can('vouchers.payment') && !zero(heldIn)"
        variant="text"
        size="small"
        prepend-icon="mdi-cash-fast"
        @click="handOver"
        >تسليم أمانة</v-btn
      >
      <v-btn
        v-if="open && can('vouchers.payment')"
        variant="text"
        size="small"
        prepend-icon="mdi-cash-minus"
        @click="spend"
        >مصروف</v-btn
      >
    </div>
    <v-progress-linear v-if="loading && !finance" indeterminate />
    <v-alert v-else-if="error" type="error" variant="tonal" density="compact">
      {{ error }}
      <template #append>
        <v-btn variant="text" size="small" @click="load">إعادة المحاولة</v-btn>
      </template>
    </v-alert>
    <template v-else-if="finance">
      <div
        v-for="totals in finance.totals"
        :key="totals.currency"
        class="deal-money__block"
      >
        <p v-if="finance.totals.length > 1" class="deal-money__currency">
          {{ totals.currency === "IQD" ? "بالدينار" : "بالدولار" }}
        </p>
        <dl class="deal-money__facts">
          <div>
            <dt>عمولة المكتب</dt>
            <dd>
              <bdi>{{
                formatAmount(totals.commission_recorded, totals.currency)
              }}</bdi>
              <small v-if="totals.expected_commission"
                >المتوقعة
                <bdi>{{
                  formatAmount(totals.expected_commission, totals.currency)
                }}</bdi></small
              >
            </dd>
          </div>
          <div>
            <dt>المتبقي على الزبون</dt>
            <dd
              :class="{
                'text-warning': !zero(totals.commission_outstanding),
              }"
            >
              <bdi>{{
                formatAmount(totals.commission_outstanding, totals.currency)
              }}</bdi>
              <small
                >حُصِّل
                <bdi>{{
                  formatAmount(totals.commission_collected, totals.currency)
                }}</bdi></small
              >
            </dd>
          </div>
          <div v-if="!zero(totals.shares_owed)">
            <dt>حصص الموظفين</dt>
            <dd>
              <bdi>{{ formatAmount(totals.shares_owed, totals.currency) }}</bdi>
              <small
                >المتبقي
                <bdi>{{
                  formatAmount(totals.shares_outstanding, totals.currency)
                }}</bdi></small
              >
            </dd>
          </div>
          <div>
            <dt>أمانات محفوظة</dt>
            <dd>
              <bdi>{{
                formatAmount(totals.client_funds_held, totals.currency)
              }}</bdi>
              <small
                >قُبض
                <bdi>{{
                  formatAmount(totals.client_funds_received, totals.currency)
                }}</bdi>
                · سُلِّم
                <bdi>{{
                  formatAmount(totals.client_funds_paid_out, totals.currency)
                }}</bdi></small
              >
            </dd>
          </div>
          <div>
            <dt>صافي المكتب</dt>
            <dd
              :class="{
                'text-error': totals.net.startsWith('-'),
                'text-success':
                  !totals.net.startsWith('-') && !zero(totals.net),
              }"
            >
              <bdi>{{ formatAmount(totals.net, totals.currency) }}</bdi>
              <small
                >إيراد
                <bdi>{{ formatAmount(totals.income, totals.currency) }}</bdi>
                · مصروفات
                <bdi>{{
                  formatAmount(totals.expenses, totals.currency)
                }}</bdi></small
              >
            </dd>
          </div>
        </dl>
      </div>
      <p v-if="finance.contract" class="deal-money__contract">
        العقد
        <router-link :to="`/contracts/${finance.contract.id}`"
          ><bdi>{{ finance.contract.code }}</bdi></router-link
        >:
        <template v-if="finance.contract.commission">
          العمولة
          <bdi>{{
            formatAmount(finance.contract.commission, finance.contract.currency)
          }}</bdi>
        </template>
        <template v-if="finance.contract.deposit">
          · التأمين
          <bdi>{{
            formatAmount(finance.contract.deposit, finance.contract.currency)
          }}</bdi>
        </template>
        <template v-if="finance.contract.down_payment">
          · الدفعة المقدمة
          <bdi>{{
            formatAmount(
              finance.contract.down_payment,
              finance.contract.currency,
            )
          }}</bdi>
        </template>
        <template
          v-if="
            !finance.contract.commission &&
            !finance.contract.deposit &&
            !finance.contract.down_payment
          "
          >لا شروط مالية فيه بعد.</template
        >
        <span v-if="contractGap" class="text-warning">
          — تختلف عن العمولة المسجلة على الصفقة.</span
        >
      </p>
      <p class="deal-money__note">
        الأمانات مال {{ ownerName }} يحفظه المكتب، وليست إيراداً؛ وثمن العقار لا
        يُحسب إيراداً للمكتب.
      </p>

      <h3 class="deal-money__subtitle">
        السندات
        <span v-if="voucherTotal > vouchers.length" class="text-medium-emphasis"
          >(آخر {{ vouchers.length }} من {{ voucherTotal }})</span
        >
      </h3>
      <p v-if="!vouchers.length" class="deal-money__empty">
        لا سندات على هذه الصفقة.
      </p>
      <ul v-else class="deal-money__vouchers">
        <li v-for="voucher in vouchers" :key="voucher.id">
          <router-link :to="`/accounting/vouchers/${voucher.id}`"
            ><bdi>{{ voucher.code }}</bdi></router-link
          >
          <span class="text-medium-emphasis">{{
            formatDate(voucher.voucher_date)
          }}</span>
          <span class="deal-money__purpose"
            >{{ voucherPurposeLabel(voucher.kind, voucher.purpose) }} ·
            {{ voucher.party_name }}</span
          >
          <v-chip
            v-if="voucher.status === 'voided'"
            size="x-small"
            color="error"
            variant="tonal"
            label
            >ملغى</v-chip
          >
          <bdi
            class="deal-money__amount"
            :class="{
              'text-decoration-line-through': voucher.status === 'voided',
            }"
            >{{ voucher.kind === "payment" ? "−" : "+"
            }}{{ formatAmount(voucher.amount, voucher.currency) }}</bdi
          >
        </li>
      </ul>
    </template>

    <VoucherDialog
      v-model="dialog"
      :kind="dialogKind"
      :preset="preset"
      :allocation-note="note"
      @saved="onIssued"
    />
  </section>
</template>

<style scoped>
.deal-money {
  padding: 12px 16px;
}
.deal-money__bar {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 4px;
}
.deal-money__title {
  margin: 0 0 8px;
  font-size: 0.95rem;
  font-weight: 700;
}
.deal-money__currency {
  margin: 4px 0;
  font-size: 0.8125rem;
  font-weight: 700;
}
.deal-money__facts {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  gap: 10px 16px;
  margin: 0 0 8px;
}
.deal-money__facts dt {
  font-size: 0.75rem;
  color: rgb(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}
.deal-money__facts dd {
  margin: 0;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  display: grid;
}
.deal-money__facts small {
  font-weight: 400;
  font-size: 0.75rem;
  color: rgb(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}
.deal-money__contract,
.deal-money__note,
.deal-money__empty {
  margin: 0 0 6px;
  font-size: 0.8125rem;
}
.deal-money__note,
.deal-money__empty {
  color: rgb(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}
.deal-money__subtitle {
  margin: 10px 0 4px;
  font-size: 0.875rem;
  font-weight: 700;
}
.deal-money__vouchers {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 6px;
  font-size: 0.8125rem;
}
.deal-money__vouchers li {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}
.deal-money__purpose {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.deal-money__amount {
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}
</style>
