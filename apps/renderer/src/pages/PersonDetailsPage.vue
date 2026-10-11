<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { useRoute } from "vue-router";
import AppLayout from "../layouts/AppLayout.vue";
import PersonEditor from "../components/people/PersonEditor.vue";
import LinkedContracts from "../components/contracts/LinkedContracts.vue";
import RecordNotes from "../components/shared/RecordNotes.vue";
import EmptyState from "../components/shared/EmptyState.vue";
import StatusChip from "../components/shared/StatusChip.vue";
import * as peopleService from "../services/people.service";
import * as propertiesService from "../services/properties.service";
import { getErrorMessage } from "../services/api.service";
import { usePermissions } from "../composables/usePermissions";
import { useRefresh } from "../composables/useRefresh";
import type { PersonRecord, PropertyRecord } from "../types";
import { personStatusLabel } from "../constants/crm";
const route = useRoute();
const { can } = usePermissions();
const { setRefreshHandler } = useRefresh();
const person = ref<PersonRecord | null>(null);
const loading = ref(false);
const error = ref("");
const propertyError = ref("");
const properties = ref<PropertyRecord[]>([]);
const search = ref("");
const propertyRows = computed(() =>
  properties.value.map((property) => ({
    ...property,
    location: [property.governorate, property.district, property.neighborhood]
      .filter(Boolean)
      .join(" · "),
    area: `${property.area_value} ${property.area_unit}`,
  })),
);
const tab = ref("basic");
const editOpen = ref(false);
let requestId = 0;
const personType = computed(() =>
  person.value?.person_type === "company"
    ? "شركة"
    : person.value?.person_type === "individual"
      ? "فرد"
      : "أخرى",
);
const info = computed(() =>
  person.value
    ? [
        {
          title: "بيانات الاتصال",
          fields: [
            ["الهاتف الأساسي", person.value.phone_primary],
            ["هاتف إضافي", person.value.phone_secondary],
            ["البريد الإلكتروني", person.value.email],
            ["العنوان", person.value.address],
          ],
        },
        {
          title: "بيانات الشخص",
          fields: [
            ["الاسم الكامل", person.value.full_name],
            ["الرمز", person.value.code],
            ["نوع الشخص", personType.value],
            ["رقم الهوية", person.value.national_id],
            ["تاريخ الإضافة", when(person.value.created_at)],
            ["آخر تحديث", when(person.value.updated_at)],
          ],
        },
      ]
    : [],
);
const headers = [
  { title: "العقار", key: "name" },
  { title: "النوع", key: "property_type" },
  { title: "الموقع", key: "location" },
  { title: "المساحة", key: "area" },
  { title: "الحالة", key: "status" },
];
function when(value: string) {
  return new Date(value).toLocaleString("ar-IQ", { numberingSystem: "latn" });
}
async function load() {
  const current = ++requestId;
  loading.value = true;
  error.value = "";
  propertyError.value = "";
  person.value = null;
  properties.value = [];
  try {
    const id = Number(route.params.id);
    if (!Number.isSafeInteger(id) || id <= 0)
      throw new Error("رقم العميل غير صالح.");
    const record = await peopleService.getPerson(id);
    if (current !== requestId) return;
    person.value = record;
    if (can("properties.read")) {
      try {
        const [active, archived] = await Promise.all([
          propertiesService.listProperties(),
          propertiesService.listProperties({ status: "archived" }),
        ]);
        if (current === requestId)
          properties.value = [
            ...new Map(
              [...active, ...archived]
                .filter((property) => property.owner_person_id === id)
                .map((property) => [property.id, property]),
            ).values(),
          ];
      } catch (cause) {
        if (current === requestId) propertyError.value = getErrorMessage(cause);
      }
    }
  } catch (cause) {
    if (current === requestId) error.value = getErrorMessage(cause);
  } finally {
    if (current === requestId) loading.value = false;
  }
}
watch(
  () => route.params.id,
  () => {
    tab.value = "basic";
    void load();
  },
  { immediate: true },
);
onMounted(() => setRefreshHandler(load));
</script>
<template>
  <AppLayout
    :title="person?.full_name ?? 'تفاصيل العميل'"
    :subtitle="person ? `ملف العميل · ${person.code}` : undefined"
  >
    <template #header-actions
      ><v-btn to="/people" variant="text" prepend-icon="mdi-arrow-right"
        >العودة للعملاء</v-btn
      ><v-btn
        v-if="person && can('people.update')"
        color="primary"
        prepend-icon="mdi-pencil-outline"
        @click="editOpen = true"
        >تعديل العميل</v-btn
      ></template
    >
    <v-breadcrumbs
      :items="[
        { title: 'لوحة التحكم', to: '/' },
        { title: 'العملاء والأشخاص', to: '/people' },
        { title: 'تفاصيل العميل', disabled: true },
      ]"
      class="record-breadcrumbs"
    />
    <v-skeleton-loader v-if="loading && !person" type="article, table" />
    <v-alert v-else-if="error" type="error" variant="tonal"
      >{{ error
      }}<template #append
        ><v-btn @click="load" variant="text">إعادة المحاولة</v-btn></template
      ></v-alert
    >
    <template v-else-if="person">
      <v-card variant="flat" border class="mb-4"
        ><v-card-text class="d-flex align-center flex-wrap ga-4"
          ><v-avatar color="primary" variant="tonal" size="64">{{
            person.full_name.slice(0, 2)
          }}</v-avatar>
          <div>
            <h2 class="text-h6">{{ person.full_name }}</h2>
            <p class="text-medium-emphasis">
              <bdi>{{ person.phone_primary || "لم يُسجل هاتف" }}</bdi>
            </p>
          </div>
          <v-spacer /><v-chip variant="tonal">{{ personType }}</v-chip
          ><StatusChip
            :status="person.status"
            :label="personStatusLabel(person.status)" /></v-card-text
      ></v-card>
      <v-card variant="flat" border class="mb-4"
        ><v-tabs v-model="tab" color="primary" show-arrows
          ><v-tab value="basic">المعلومات الأساسية</v-tab
          ><v-tab value="properties">العقارات المرتبطة</v-tab
          ><v-tab value="contracts">العقود</v-tab
          ><v-tab value="notes">الملاحظات</v-tab></v-tabs
        ></v-card
      >
      <v-window v-model="tab">
        <v-window-item value="basic"
          ><v-row
            ><v-col
              v-for="section in info"
              :key="section.title"
              cols="12"
              md="6"
              ><v-card variant="flat" border height="100%"
                ><v-card-title>{{ section.title }}</v-card-title
                ><v-card-text
                  ><dl class="record-info">
                    <div
                      v-for="[label, value] in section.fields"
                      :key="label ?? ''"
                    >
                      <dt>{{ label }}</dt>
                      <dd>
                        <bdi>{{ value || "—" }}</bdi>
                      </dd>
                    </div>
                  </dl></v-card-text
                ></v-card
              ></v-col
            ></v-row
          ></v-window-item
        >
        <v-window-item value="properties"
          ><v-card variant="flat" border
            ><EmptyState
              v-if="!can('properties.read')"
              icon="mdi-lock-outline"
              title="عرض العقارات غير متاح"
              text="تحتاج إلى صلاحية عرض العقارات." /><v-alert
              v-else-if="propertyError"
              type="error"
              variant="tonal"
              class="ma-4"
              >{{ propertyError
              }}<template #append
                ><v-btn variant="text" @click="load"
                  >إعادة المحاولة</v-btn
                ></template
              ></v-alert
            ><template v-else
              ><v-card-text
                ><v-text-field
                  v-model="search"
                  label="البحث في العقارات المرتبطة"
                  prepend-inner-icon="mdi-magnify"
                  clearable
                  hide-details /></v-card-text
              ><v-data-table
                :headers="headers"
                :items="propertyRows"
                :search="search"
                :loading="loading"
                ><template #item.name="{ item }"
                  ><router-link
                    :to="`/properties/${item.id}`"
                    class="record-link"
                    >{{ item.name || item.code }}</router-link
                  >
                  <p class="text-caption text-medium-emphasis">
                    <bdi>{{ item.code }}</bdi>
                  </p></template
                ><template #item.location="{ item }">{{
                  [item.governorate, item.district, item.neighborhood]
                    .filter(Boolean)
                    .join(" · ") || "—"
                }}</template
                ><template #item.area="{ item }"
                  ><bdi>{{ item.area_value }}</bdi>
                  {{ item.area_unit }}</template
                ><template #item.status="{ item }"
                  ><StatusChip :status="item.status" /></template
                ><template #no-data
                  ><EmptyState
                    icon="mdi-home-search-outline"
                    title="لا توجد عقارات مطابقة"
                    text="تظهر العقارات المرتبطة بالشخص بصفة المالك المسجّل." /></template></v-data-table></template></v-card
        ></v-window-item>
        <v-window-item value="contracts"
          ><LinkedContracts :key="person.id" :person-id="person.id"
        /></v-window-item>
        <v-window-item value="notes"
          ><RecordNotes
            :notes="[{ label: 'ملاحظات العميل', text: person.notes }]"
            :updated-at="person.updated_at"
            :can-edit="can('people.update')"
            @edit="editOpen = true"
        /></v-window-item>
      </v-window>
      <PersonEditor v-model="editOpen" :person="person" @saved="load" />
    </template>
  </AppLayout>
</template>
