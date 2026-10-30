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
import { formatAmount, formatDate } from "../../utils/format";
import type {
  Currency,
  PersonFinance,
  VoucherDetail,
  VoucherKind,
  VoucherPayload,
  VoucherRecord,
} from "../../types";

/**
 * مال الزبون من القيود المرحَّلة: ما عليه للمكتب (عمولات لم تُحصَّل)، وما
 * يحفظه المكتب له من أمانات (إيجار أو عربون قُبض لحسابه)، وعمولاته وسنداته:
 * ما دفعه أو استلمه، وما قُبض أو سُلِّم من أمانته.
 */
const props = defineProps<{ personId: number; personName: string }>();
const { can } = usePermissions();
const { notifySuccess } = useSnackbar();

const finance = ref<PersonFinance | null>(null);
const vouchers = ref<VoucherRecord[]>([]);
const voucherTotal = ref(0);
const loading = ref(false);
const error = ref<string | null>(null);

async function load() {
  loading.value = true;
  error.value = null;
  try {
    const [money, page] = await Promise.all([
      financeService.getPersonFinance(props.personId),
      vouchersService.listVouchersPage(
        { person_id: props.personId },
        { page: 1, page_size: 10, sort_by: "voucher_date", sort_order: "desc" },
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
watch(() => props.personId, load, { immediate: true });

const zero = (value: string) => /^-?0(\.0+)?$/.test(value);
/** The first currency in which the office holds something for them. */
const heldTotals = computed(() =>
  finance.value?.totals.find((row) => !zero(row.client_funds_held)),
);

const dialog = ref(false);
const dialogKind = ref<VoucherKind>("receipt");
const preset = ref<Partial<VoucherPayload> | null>(null);
const note = ref("");
function receive() {
  dialogKind.value = "receipt";
  preset.value = { person_id: props.personId };
  note.value = "";
  dialog.value = true;
}
function handOver() {
  const totals = heldTotals.value;
  if (!totals) return;
  dialogKind.value = "payment";
  preset.value = {
    purpose: "client_funds",
    currency: totals.currency,
    person_id: props.personId,
    held_for_person_id: props.personId,
    amount: totals.client_funds_held,
    description: `تسليم أمانة ${props.personName}`,
  };
  note.value = `من أمانة ${props.personName}؛ المحتفظ به ${formatAmount(totals.client_funds_held, totals.currency)}.`;
  dialog.value = true;
}
function onIssued(voucher: VoucherDetail) {
  notifySuccess(`صدر ${voucherKindLabel(voucher.kind)} ${voucher.code}.`);
  void load();
}
const currencyName = (currency: Currency) =>
  currency === "IQD" ? "بالدينار" : "بالدولار";
</script>

<template>
  <div class="person-money">
    <div class="person-money__bar">
      <v-spacer />
      <v-btn
        v-if="can('vouchers.receipt')"
        variant="text"
        size="small"
        prepend-icon="mdi-cash-plus"
        @click="receive"
        >سند قبض</v-btn
      >
      <v-btn
        v-if="can('vouchers.payment') && heldTotals"
        variant="text"
        size="small"
        prepend-icon="mdi-cash-fast"
        @click="handOver"
        >تسليم أمانة</v-btn
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
      <p v-if="!finance.totals.length" class="person-money__empty">
        لا مال لهذا الزبون مع المكتب: لا عمولة عليه ولا أمانة له.
      </p>
      <div v-for="totals in finance.totals" :key="totals.currency">
        <p v-if="finance.totals.length > 1" class="person-money__currency">
          {{ currencyName(totals.currency) }}
        </p>
        <dl class="person-money__facts">
          <div>
            <dt>عليه للمكتب</dt>
            <dd :class="{ 'text-warning': !zero(totals.owed_to_office) }">
              <bdi>{{
                formatAmount(totals.owed_to_office, totals.currency)
              }}</bdi>
            </dd>
          </div>
          <div>
            <dt>أمانات يحفظها المكتب له</dt>
            <dd>
              <bdi>{{
                formatAmount(totals.client_funds_held, totals.currency)
              }}</bdi>
            </dd>
          </div>
          <div>
            <dt>عمولاته</dt>
            <dd>
              <bdi>{{
                formatAmount(totals.commission_recorded, totals.currency)
              }}</bdi>
              <small
                >حُصِّل
                <bdi>{{
                  formatAmount(totals.commission_collected, totals.currency)
                }}</bdi></small
              >
            </dd>
          </div>
        </dl>
      </div>

      <template v-if="finance.commissions.length">
        <h3 class="person-money__subtitle">العمولات</h3>
        <ul class="person-money__list">
          <li v-for="row in finance.commissions" :key="row.id">
            <router-link :to="`/accounting/commissions/${row.id}`"
              ><bdi>{{ row.code }}</bdi></router-link
            >
            <router-link
              :to="`/deals/${row.deal_id}`"
              class="text-medium-emphasis"
              ><bdi>{{ row.deal_code }}</bdi></router-link
            >
            <span class="person-money__grow">{{
              formatDate(row.commission_date)
            }}</span>
            <v-chip
              v-if="row.status === 'cancelled'"
              size="x-small"
              color="error"
              variant="tonal"
              label
              >ملغاة</v-chip
            >
            <span v-else-if="!zero(row.outstanding)" class="text-warning"
              >المتبقي
              <bdi>{{ formatAmount(row.outstanding, row.currency) }}</bdi></span
            >
            <bdi class="person-money__amount">{{
              formatAmount(row.amount, row.currency)
            }}</bdi>
          </li>
        </ul>
      </template>

      <h3 class="person-money__subtitle">
        السندات
        <span v-if="voucherTotal > vouchers.length" class="text-medium-emphasis"
          >(آخر {{ vouchers.length }} من {{ voucherTotal }})</span
        >
      </h3>
      <p v-if="!vouchers.length" class="person-money__empty">
        لا سندات لهذا الزبون.
      </p>
      <ul v-else class="person-money__list">
        <li v-for="voucher in vouchers" :key="voucher.id">
          <router-link :to="`/accounting/vouchers/${voucher.id}`"
            ><bdi>{{ voucher.code }}</bdi></router-link
          >
          <span class="text-medium-emphasis">{{
            formatDate(voucher.voucher_date)
          }}</span>
          <span class="person-money__grow"
            >{{ voucherPurposeLabel(voucher.kind, voucher.purpose) }}
            <template
              v-if="
                voucher.held_for_person_id === personId &&
                voucher.person_id !== personId
              "
              >·
              {{
                voucher.kind === "receipt"
                  ? `لحسابه، من ${voucher.party_name}`
                  : `من أمانته، إلى ${voucher.party_name}`
              }}</template
            ></span
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
            class="person-money__amount"
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
  </div>
</template>

<style scoped>
.person-money {
  padding: 4px 0;
}
.person-money__bar {
  display: flex;
  align-items: center;
  gap: 4px;
}
.person-money__facts {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(170px, 1fr));
  gap: 10px 16px;
  margin: 0 0 12px;
}
.person-money__currency {
  margin: 4px 0;
  font-size: 0.8125rem;
  font-weight: 700;
}
.person-money__facts dt {
  font-size: 0.75rem;
  color: rgb(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}
.person-money__facts dd {
  margin: 0;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  display: grid;
}
.person-money__facts small {
  font-weight: 400;
  font-size: 0.75rem;
  color: rgb(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}
.person-money__subtitle {
  margin: 12px 0 4px;
  font-size: 0.875rem;
  font-weight: 700;
}
.person-money__empty {
  margin: 0;
  font-size: 0.875rem;
  color: rgb(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}
.person-money__list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 6px;
  font-size: 0.8125rem;
}
.person-money__list li {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}
.person-money__grow {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.person-money__amount {
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}
</style>
