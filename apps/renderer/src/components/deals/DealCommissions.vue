<script setup lang="ts">
import { computed, ref, watch } from "vue";
import CommissionDialog from "../accounting/CommissionDialog.vue";
import VoucherDialog from "../accounting/VoucherDialog.vue";
import * as commissionsService from "../../services/commissions.service";
import { getErrorMessage } from "../../services/api.service";
import { usePermissions } from "../../composables/usePermissions";
import { useSnackbar } from "../../composables/useSnackbar";
import { dealPartyLabels } from "../../constants/deals";
import { formatAmount } from "../../utils/format";
import { commissionCollection } from "../../utils/commissionVouchers";
import type {
  CommissionDetail,
  CommissionRecord,
  DealRecord,
  VoucherDetail,
  VoucherPayload,
} from "../../types";

/**
 * عمولات الصفقة: على المشتري أو المستأجر، وعلى البائع أو المؤجر؛ كل منها
 * بمبلغه وما حُصِّل منه والمتبقي. «تسجيل عمولة» يقيدها إيراداً وذمة على
 * الدافع، و«تحصيل» يصدر سند قبض يسدد الذمة.
 */
const props = defineProps<{ deal: DealRecord }>();
/** A commission was recorded or collected: the deal's money changed. */
const emit = defineEmits<{ changed: [] }>();
const { can } = usePermissions();
const { notifySuccess } = useSnackbar();

const commissions = ref<CommissionRecord[]>([]);
const loading = ref(false);
const error = ref<string | null>(null);

async function load() {
  loading.value = true;
  error.value = null;
  try {
    commissions.value = (
      await commissionsService.listCommissionsPage(
        { deal_id: props.deal.id },
        {
          page: 1,
          page_size: 20,
          sort_by: "commission_date",
          sort_order: "asc",
        },
      )
    ).items;
  } catch (cause) {
    error.value = getErrorMessage(cause);
  } finally {
    loading.value = false;
  }
}
watch(() => props.deal.id, load, { immediate: true });

const parties = computed(() => dealPartyLabels(props.deal.deal_type));
const canRecord = computed(
  () =>
    can("commissions.manage") &&
    !["lost", "cancelled"].includes(props.deal.stage),
);

const dialog = ref(false);
function onRecorded(commission: CommissionDetail) {
  notifySuccess(`سُجّلت العمولة ${commission.code}.`);
  void load();
  emit("changed");
}

const collectDialog = ref(false);
const collectPreset = ref<Partial<VoucherPayload> | null>(null);
const collectNote = ref("");
function collect(commission: CommissionRecord) {
  const { preset, note } = commissionCollection(commission);
  collectPreset.value = preset;
  collectNote.value = note;
  collectDialog.value = true;
}
function onCollected(voucher: VoucherDetail) {
  notifySuccess(`صدر سند القبض ${voucher.code}.`);
  void load();
  emit("changed");
}
</script>

<template>
  <section class="dal-panel deal-commissions" aria-label="عمولات الصفقة">
    <div class="deal-commissions__bar">
      <h2 class="deal-commissions__title">العمولات</h2>
      <v-spacer />
      <v-btn
        v-if="canRecord"
        variant="text"
        size="small"
        prepend-icon="mdi-plus"
        @click="dialog = true"
        >تسجيل عمولة</v-btn
      >
    </div>
    <v-progress-linear v-if="loading && !commissions.length" indeterminate />
    <v-alert v-else-if="error" type="error" variant="tonal" density="compact">
      {{ error }}
    </v-alert>
    <p v-else-if="!commissions.length" class="deal-commissions__empty">
      لا عمولة مسجلة. العمولة إيراد المكتب، تُسجَّل على المشتري أو البائع حين
      يُتفق عليها.
    </p>
    <ul v-else class="deal-commissions__list">
      <li v-for="commission in commissions" :key="commission.id">
        <div class="deal-commissions__head">
          <router-link :to="`/accounting/commissions/${commission.id}`"
            ><bdi>{{ commission.code }}</bdi></router-link
          >
          <span class="text-medium-emphasis"
            >على {{ parties[commission.payer_role] }}</span
          >
          <v-chip
            v-if="commission.status === 'cancelled'"
            size="x-small"
            color="error"
            variant="tonal"
            label
            >ملغاة</v-chip
          >
          <v-chip
            v-else-if="commission.outstanding === '0.00'"
            size="x-small"
            color="success"
            variant="tonal"
            label
            >محصّلة</v-chip
          >
          <v-spacer />
          <bdi class="deal-commissions__amount">{{
            formatAmount(commission.amount, commission.currency)
          }}</bdi>
        </div>
        <div
          v-if="commission.status === 'active'"
          class="deal-commissions__meta"
        >
          <span
            >حُصِّل
            <bdi>{{
              formatAmount(commission.collected, commission.currency)
            }}</bdi>
            · المتبقي
            <bdi>{{
              formatAmount(commission.outstanding, commission.currency)
            }}</bdi></span
          >
          <v-btn
            v-if="commission.outstanding !== '0.00' && can('vouchers.receipt')"
            variant="tonal"
            size="small"
            prepend-icon="mdi-cash-plus"
            @click="collect(commission)"
            >تحصيل</v-btn
          >
        </div>
      </li>
    </ul>

    <CommissionDialog v-model="dialog" :deal="deal" @saved="onRecorded" />
    <VoucherDialog
      v-model="collectDialog"
      kind="receipt"
      :preset="collectPreset"
      :allocation-note="collectNote"
      @saved="onCollected"
    />
  </section>
</template>

<style scoped>
.deal-commissions {
  padding: 12px 16px;
}
.deal-commissions__bar {
  display: flex;
  align-items: center;
}
.deal-commissions__title {
  margin: 0 0 8px;
  font-size: 0.95rem;
  font-weight: 700;
}
.deal-commissions__empty {
  margin: 0;
  color: rgb(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
  font-size: 0.875rem;
}
.deal-commissions__list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 10px;
}
.deal-commissions__head,
.deal-commissions__meta {
  display: flex;
  align-items: center;
  gap: 8px;
}
.deal-commissions__meta {
  justify-content: space-between;
  font-size: 0.8125rem;
  margin-top: 2px;
}
.deal-commissions__amount {
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}
</style>
