<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import AppLayout from "../layouts/AppLayout.vue";
import { usePermissions } from "../composables/usePermissions";
import { useRefresh } from "../composables/useRefresh";
import * as contractsService from "../services/contracts.service";
import { getErrorMessage } from "../services/api.service";
import { formatMoney } from "../utils/format";
import type { ContractRecord } from "../types";
defineProps<{ reviewMode?: boolean }>();
const router = useRouter(),
  route = useRoute();
const { can } = usePermissions();
const { setRefreshHandler } = useRefresh();
const rows = ref<ContractRecord[]>([]),
  loading = ref(false),
  error = ref("");
const search = ref(""),
  kind = ref<string | null>(null),
  status = ref<string | null>(null);
const filtered = computed(() =>
  rows.value.filter(
    (row) =>
      (!kind.value || row.contract_type === kind.value) &&
      (!status.value || row.status === status.value) &&
      [
        row.code,
        row.property_name,
        row.party_names?.join(" "),
        row.primary_person_name,
      ]
        .join(" ")
        .toLocaleLowerCase()
        .includes((search.value ?? "").trim().toLocaleLowerCase()),
  ),
);
const headers = [
  { title: "رقم العقد", key: "code" },
  { title: "النوع", key: "contract_type" },
  { title: "العقار", key: "property_name" },
  { title: "أطراف العقد", key: "party_names" },
  { title: "تاريخ الإنشاء", key: "created_at" },
  { title: "المبلغ الإجمالي", key: "amount" },
  { title: "الحالة", key: "status" },
  { title: "آخر تعديل", key: "updated_at" },
  { title: "الإجراءات", key: "actions", sortable: false },
];
const states = [
  { title: "مسودة", value: "draft" },
  { title: "صادر", value: "active" },
  { title: "ملغى", value: "cancelled" },
  { title: "مكتمل سابقاً", value: "completed" },
  { title: "منتهي سابقاً", value: "expired" },
];
const label = (value: string) =>
  states.find((s) => s.value === value)?.title ?? value;
const color = (value: string) =>
  value === "draft" ? "warning" : value === "cancelled" ? "error" : "success";
const date = (value?: string) =>
  value
    ? new Date(value).toLocaleDateString("ar-IQ", { timeZone: "Asia/Baghdad" })
    : "—";
async function load() {
  loading.value = true;
  error.value = "";
  try {
    rows.value = (await contractsService.listContracts()).filter((row) =>
      ["sale", "rental"].includes(row.contract_type),
    );
  } catch (cause) {
    error.value = getErrorMessage(cause);
  } finally {
    loading.value = false;
  }
}
function review(id: number) {
  void router.push(`/contracts/${id}/review`);
}
watch(
  () => route.query.view,
  (value) => {
    const id = Number(value);
    if (Number.isSafeInteger(id) && id > 0)
      void router.replace(`/contracts/${id}/review`);
  },
  { immediate: true },
);
onMounted(() => {
  setRefreshHandler(load);
  void load();
});
</script>
<template>
  <AppLayout
    :title="reviewMode ? 'مراجعة العقود' : 'جميع العقود'"
    subtitle="مراجعة المسودات والنسخ الصادرة والأرشيف الملغى مع الاحتفاظ بالسجل التاريخي."
  >
    <template #header-actions
      ><v-btn
        v-if="can('contracts.manage')"
        to="/contracts/create"
        color="primary"
        prepend-icon="mdi-file-document-plus-outline"
        >إنشاء عقد</v-btn
      ></template
    >
    <v-alert v-if="error" type="error" variant="tonal" class="mb-4"
      >{{ error
      }}<v-btn variant="text" @click="load">إعادة المحاولة</v-btn></v-alert
    >
    <v-card variant="flat" border>
      <v-card-text
        ><v-row>
          <v-col cols="12" md="6"
            ><v-text-field
              v-model="search"
              label="البحث برقم العقد أو العقار أو الأطراف"
              prepend-inner-icon="mdi-magnify"
              hide-details
              clearable
          /></v-col>
          <v-col cols="6" md="3"
            ><v-select
              v-model="kind"
              label="نوع العقد"
              :items="[
                { title: 'بيع', value: 'sale' },
                { title: 'إيجار', value: 'rental' },
              ]"
              clearable
              hide-details
          /></v-col>
          <v-col cols="6" md="3"
            ><v-select
              v-model="status"
              label="حالة العقد"
              :items="states"
              clearable
              hide-details
          /></v-col> </v-row
      ></v-card-text>
      <v-data-table
        :headers="headers"
        :items="filtered"
        :loading="loading"
        item-value="id"
        density="comfortable"
        no-data-text="لا توجد عقود مطابقة"
        loading-text="جارٍ تحميل العقود…"
      >
        <template #item.code="{ item }"
          ><v-btn variant="text" @click="review(item.id)">{{
            item.code
          }}</v-btn></template
        >
        <template #item.contract_type="{ item }">{{
          item.contract_type === "rental" ? "إيجار" : "بيع"
        }}</template>
        <template #item.property_name="{ item }">{{
          item.property_name || "—"
        }}</template>
        <template #item.party_names="{ item }">{{
          item.party_names?.join(" — ") || item.primary_person_name || "—"
        }}</template>
        <template #item.created_at="{ item }">{{
          date(item.created_at)
        }}</template>
        <template #item.updated_at="{ item }">{{
          date(item.updated_at)
        }}</template>
        <template #item.amount="{ item }">{{
          formatMoney(item.amount ?? 0)
        }}</template>
        <template #item.status="{ item }"
          ><v-chip :color="color(item.status)" size="small" variant="tonal">{{
            label(item.status)
          }}</v-chip></template
        >
        <template #item.actions="{ item }"
          ><v-btn
            variant="text"
            prepend-icon="mdi-eye-outline"
            @click="review(item.id)"
            >مراجعة</v-btn
          ><v-menu v-if="item.status === 'draft' && can('contracts.manage')"
            ><template #activator="{ props }"
              ><v-btn
                v-bind="props"
                icon="mdi-dots-horizontal"
                variant="text"
                aria-label="إجراءات إضافية" /></template
            ><v-list
              ><v-list-item
                title="تعديل المسودة"
                prepend-icon="mdi-pencil"
                :to="`/contracts/${item.id}/edit`" /></v-list></v-menu
        ></template>
      </v-data-table>
    </v-card>
  </AppLayout>
</template>
