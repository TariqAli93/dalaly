<script setup lang="ts">
import { computed, ref, watch } from "vue";
import VoucherDialog from "../accounting/VoucherDialog.vue";
import * as vouchersService from "../../services/vouchers.service";
import { getErrorMessage } from "../../services/api.service";
import { usePermissions } from "../../composables/usePermissions";
import { useSnackbar } from "../../composables/useSnackbar";
import {
  voucherKindLabel,
  voucherPurposeLabel,
} from "../../constants/accounting";
import { formatAmount, formatDate } from "../../utils/format";
import {
  depositReceipt,
  leasePayout,
  rentReceipt,
  type LeaseVoucher,
} from "../../utils/leaseVouchers";
import type {
  LeaseDetail,
  LeaseInstallmentRecord,
  VoucherDetail,
  VoucherRecord,
} from "../../types";

/**
 * مال الإيجار: ما استُحق منه حتى اليوم وما حُصِّل والمتأخر، وما يحفظه المكتب
 * عليه للمؤجر (الإيجار المقبوض) وللمستأجر (التأمين). كله أمانة وليس إيراداً.
 * بجانبها سندات الإيجار، وأزرار تحصيل القسط وقبض التأمين وتسليم الأمانة.
 */
const props = defineProps<{ lease: LeaseDetail }>();
const emit = defineEmits<{ changed: [] }>();
const { can } = usePermissions();
const { notifySuccess } = useSnackbar();

const vouchers = ref<VoucherRecord[]>([]);
const voucherTotal = ref(0);
const loading = ref(false);
const error = ref<string | null>(null);

async function loadVouchers() {
  if (!can("vouchers.read")) return;
  loading.value = true;
  error.value = null;
  try {
    const page = await vouchersService.listVouchersPage(
      { lease_id: props.lease.id },
      { page: 1, page_size: 8, sort_by: "voucher_date", sort_order: "desc" },
    );
    vouchers.value = page.items;
    voucherTotal.value = page.total;
  } catch (cause) {
    error.value = getErrorMessage(cause);
  } finally {
    loading.value = false;
  }
}
watch(() => props.lease.id, loadVouchers, { immediate: true });

const zero = (value: string) => /^-?0(\.0+)?$/.test(value);
const money = (value: string) => formatAmount(value, props.lease.currency);
const live = computed(() => props.lease.status !== "cancelled");
const collects = computed(() => props.lease.office_collects && live.value);
/** The oldest installment still owed: what "collect rent" takes first. */
const nextOwed = computed(() =>
  props.lease.installments.find(
    (row) => row.state !== "paid" && row.state !== "released",
  ),
);
/** What the lease holds for each side: a payout takes no more. */
const leaseHeld = computed(() => {
  const held: Record<number, string> = {};
  if (props.lease.landlord_person_id)
    held[props.lease.landlord_person_id] = props.lease.held_for_landlord;
  if (props.lease.tenant_person_id)
    held[props.lease.tenant_person_id] = props.lease.deposit_held;
  return held;
});

const dialog = ref(false);
const current = ref<LeaseVoucher | null>(null);
function openVoucher(voucher: LeaseVoucher) {
  current.value = voucher;
  dialog.value = true;
}
function collect(installment: LeaseInstallmentRecord) {
  openVoucher(rentReceipt(props.lease, installment));
}
function onIssued(voucher: VoucherDetail) {
  notifySuccess(`صدر ${voucherKindLabel(voucher.kind)} ${voucher.code}.`);
  emit("changed");
  void loadVouchers();
}
defineExpose({ collect, reload: loadVouchers });
</script>

<template>
  <section class="dal-panel lease-money" aria-label="مال الإيجار">
    <div class="lease-money__bar">
      <h3 class="lease-money__title">المال</h3>
      <v-spacer />
      <v-btn
        v-if="collects && nextOwed && can('vouchers.receipt')"
        variant="text"
        size="small"
        prepend-icon="mdi-cash-plus"
        @click="collect(nextOwed)"
        >تحصيل الإيجار</v-btn
      >
      <v-btn
        v-if="lease.status === 'active' && can('vouchers.receipt')"
        variant="text"
        size="small"
        prepend-icon="mdi-shield-plus-outline"
        @click="
          openVoucher(depositReceipt(lease, lease.deposit, lease.deposit_held))
        "
        >قبض التأمين</v-btn
      >
      <v-btn
        v-if="!zero(lease.held_for_landlord) && can('vouchers.payment')"
        variant="text"
        size="small"
        prepend-icon="mdi-cash-fast"
        @click="
          openVoucher(leasePayout(lease, 'landlord', lease.held_for_landlord))
        "
        >تسليم للمؤجر</v-btn
      >
      <v-btn
        v-if="!zero(lease.deposit_held) && can('vouchers.payment')"
        variant="text"
        size="small"
        prepend-icon="mdi-shield-refresh-outline"
        @click="openVoucher(leasePayout(lease, 'tenant', lease.deposit_held))"
        >إعادة التأمين</v-btn
      >
    </div>

    <dl class="lease-money__facts">
      <template v-if="lease.office_collects">
        <div>
          <dt>استُحق حتى اليوم</dt>
          <dd>
            <bdi>{{ money(lease.due_to_date) }}</bdi>
            <small
              >حُصِّل <bdi>{{ money(lease.collected) }}</bdi></small
            >
          </dd>
        </div>
        <div>
          <dt>المتأخر على المستأجر</dt>
          <dd :class="{ 'text-error': !zero(lease.outstanding) }">
            <bdi>{{ money(lease.outstanding) }}</bdi>
            <small v-if="lease.overdue_count">{{
              lease.overdue_count === 1
                ? "قسط متأخر"
                : `${lease.overdue_count} أقساط متأخرة`
            }}</small>
          </dd>
        </div>
        <div>
          <dt>محفوظ للمؤجر</dt>
          <dd>
            <bdi>{{ money(lease.held_for_landlord) }}</bdi>
            <small>لم يُسلَّم إليه بعد</small>
          </dd>
        </div>
      </template>
      <div>
        <dt>التأمين المحفوظ</dt>
        <dd>
          <bdi>{{ money(lease.deposit_held) }}</bdi>
          <small v-if="lease.deposit"
            >المتفق عليه <bdi>{{ money(lease.deposit) }}</bdi></small
          >
        </dd>
      </div>
    </dl>
    <p class="lease-money__note">
      {{
        lease.office_collects
          ? "الإيجار المقبوض أمانة لحساب المؤجر، والتأمين أمانة لحساب المستأجر؛ ليس أيٌّ منهما إيراداً للمكتب."
          : "يدفع المستأجر الإيجار للمؤجر مباشرة، فلا يتابع المكتب أقساطه. التأمين إن قبضه المكتب أمانة لحساب المستأجر."
      }}
    </p>

    <template v-if="can('vouchers.read')">
      <h4 class="lease-money__subtitle">
        السندات
        <span v-if="voucherTotal > vouchers.length" class="text-medium-emphasis"
          >(آخر {{ vouchers.length }} من {{ voucherTotal }})</span
        >
      </h4>
      <v-progress-linear v-if="loading && !vouchers.length" indeterminate />
      <v-alert v-else-if="error" type="error" variant="tonal" density="compact">
        {{ error }}
        <template #append>
          <v-btn variant="text" size="small" @click="loadVouchers"
            >إعادة المحاولة</v-btn
          >
        </template>
      </v-alert>
      <p v-else-if="!vouchers.length" class="lease-money__empty">
        لا سندات على هذا الإيجار.
      </p>
      <ul v-else class="lease-money__vouchers">
        <li v-for="voucher in vouchers" :key="voucher.id">
          <router-link :to="`/accounting/vouchers/${voucher.id}`"
            ><bdi>{{ voucher.code }}</bdi></router-link
          >
          <span class="text-medium-emphasis">{{
            formatDate(voucher.voucher_date)
          }}</span>
          <span class="lease-money__purpose"
            >{{
              voucher.lease_installment_seq
                ? `القسط ${voucher.lease_installment_seq}`
                : voucherPurposeLabel(voucher.kind, voucher.purpose)
            }}
            · {{ voucher.party_name }}</span
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
            class="lease-money__amount"
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
      :kind="current?.kind ?? 'receipt'"
      :preset="current?.preset ?? null"
      :allocation-note="current?.note ?? null"
      :lease-held="leaseHeld"
      @saved="onIssued"
    />
  </section>
</template>

<style scoped>
.lease-money {
  padding: 12px 16px;
}
.lease-money__bar {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 4px;
}
.lease-money__title {
  margin: 0 0 8px;
  font-size: 0.95rem;
  font-weight: 700;
}
.lease-money__facts {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  gap: 10px 16px;
  margin: 0 0 8px;
}
.lease-money__facts dt {
  font-size: 0.75rem;
  color: rgb(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}
.lease-money__facts dd {
  margin: 0;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  display: grid;
}
.lease-money__facts small {
  font-weight: 400;
  font-size: 0.75rem;
  color: rgb(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}
.lease-money__note,
.lease-money__empty {
  margin: 0 0 6px;
  font-size: 0.8125rem;
  color: rgb(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}
.lease-money__subtitle {
  margin: 10px 0 4px;
  font-size: 0.875rem;
  font-weight: 700;
}
.lease-money__vouchers {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 6px;
  font-size: 0.8125rem;
}
.lease-money__vouchers li {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}
.lease-money__purpose {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.lease-money__amount {
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}
</style>
