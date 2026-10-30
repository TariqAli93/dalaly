<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { useRoute } from "vue-router";
import AppPage from "../components/app/AppPage.vue";
import * as vouchersService from "../services/vouchers.service";
import { getErrorMessage } from "../services/api.service";
import { usePermissions } from "../composables/usePermissions";
import { useRefresh } from "../composables/useRefresh";
import { useSnackbar } from "../composables/useSnackbar";
import { voucherKindLabel, voucherPurposeLabel } from "../constants/accounting";
import {
  formatAmount,
  formatDate,
  formatDateTime,
  todayIso,
} from "../utils/format";
import { exportVoucherPdf, printVoucher } from "../utils/voucherPrint";
import type { VoucherDetail } from "../types";

/**
 * صفحة السند: بياناته ومبلغه كتابةً وقيده في اليومية، وطباعته أو حفظه PDF.
 * السند لا يُعدَّل؛ «إلغاء السند» يرحّل قيداً عكسياً ويبقيه في الدفاتر ملغى.
 */
const route = useRoute();
const { can } = usePermissions();
const { setRefreshHandler } = useRefresh();
const { notifySuccess, notifyError } = useSnackbar();

const voucher = ref<VoucherDetail | null>(null);
const loading = ref(false);
const error = ref<string | null>(null);
const id = computed(() => Number(route.params.id));

async function load() {
  loading.value = true;
  error.value = null;
  try {
    voucher.value = await vouchersService.getVoucher(id.value);
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

const receipt = computed(() => voucher.value?.kind === "receipt");
const printing = ref<"print" | "pdf" | null>(null);
async function output(kind: "print" | "pdf") {
  if (!voucher.value || printing.value) return;
  printing.value = kind;
  try {
    const result =
      kind === "print"
        ? await printVoucher(voucher.value)
        : await exportVoucherPdf(voucher.value);
    if (!result.ok && !result.canceled)
      notifyError(result.message ?? "تعذّرت طباعة السند.");
  } catch (cause) {
    notifyError(getErrorMessage(cause));
  } finally {
    printing.value = null;
  }
}

const voidDialog = ref(false);
const voidDate = ref(todayIso());
const voidReason = ref("");
const voidError = ref("");
const voiding = ref(false);
function openVoid() {
  voidDate.value = todayIso();
  voidReason.value = "";
  voidError.value = "";
  voidDialog.value = true;
}
async function confirmVoid() {
  const current = voucher.value;
  if (!current || voiding.value) return;
  if (!voidReason.value.trim()) {
    voidError.value = "اذكر سبب إلغاء السند.";
    return;
  }
  voiding.value = true;
  voidError.value = "";
  try {
    voucher.value = await vouchersService.voidVoucher(current.id, {
      void_date: voidDate.value,
      reason: voidReason.value.trim(),
    });
    voidDialog.value = false;
    notifySuccess(`أُلغي السند ${current.code}، ورُحِّل قيده العكسي.`);
  } catch (cause) {
    voidError.value = getErrorMessage(cause);
  } finally {
    voiding.value = false;
  }
}
</script>

<template>
  <AppPage
    :title="
      voucher ? `${voucherKindLabel(voucher.kind)} ${voucher.code}` : 'السند'
    "
    :parent="{ to: '/accounting/vouchers', label: 'السندات' }"
  >
    <template v-if="voucher" #header-actions>
      <v-btn
        variant="text"
        prepend-icon="mdi-file-pdf-box"
        :loading="printing === 'pdf'"
        @click="output('pdf')"
        >PDF</v-btn
      >
      <v-btn
        variant="tonal"
        prepend-icon="mdi-printer-outline"
        :loading="printing === 'print'"
        @click="output('print')"
        >طباعة</v-btn
      >
      <v-btn
        v-if="voucher.status === 'posted' && can('vouchers.void')"
        variant="text"
        color="error"
        prepend-icon="mdi-cancel"
        @click="openVoid"
        >إلغاء السند</v-btn
      >
    </template>

    <v-progress-linear v-if="loading && !voucher" indeterminate />
    <v-alert v-else-if="error" type="error" variant="tonal">
      {{ error }}
      <template #append>
        <v-btn variant="text" size="small" @click="load">إعادة المحاولة</v-btn>
      </template>
    </v-alert>

    <section
      v-else-if="voucher"
      class="dal-panel voucher"
      aria-label="بيانات السند"
    >
      <div class="voucher__head">
        <div>
          <p class="text-caption text-medium-emphasis mb-1">
            {{ receipt ? "استلمنا من" : "صرفنا إلى" }}
          </p>
          <h2 class="text-h6">
            <router-link
              v-if="voucher.person_id"
              :to="`/clients/${voucher.person_id}`"
              >{{ voucher.party_name }}</router-link
            >
            <template v-else>{{ voucher.party_name }}</template>
          </h2>
        </div>
        <div class="voucher__amount">
          <bdi>{{ formatAmount(voucher.amount, voucher.currency) }}</bdi>
          <v-chip
            size="small"
            variant="tonal"
            label
            :color="voucher.status === 'voided' ? 'error' : 'success'"
            >{{ voucher.status === "voided" ? "ملغى" : "صادر" }}</v-chip
          >
        </div>
      </div>
      <p class="voucher__words">{{ voucher.amount_in_words }}</p>

      <v-alert
        v-if="voucher.status === 'voided'"
        type="error"
        variant="tonal"
        density="compact"
        class="mb-4"
      >
        أُلغي
        <span v-if="voucher.voided_at">{{
          formatDateTime(voucher.voided_at)
        }}</span>
        <template v-if="voucher.voided_by_name">
          · {{ voucher.voided_by_name }}</template
        >: {{ voucher.void_reason }}. قيده العكسي
        <router-link
          v-if="voucher.void_entry_id"
          :to="`/accounting/journal/${voucher.void_entry_id}`"
          ><bdi>{{ voucher.void_entry_code }}</bdi></router-link
        >.
      </v-alert>

      <dl class="voucher__facts">
        <div>
          <dt>التاريخ</dt>
          <dd>{{ formatDate(voucher.voucher_date) }}</dd>
        </div>
        <div>
          <dt>الغرض</dt>
          <dd>
            {{ voucherPurposeLabel(voucher.kind, voucher.purpose) }}
            <template v-if="voucher.expense_category_name">
              · {{ voucher.expense_category_name }}</template
            >
          </dd>
        </div>
        <div class="voucher__wide">
          <dt>وذلك عن</dt>
          <dd>{{ voucher.description }}</dd>
        </div>
        <div>
          <dt>{{ receipt ? "قُبض في" : "صُرف من" }}</dt>
          <dd>
            <bdi>{{ voucher.money_account_code }}</bdi>
            {{ voucher.money_account_name }}
          </dd>
        </div>
        <div>
          <dt>الحساب المقابل</dt>
          <dd>
            <bdi>{{ voucher.other_account_code }}</bdi>
            {{ voucher.other_account_name }}
          </dd>
        </div>
        <div
          v-if="
            voucher.held_for_person_id &&
            voucher.held_for_person_id !== voucher.person_id
          "
        >
          <dt>الأمانة لحساب</dt>
          <dd>
            <router-link :to="`/clients/${voucher.held_for_person_id}`">{{
              voucher.held_for_name
            }}</router-link>
          </dd>
        </div>
        <div v-if="voucher.deal_id">
          <dt>الصفقة</dt>
          <dd>
            <router-link :to="`/deals/${voucher.deal_id}`"
              ><bdi>{{ voucher.deal_code }}</bdi></router-link
            >
          </dd>
        </div>
        <div v-if="voucher.lease_id">
          <dt>الإيجار</dt>
          <dd>
            <router-link :to="`/leases/${voucher.lease_id}`"
              ><bdi>{{ voucher.lease_code }}</bdi></router-link
            >
            <template v-if="voucher.lease_installment_seq">
              · القسط {{ voucher.lease_installment_seq }}</template
            >
          </dd>
        </div>
        <div v-if="voucher.reference">
          <dt>المرجع</dt>
          <dd>{{ voucher.reference }}</dd>
        </div>
        <div>
          <dt>القيد</dt>
          <dd>
            <router-link
              v-if="can('accounting.read')"
              :to="`/accounting/journal/${voucher.journal_entry_id}`"
              ><bdi>{{ voucher.journal_entry_code }}</bdi></router-link
            >
            <bdi v-else>{{ voucher.journal_entry_code }}</bdi>
          </dd>
        </div>
        <div>
          <dt>أصدره</dt>
          <dd>
            {{ voucher.created_by_name ?? "—" }} ·
            {{ formatDateTime(voucher.created_at) }}
          </dd>
        </div>
      </dl>
    </section>

    <v-dialog v-model="voidDialog" max-width="480" :persistent="voiding">
      <v-card tag="form" @submit.prevent="confirmVoid">
        <v-card-title>إلغاء السند {{ voucher?.code }}</v-card-title>
        <v-card-text>
          <p class="text-body-2 mb-3">
            يُرحَّل قيد عكسي يلغي أثر السند في الصندوق أو المصرف وفي الحساب
            المقابل. السند يبقى في الدفاتر ملغى ولا يُعاد تفعيله؛ أصدر سنداً
            جديداً إن لزم.
          </p>
          <v-alert v-if="voidError" type="error" variant="tonal" class="mb-3">{{
            voidError
          }}</v-alert>
          <v-text-field
            v-model="voidDate"
            type="date"
            label="تاريخ الإلغاء"
            class="mb-3"
            hide-details
          />
          <v-text-field
            v-model="voidReason"
            label="سبب الإلغاء *"
            placeholder="مثلاً: سُجّل المبلغ خطأً"
            hide-details
          />
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn variant="text" :disabled="voiding" @click="voidDialog = false"
            >تراجع</v-btn
          >
          <v-btn color="error" variant="flat" type="submit" :loading="voiding"
            >إلغاء السند</v-btn
          >
        </v-card-actions>
      </v-card>
    </v-dialog>
  </AppPage>
</template>

<style scoped>
.voucher {
  padding: 20px 24px;
}
.voucher__head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 16px;
  flex-wrap: wrap;
}
.voucher__amount {
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 1.5rem;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}
.voucher__words {
  margin: 8px 0 16px;
  color: rgb(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}
.voucher__facts {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(13rem, 1fr));
  gap: 14px 28px;
}
.voucher__wide {
  grid-column: 1 / -1;
}
.voucher__facts dt {
  font-size: 0.8125rem;
  color: rgb(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}
.voucher__facts dd {
  font-weight: 500;
}
</style>
