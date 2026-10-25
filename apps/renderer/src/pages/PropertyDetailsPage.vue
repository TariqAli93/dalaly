<script setup lang="ts">
import { computed, onMounted, ref, useTemplateRef, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import AppPage from "../components/app/AppPage.vue";
import PropertyDetailsPanel from "../components/properties/PropertyDetailsPanel.vue";
import PropertyExportMenu from "../components/properties/PropertyExportMenu.vue";
import RecordFacts from "../components/shared/RecordFacts.vue";
import PhoneLink from "../components/shared/PhoneLink.vue";
import StatusChip from "../components/shared/StatusChip.vue";
import RecordFollowupDialog from "../components/shared/RecordFollowupDialog.vue";
import type { RecordFact } from "../components/shared/record";
import { getProperty } from "../services/properties.service";
import { getErrorMessage } from "../services/api.service";
import { usePermissions } from "../composables/usePermissions";
import { useRefresh } from "../composables/useRefresh";
import { usePropertyActions } from "../composables/usePropertyActions";
import { formatMoney, formatNumber, formatPlot } from "../utils/format";
import { neighborhoodOf } from "../utils/exportProperty";
import { DIRECT_PRICE } from "../constants/domain";
import type { FollowupTarget, PropertyRecord } from "../types";

const route = useRoute();
const router = useRouter();
const { can } = usePermissions();
const { setRefreshHandler } = useRefresh();
const property = ref<PropertyRecord | null>(null);
const error = ref("");
const loading = ref(false);
const followupOpen = ref(false);
const panel = useTemplateRef<{ followupSaved: () => void }>("panel");
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

const title = computed(() =>
  property.value
    ? property.value.name || `عقار ${property.value.code}`
    : "تفاصيل العقار",
);
// الاسم الافتراضي يحمل الرمز، فلا يُكرَّر بجانبه.
const showCode = computed(
  () => property.value && !title.value.includes(property.value.code),
);

// شريط الهوية: ما يحتاجه الوسيط والزبون على الهاتف، ظاهر دون تمرير.
const facts = computed<RecordFact[]>(() => {
  const p = property.value;
  if (!p) return [];
  const perUnit = p.pricing_method !== DIRECT_PRICE && p.unit_price;
  const plot = formatPlot(p.plot_number, p.plot_letter);
  const subdistrict = [p.subdistrict_number, p.subdistrict_name]
    .filter(Boolean)
    .join(" · ");
  return [
    {
      key: "price",
      label: "السعر الكلي",
      value: `${formatMoney(p.total_price)} د.ع`,
      hint: perUnit
        ? `${formatMoney(p.unit_price)} د.ع لكل ${p.area_unit}`
        : p.is_negotiable
          ? "قابل للتفاوض"
          : null,
      emphasis: true,
    },
    {
      key: "plot",
      label: "القطعة",
      value: plot ? `قطعة ${plot}` : null,
      hint: subdistrict ? `مقاطعة ${subdistrict}` : null,
    },
    {
      key: "location",
      label: "الموقع",
      value: [p.governorate, p.district, neighborhoodOf(p)]
        .filter(Boolean)
        .join(" · "),
      hint: p.nearest_landmark,
    },
    { key: "owner", label: "المالك", value: p.owner_name },
    {
      key: "area",
      label: "المساحة",
      value: `${formatNumber(p.area_value)} ${p.area_unit ?? ""}`.trim(),
      hint: [p.property_type, p.legal_type].filter(Boolean).join(" · "),
    },
  ];
});

const followupTarget = computed<FollowupTarget | null>(() =>
  property.value
    ? {
        kind: "sale",
        listingId: property.value.id,
        listingLabel: title.value,
      }
    : null,
);
</script>

<template>
  <AppPage :title="title" :parent="{ to: '/properties', label: 'عروض البيع' }">
    <template v-if="property" #status>
      <bdi v-if="showCode" class="text-medium-emphasis">{{
        property.code
      }}</bdi>
      <StatusChip :status="property.status" />
    </template>
    <template v-if="property" #header-actions>
      <v-btn
        v-if="can('properties.update')"
        color="primary"
        prepend-icon="mdi-pencil-outline"
        @click="edit(property)"
        >تعديل</v-btn
      >
      <v-btn
        v-if="can('followups.create')"
        variant="text"
        prepend-icon="mdi-phone-plus-outline"
        @click="followupOpen = true"
        >تسجيل متابعة</v-btn
      >
      <PropertyExportMenu
        v-if="can('properties.export')"
        :property="property"
        variant="text"
      />
      <v-menu
        v-if="
          can('properties.archive') ||
          can('properties.restore') ||
          can('properties.delete')
        "
        location="bottom end"
      >
        <template #activator="{ props: menu }">
          <v-btn
            v-bind="menu"
            icon="mdi-dots-horizontal"
            variant="text"
            aria-label="أوامر أخرى للعرض"
            title="أوامر أخرى"
          />
        </template>
        <v-list density="compact" min-width="200">
          <v-list-item
            v-if="property.status === 'archived' && can('properties.restore')"
            prepend-icon="mdi-archive-arrow-up-outline"
            title="إرجاع من الأرشيف"
            @click="askRestore(property)"
          />
          <v-list-item
            v-else-if="
              property.status !== 'archived' && can('properties.archive')
            "
            prepend-icon="mdi-archive-arrow-down-outline"
            title="أرشفة"
            @click="askArchive(property)"
          />
          <template v-if="can('properties.delete')">
            <v-divider />
            <v-list-item
              prepend-icon="mdi-delete-outline"
              title="حذف"
              base-color="error"
              @click="askDelete(property)"
            />
          </template>
        </v-list>
      </v-menu>
    </template>

    <v-skeleton-loader
      v-if="loading && !property"
      type="table-heading, image"
    />
    <v-alert v-else-if="error" type="error" variant="tonal"
      >{{ error
      }}<template #append
        ><v-btn variant="text" @click="load">إعادة المحاولة</v-btn></template
      ></v-alert
    >
    <template v-else-if="property">
      <RecordFacts :facts="facts" label="هوية العرض">
        <template #owner>
          <router-link
            v-if="property.owner_person_id && can('people.read')"
            :to="`/clients/${property.owner_person_id}`"
            class="record-link"
            >{{ property.owner_name }}</router-link
          >
          <span v-else>{{ property.owner_name || "—" }}</span>
          <PhoneLink
            :phone="property.owner_phone"
            :name="property.owner_name"
          />
        </template>
      </RecordFacts>
      <PropertyDetailsPanel
        ref="panel"
        :key="property.id"
        :property="property"
        @edit="edit"
      />
    </template>
    <RecordFollowupDialog
      v-model="followupOpen"
      :target="followupTarget"
      @saved="panel?.followupSaved()"
    />
  </AppPage>
</template>
