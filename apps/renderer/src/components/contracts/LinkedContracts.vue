<script setup lang="ts">
import { computed, ref, watch } from "vue";
import * as contractsService from "../../services/contracts.service";
import { getErrorMessage } from "../../services/api.service";
import { usePermissions } from "../../composables/usePermissions";
import { formatMoney, toNumber } from "../../utils/format";
import { remainingAmount } from "./contract-form";
import { statusColor } from "../../constants/domain";
import { contractStatusLabel, contractTypeLabel } from "../../constants/crm";
import EmptyState from "../shared/EmptyState.vue";
import type { ContractBundle } from "../../types";
const props = defineProps<{ personId?: number; propertyId?: number }>();
const { can } = usePermissions();
const bundles = ref<ContractBundle[]>([]);
const loading = ref(false);
const error = ref("");
let requestId = 0;
const headers = [
  { title: "رقم العقد", key: "code" },
  { title: "النوع", key: "contract_type" },
  { title: "العقارات", key: "assets", sortable: false },
  { title: "الأطراف", key: "people", sortable: false },
  { title: "المبلغ (د.ع)", key: "amount" },
  { title: "المدفوع (د.ع)", key: "paid_amount" },
  { title: "المتبقي (د.ع)", key: "remaining", sortable: false },
  { title: "تاريخ العقد", key: "contract_date" },
  { title: "الحالة", key: "status" },
];
const rows = computed(() =>
  bundles.value.map((bundle) => ({
    ...bundle.contract,
    remaining: remainingAmount(
      toNumber(bundle.contract.amount),
      bundle.contract.paid_amount,
    ),
    assets: (bundle.assets?.length
      ? bundle.assets
      : bundle.asset
        ? [bundle.asset]
        : []
    ).map((asset) => ({
      id: asset.source_id,
      type: asset.source_type,
      label: String(asset.data.name || asset.data.code || asset.source_id),
    })),
    people: bundle.parties
      .map((party) => party.snapshot?.full_name ?? party.person.full_name)
      .join(" · "),
  })),
);
async function load() {
  const current = ++requestId;
  bundles.value = [];
  if (!can("contracts.read")) return;
  loading.value = true;
  error.value = "";
  try {
    const records = (
      await contractsService.listContracts({
        person_id: props.personId,
        property_id: props.propertyId,
      })
    ).filter(
      (record) =>
        record.contract_type === "sale" || record.contract_type === "rental",
    );
    const result: ContractBundle[] = [];
    for (let offset = 0; offset < records.length; offset += 6) {
      result.push(
        ...(await Promise.all(
          records
            .slice(offset, offset + 6)
            .map((record) => contractsService.getContract(record.id)),
        )),
      );
      if (current !== requestId) return;
    }
    if (current === requestId) bundles.value = result;
  } catch (cause) {
    if (current === requestId) error.value = getErrorMessage(cause);
  } finally {
    if (current === requestId) loading.value = false;
  }
}
watch(() => [props.personId, props.propertyId], load, { immediate: true });
</script>
<template>
  <v-card variant="flat" border>
    <EmptyState
      v-if="!can('contracts.read')"
      icon="mdi-lock-outline"
      title="عرض العقود غير متاح"
      text="تحتاج إلى صلاحية عرض العقود للوصول إلى هذه البيانات."
    />
    <v-alert v-else-if="error" type="error" variant="tonal" class="ma-4"
      >{{ error
      }}<template #append
        ><v-btn variant="text" @click="load">إعادة المحاولة</v-btn></template
      ></v-alert
    >
    <v-data-table
      v-else
      :headers="headers"
      :items="rows"
      :loading="loading"
      item-value="id"
    >
      <template #item.code="{ item }"
        ><router-link
          :to="{ path: '/contracts', query: { view: item.id } }"
          class="record-link"
          ><bdi>{{ item.code }}</bdi></router-link
        ></template
      >
      <template #item.contract_type="{ item }">{{
        contractTypeLabel(item.contract_type)
      }}</template>
      <template #item.assets="{ item }"
        ><div v-for="asset in item.assets" :key="asset.type + asset.id">
          <router-link
            v-if="asset.type === 'property' && can('properties.read')"
            :to="`/properties/${asset.id}`"
            class="record-link"
            >{{ asset.label }}</router-link
          ><span v-else>{{ asset.label }}</span>
        </div></template
      >
      <template #item.amount="{ item }"
        ><bdi>{{ formatMoney(item.amount) }}</bdi></template
      >
      <template #item.paid_amount="{ item }"
        ><bdi>{{ formatMoney(item.paid_amount) }}</bdi></template
      >
      <template #item.remaining="{ item }"
        ><bdi>{{ formatMoney(item.remaining) }}</bdi></template
      >
      <template #item.contract_date="{ item }"
        ><bdi>{{ item.contract_date.slice(0, 10) }}</bdi></template
      >
      <template #item.status="{ item }"
        ><v-chip
          size="small"
          variant="tonal"
          :color="statusColor(item.status)"
          >{{ contractStatusLabel(item.status) }}</v-chip
        ></template
      >
      <template #no-data
        ><EmptyState
          icon="mdi-file-document-outline"
          title="لا توجد عقود مرتبطة"
          text="تظهر هنا عقود البيع والإيجار المرتبطة بهذا السجل."
      /></template>
    </v-data-table>
  </v-card>
</template>
