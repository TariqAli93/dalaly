<script setup lang="ts">
import { onMounted, ref } from "vue";
import * as commissionsService from "../../services/commissions.service";
import { getErrorMessage } from "../../services/api.service";
import { usePermissions } from "../../composables/usePermissions";
import { formatAmount } from "../../utils/format";
import type { CommissionSplitRecord } from "../../types";

/**
 * حصص الموظفين من العمولات التي لم تُدفع كلها، و«دفع» في كل صف يفتح سند
 * صرف مخصصاً لها عند الأب.
 */
const emit = defineEmits<{ pay: [CommissionSplitRecord] }>();
const { can } = usePermissions();

const shares = ref<CommissionSplitRecord[]>([]);
const loading = ref(false);
const error = ref<string | null>(null);
async function load() {
  loading.value = true;
  error.value = null;
  try {
    shares.value = await commissionsService.listPayableSplits();
  } catch (cause) {
    error.value = getErrorMessage(cause);
  } finally {
    loading.value = false;
  }
}
onMounted(load);

defineExpose({ reload: load, shares });
</script>

<template>
  <div class="payable">
    <v-progress-linear v-if="loading && !shares.length" indeterminate />
    <v-alert v-else-if="error" type="error" variant="tonal">
      {{ error }}
      <template #append>
        <v-btn variant="text" size="small" @click="load">إعادة المحاولة</v-btn>
      </template>
    </v-alert>
    <v-empty-state
      v-else-if="!shares.length"
      icon="mdi-account-cash-outline"
      title="لا حصص مستحقة"
      text="حصص الموظفين من العمولات مدفوعة بالكامل."
    />
    <v-table v-else density="compact">
      <thead>
        <tr>
          <th scope="col">الموظف</th>
          <th scope="col">العمولة</th>
          <th scope="col">الصفقة</th>
          <th scope="col" class="payable__amount">الحصة</th>
          <th scope="col" class="payable__amount">المدفوع</th>
          <th scope="col" class="payable__amount">المتبقي</th>
          <th scope="col"><span class="d-sr-only">دفع</span></th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="share in shares" :key="share.id">
          <td>{{ share.user_name }}</td>
          <td>
            <router-link :to="`/accounting/commissions/${share.commission_id}`"
              ><bdi>{{ share.commission_code }}</bdi></router-link
            >
          </td>
          <td>
            <bdi>{{ share.deal_code ?? "—" }}</bdi>
          </td>
          <td class="payable__amount">
            <bdi>{{ formatAmount(share.amount, share.currency) }}</bdi>
          </td>
          <td class="payable__amount">
            <bdi>{{ formatAmount(share.paid, share.currency) }}</bdi>
          </td>
          <td class="payable__amount">
            <bdi>{{ formatAmount(share.outstanding, share.currency) }}</bdi>
          </td>
          <td class="text-end">
            <v-btn
              v-if="can('vouchers.payment')"
              variant="tonal"
              size="small"
              prepend-icon="mdi-cash-minus"
              @click="emit('pay', share)"
              >دفع</v-btn
            >
          </td>
        </tr>
      </tbody>
    </v-table>
  </div>
</template>

<style scoped>
.payable {
  padding: 8px 12px;
  overflow: auto;
}
.payable__amount {
  text-align: end;
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}
</style>
