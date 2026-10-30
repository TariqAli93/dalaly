<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { useRoute } from "vue-router";
import AppPage from "../components/app/AppPage.vue";
import VoucherDialog from "../components/accounting/VoucherDialog.vue";
import * as commissionsService from "../services/commissions.service";
import { getErrorMessage } from "../services/api.service";
import { usePermissions } from "../composables/usePermissions";
import { useRefresh } from "../composables/useRefresh";
import { useSnackbar } from "../composables/useSnackbar";
import { voucherKindLabel } from "../constants/accounting";
import { formatAmount, formatDate, todayIso } from "../utils/format";
import type {
  CommissionDetail,
  CommissionSplitRecord,
  VoucherDetail,
  VoucherKind,
  VoucherPayload,
} from "../types";

/**
 * صفحة العمولة: مبلغها وما حُصِّل منها والمتبقي، وحصص الموظفين بما دُفع
 * منها، وسندات القبض والصرف المخصصة لها. «تحصيل» و«دفع» يصدران سنداً مخصصاً؛
 * «إلغاء العمولة» يعكس قيدها ما لم يُسدَّد منها شيء.
 */
const route = useRoute();
const { can } = usePermissions();
const { setRefreshHandler } = useRefresh();
const { notifySuccess } = useSnackbar();

const commission = ref<CommissionDetail | null>(null);
const loading = ref(false);
const error = ref<string | null>(null);
const id = computed(() => Number(route.params.id));

async function load() {
  loading.value = true;
  error.value = null;
  try {
    commission.value = await commissionsService.getCommission(id.value);
  } catch (cause) {
    error.value = getErrorMessage(cause);
  } finally {
    loading.value = false;
  }
}
watch(id, () => void load());
onMounted(() => {
  setRefreshHandler(load);
  void load();
});

const active = computed(() => commission.value?.status === "active");
const settledVouchers = computed(
  () =>
    commission.value?.vouchers.filter((voucher) => voucher.status === "posted")
      .length ?? 0,
);
const money = (value: string) =>
  formatAmount(value, commission.value?.currency);

// ─── سندات مخصصة ───────────────────────────────────────────────────────
const voucherDialog = ref(false);
const voucherKind = ref<VoucherKind>("receipt");
const voucherPreset = ref<Partial<VoucherPayload> | null>(null);
const voucherNote = ref("");
function collect() {
  const current = commission.value!;
  voucherKind.value = "receipt";
  voucherPreset.value = {
    purpose: "commission",
    currency: current.currency,
    commission_id: current.id,
    amount: current.outstanding,
    description: `عمولة ${current.code}${current.deal_code ? ` على الصفقة ${current.deal_code}` : ""}`,
  };
  voucherNote.value = `تحصيل العمولة ${current.code} من ${current.payer_name ?? ""}؛ المتبقي ${money(current.outstanding)}.`;
  voucherDialog.value = true;
}
function pay(share: CommissionSplitRecord) {
  voucherKind.value = "payment";
  voucherPreset.value = {
    purpose: "commission",
    currency: share.currency,
    commission_split_id: share.id,
    amount: share.outstanding,
    description: `حصة ${share.user_name} من العمولة ${share.commission_code}`,
  };
  voucherNote.value = `دفع حصة ${share.user_name}؛ المتبقي ${money(share.outstanding)}.`;
  voucherDialog.value = true;
}
function onIssued(voucher: VoucherDetail) {
  notifySuccess(`صدر ${voucherKindLabel(voucher.kind)} ${voucher.code}.`);
  void load();
}

// ─── الإلغاء ───────────────────────────────────────────────────────────
const cancelDialog = ref(false);
const cancelDate = ref(todayIso());
const cancelReason = ref("");
const cancelError = ref("");
const cancelling = ref(false);
function openCancel() {
  cancelDate.value = todayIso();
  cancelReason.value = "";
  cancelError.value = "";
  cancelDialog.value = true;
}
async function confirmCancel() {
  const current = commission.value;
  if (!current || cancelling.value) return;
  if (!cancelReason.value.trim()) {
    cancelError.value = "اذكر سبب إلغاء العمولة.";
    return;
  }
  cancelling.value = true;
  cancelError.value = "";
  try {
    commission.value = await commissionsService.cancelCommission(current.id, {
      cancel_date: cancelDate.value,
      reason: cancelReason.value.trim(),
    });
    cancelDialog.value = false;
    notifySuccess(`أُلغيت العمولة ${current.code}، ورُحِّل قيدها العكسي.`);
  } catch (cause) {
    cancelError.value = getErrorMessage(cause);
  } finally {
    cancelling.value = false;
  }
}
</script>

<template>
  <AppPage
    :title="commission ? `العمولة ${commission.code}` : 'العمولة'"
    :parent="{ to: '/accounting/commissions', label: 'العمولات' }"
  >
    <template v-if="commission && active" #header-actions>
      <v-btn
        v-if="commission.outstanding !== '0.00' && can('vouchers.receipt')"
        color="primary"
        variant="flat"
        prepend-icon="mdi-cash-plus"
        @click="collect"
        >تحصيل</v-btn
      >
      <v-btn
        v-if="can('commissions.manage') && !settledVouchers"
        variant="text"
        color="error"
        prepend-icon="mdi-cancel"
        @click="openCancel"
        >إلغاء العمولة</v-btn
      >
    </template>

    <v-progress-linear v-if="loading && !commission" indeterminate />
    <v-alert v-else-if="error" type="error" variant="tonal">
      {{ error }}
      <template #append>
        <v-btn variant="text" size="small" @click="load">إعادة المحاولة</v-btn>
      </template>
    </v-alert>

    <template v-else-if="commission">
      <section class="dal-panel commission" aria-label="بيانات العمولة">
        <div class="commission__head">
          <div>
            <p class="text-caption text-medium-emphasis mb-1">
              على
              {{
                commission.payer_role === "client"
                  ? "المشتري أو المستأجر"
                  : "البائع أو المؤجر"
              }}
            </p>
            <h2 class="text-h6">
              <router-link
                v-if="commission.payer_person_id"
                :to="`/clients/${commission.payer_person_id}`"
                >{{ commission.payer_name }}</router-link
              >
            </h2>
          </div>
          <v-chip
            size="small"
            variant="tonal"
            label
            :color="
              !active
                ? 'error'
                : commission.outstanding === '0.00'
                  ? 'success'
                  : 'warning'
            "
            >{{
              !active
                ? "ملغاة"
                : commission.outstanding === "0.00"
                  ? "محصّلة"
                  : "غير محصّلة بالكامل"
            }}</v-chip
          >
        </div>

        <div class="commission__figures">
          <div>
            <span>العمولة</span>
            <bdi>{{ money(commission.amount) }}</bdi>
          </div>
          <div v-if="active">
            <span>حُصِّل</span>
            <bdi>{{ money(commission.collected) }}</bdi>
          </div>
          <div v-if="active">
            <span>المتبقي</span>
            <bdi>{{ money(commission.outstanding) }}</bdi>
          </div>
          <div>
            <span>حصة المكتب</span>
            <bdi>{{ money(commission.office_share) }}</bdi>
          </div>
        </div>

        <v-alert
          v-if="!active"
          type="error"
          variant="tonal"
          density="compact"
          class="mb-3"
        >
          أُلغيت: {{ commission.cancel_reason }}. قيدها العكسي
          <router-link
            v-if="commission.cancel_entry_id"
            :to="`/accounting/journal/${commission.cancel_entry_id}`"
            ><bdi>{{ commission.cancel_entry_code }}</bdi></router-link
          >.
        </v-alert>

        <dl class="commission__facts">
          <div>
            <dt>التاريخ</dt>
            <dd>{{ formatDate(commission.commission_date) }}</dd>
          </div>
          <div>
            <dt>الحساب</dt>
            <dd v-if="commission.basis === 'percent'">
              <bdi>{{ Number(commission.rate) }}%</bdi> من
              <bdi>{{ money(commission.base_amount ?? "0") }}</bdi>
            </dd>
            <dd v-else>مبلغ ثابت</dd>
          </div>
          <div v-if="commission.deal_id">
            <dt>الصفقة</dt>
            <dd>
              <router-link :to="`/deals/${commission.deal_id}`"
                ><bdi>{{ commission.deal_code }}</bdi></router-link
              >
            </dd>
          </div>
          <div>
            <dt>القيد</dt>
            <dd>
              <router-link
                v-if="can('accounting.read')"
                :to="`/accounting/journal/${commission.journal_entry_id}`"
                ><bdi>{{ commission.journal_entry_code }}</bdi></router-link
              >
              <bdi v-else>{{ commission.journal_entry_code }}</bdi>
            </dd>
          </div>
          <div v-if="commission.description" class="commission__wide">
            <dt>ملاحظة</dt>
            <dd>{{ commission.description }}</dd>
          </div>
        </dl>
      </section>

      <section class="dal-panel commission-part mt-4" aria-label="حصص الموظفين">
        <h3 class="commission-part__title">حصص الموظفين</h3>
        <p
          v-if="!commission.splits.length"
          class="text-body-2 text-medium-emphasis"
        >
          لا حصص: العمولة كلها للمكتب.
        </p>
        <v-table v-else density="compact">
          <thead>
            <tr>
              <th scope="col">الموظف</th>
              <th scope="col" class="commission-amount">الحصة</th>
              <th scope="col" class="commission-amount">المدفوع</th>
              <th scope="col" class="commission-amount">المتبقي</th>
              <th scope="col"><span class="d-sr-only">دفع</span></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="share in commission.splits" :key="share.id">
              <td>
                {{ share.user_name }}
                <span
                  v-if="share.basis === 'percent'"
                  class="text-medium-emphasis"
                  >(<bdi>{{ Number(share.rate) }}%</bdi>)</span
                >
              </td>
              <td class="commission-amount">
                <bdi>{{ money(share.amount) }}</bdi>
              </td>
              <td class="commission-amount">
                <bdi>{{ money(share.paid) }}</bdi>
              </td>
              <td class="commission-amount">
                <bdi>{{ money(share.outstanding) }}</bdi>
              </td>
              <td class="text-end">
                <v-btn
                  v-if="
                    active &&
                    share.outstanding !== '0.00' &&
                    can('vouchers.payment')
                  "
                  variant="tonal"
                  size="small"
                  prepend-icon="mdi-cash-minus"
                  @click="pay(share)"
                  >دفع</v-btn
                >
              </td>
            </tr>
          </tbody>
        </v-table>
      </section>

      <section
        class="dal-panel commission-part mt-4"
        aria-label="سندات العمولة"
      >
        <h3 class="commission-part__title">السندات</h3>
        <p
          v-if="!commission.vouchers.length"
          class="text-body-2 text-medium-emphasis"
        >
          لا سندات بعد.
        </p>
        <v-table v-else density="compact">
          <tbody>
            <tr v-for="voucher in commission.vouchers" :key="voucher.id">
              <td>
                <router-link
                  v-if="can('vouchers.read')"
                  :to="`/accounting/vouchers/${voucher.id}`"
                  ><bdi>{{ voucher.code }}</bdi></router-link
                >
                <bdi v-else>{{ voucher.code }}</bdi>
              </td>
              <td>{{ voucherKindLabel(voucher.kind) }}</td>
              <td>{{ formatDate(voucher.voucher_date) }}</td>
              <td>{{ voucher.party_name }}</td>
              <td class="commission-amount">
                <bdi>{{ money(voucher.amount) }}</bdi>
              </td>
              <td>
                <v-chip
                  v-if="voucher.status === 'voided'"
                  size="x-small"
                  color="error"
                  variant="tonal"
                  label
                  >ملغى</v-chip
                >
              </td>
            </tr>
          </tbody>
        </v-table>
      </section>
    </template>

    <VoucherDialog
      v-model="voucherDialog"
      :kind="voucherKind"
      :preset="voucherPreset"
      :allocation-note="voucherNote"
      @saved="onIssued"
    />

    <v-dialog v-model="cancelDialog" max-width="480" :persistent="cancelling">
      <v-card tag="form" @submit.prevent="confirmCancel">
        <v-card-title>إلغاء العمولة {{ commission?.code }}</v-card-title>
        <v-card-text>
          <p class="text-body-2 mb-3">
            يُرحَّل قيد عكسي يلغي الذمة على الدافع والإيراد وحصص الموظفين.
            العمولة تبقى في الدفاتر ملغاة، ويمكن تسجيل غيرها للصفقة.
          </p>
          <v-alert
            v-if="cancelError"
            type="error"
            variant="tonal"
            class="mb-3"
            >{{ cancelError }}</v-alert
          >
          <v-text-field
            v-model="cancelDate"
            type="date"
            label="تاريخ الإلغاء"
            class="mb-3"
            hide-details
          />
          <v-text-field
            v-model="cancelReason"
            label="سبب الإلغاء *"
            placeholder="مثلاً: اتُّفق على عمولة أخرى"
            hide-details
          />
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn
            variant="text"
            :disabled="cancelling"
            @click="cancelDialog = false"
            >تراجع</v-btn
          >
          <v-btn
            color="error"
            variant="flat"
            type="submit"
            :loading="cancelling"
            >إلغاء العمولة</v-btn
          >
        </v-card-actions>
      </v-card>
    </v-dialog>
  </AppPage>
</template>

<style scoped>
.commission {
  padding: 20px 24px;
}
.commission__head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 16px;
}
.commission__figures {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(10rem, 1fr));
  gap: 12px;
  margin: 12px 0 16px;
}
.commission__figures div {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.commission__figures span {
  font-size: 0.8125rem;
  color: rgb(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}
.commission__figures bdi {
  font-size: 1.15rem;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}
.commission__facts {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(12rem, 1fr));
  gap: 12px 24px;
}
.commission__wide {
  grid-column: 1 / -1;
}
.commission__facts dt {
  font-size: 0.8125rem;
  color: rgb(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}
.commission__facts dd {
  font-weight: 500;
}
.commission-part {
  padding: 12px 16px;
}
.commission-part__title {
  margin: 0 0 8px;
  font-size: 0.95rem;
  font-weight: 700;
}
.commission-amount {
  text-align: end;
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}
</style>
