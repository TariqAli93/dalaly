<script setup lang="ts">
import { onMounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import AppLayout from "../layouts/AppLayout.vue";
import PropertyDetailsPanel from "../components/properties/PropertyDetailsPanel.vue";
import { getProperty } from "../services/properties.service";
import { getErrorMessage } from "../services/api.service";
import { usePermissions } from "../composables/usePermissions";
import { useRefresh } from "../composables/useRefresh";
import { usePropertyActions } from "../composables/usePropertyActions";
import type { PropertyRecord } from "../types";
const route = useRoute();
const router = useRouter();
const { can } = usePermissions();
const { setRefreshHandler } = useRefresh();
const property = ref<PropertyRecord | null>(null);
const error = ref("");
const loading = ref(false);
let requestId = 0;
async function load() {
  const current = ++requestId;
  loading.value = true;
  error.value = "";
  try {
    const id = Number(route.params.id);
    if (!Number.isSafeInteger(id) || id <= 0)
      throw new Error("رقم العقار غير صالح.");
    const record = await getProperty(id);
    if (current === requestId) property.value = record;
  } catch (cause) {
    if (current === requestId) {
      property.value = null;
      error.value = getErrorMessage(cause);
    }
  } finally {
    if (current === requestId) loading.value = false;
  }
}
const { askArchive, askRestore, askDelete } = usePropertyActions(
  async (action) => {
    if (action === "delete") await router.push("/properties");
    else await load();
  },
);
function edit(record: PropertyRecord) {
  void router.push(`/properties/${record.id}/edit`);
}
watch(
  () => route.params.id,
  () => {
    property.value = null;
    void load();
  },
  { immediate: true },
);
onMounted(() => setRefreshHandler(load));
</script>
<template>
  <AppLayout
    :title="property?.name || 'تفاصيل العقار'"
    :subtitle="
      property ? `${property.code} · ${property.property_type}` : undefined
    "
  >
    <template #header-actions
      ><v-btn to="/properties" variant="text" prepend-icon="mdi-arrow-right"
        >العودة للعقارات</v-btn
      ><v-btn
        v-if="property && can('properties.update')"
        color="primary"
        prepend-icon="mdi-pencil-outline"
        @click="edit(property)"
        >تعديل العقار</v-btn
      ></template
    >
    <v-breadcrumbs
      :items="[
        { title: 'لوحة التحكم', to: '/' },
        { title: 'العروض العقارية', to: '/properties' },
        { title: 'تفاصيل العقار', disabled: true },
      ]"
      class="record-breadcrumbs"
    />
    <v-skeleton-loader v-if="loading && !property" type="image, article" />
    <v-alert v-else-if="error" type="error" variant="tonal"
      >{{ error
      }}<template #append
        ><v-btn @click="load" variant="text">إعادة المحاولة</v-btn></template
      ></v-alert
    >
    <PropertyDetailsPanel
      v-else-if="property"
      :key="property.id"
      :property="property"
      @edit="edit"
      @archive="askArchive"
      @restore="askRestore"
      @delete="askDelete"
    />
  </AppLayout>
</template>
