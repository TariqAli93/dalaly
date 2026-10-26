<script setup lang="ts">
import { computed, ref, useTemplateRef, watch } from "vue";
import { usePermissions } from "../../composables/usePermissions";
import { getPropertyAudit } from "../../services/properties.service";
import {
  formatDateTime,
  formatMoney,
  formatNumber,
  formatPlot,
} from "../../utils/format";
import { neighborhoodOf } from "../../utils/exportProperty";
import type { AuditLogRecord, PropertyRecord } from "../../types";
import AuditLogList from "./AuditLogList.vue";
import ListingImages from "../shared/ListingImages.vue";
import ListingFollowups from "../shared/ListingFollowups.vue";
import RecordNotes from "../shared/RecordNotes.vue";
import DetailList from "../shared/DetailList.vue";
import PropertyLocationView from "../shared/PropertyLocationView.vue";
import type { DetailSection } from "../shared/record";
import { getErrorMessage } from "../../services/api.service";
import { amenitiesText } from "../../utils/amenities";

/**
 * جسم صفحة العرض: تبويبات التفاصيل والموقع والمتابعات والملاحظات والسجل في
 * لوح، والصور في عمود جانبي ظاهر دائماً. هوية العرض وسعره ومالكه في شريط
 * RecordFacts فوقه، فلا تتكرّر هنا.
 */
const props = defineProps<{ property: PropertyRecord }>();
const emit = defineEmits<{ edit: [PropertyRecord] }>();

const { can } = usePermissions();

const tab = ref("details");
const mapVisited = ref(false);
const auditLogs = ref<AuditLogRecord[]>([]);
const auditLoading = ref(false);
const auditError = ref("");
let auditLoadedFor: number | null = null;
const followupsTab = useTemplateRef<{ reload: () => Promise<void> }>(
  "followups",
);

const address = computed(() =>
  [
    props.property.governorate || props.property.governorate_text,
    props.property.city,
    props.property.district || props.property.district_text,
    neighborhoodOf(props.property),
    props.property.address_details,
  ]
    .filter(Boolean)
    .join(" · "),
);

const money = (value: unknown) =>
  value !== null && value !== undefined && value !== ""
    ? `${formatMoney(value)} د.ع`
    : null;
// الواجهة والنزال نص حرّ: بعضها رقم وحده وبعضها يحمل وحدته ("25 م").
const meters = (value: unknown) =>
  value === null || value === undefined || value === ""
    ? null
    : /^\d+(\.\d+)?$/.test(String(value).trim())
      ? `${value} م`
      : String(value);

const sections = computed<DetailSection[]>(() => {
  const p = props.property;
  return [
    {
      title: "الموقع والقطعة",
      items: [
        { label: "المحافظة", value: p.governorate || p.governorate_text },
        { label: "المنطقة", value: p.district || p.district_text },
        { label: "الحي", value: neighborhoodOf(p) },
        { label: "المحلة", value: p.mahalla },
        {
          label: "المقاطعة",
          value: [p.subdistrict_number, p.subdistrict_name]
            .filter(Boolean)
            .join(" · "),
        },
        {
          label: "رقم القطعة",
          value: formatPlot(p.plot_number, p.plot_letter),
        },
        { label: "الزقاق", value: p.alley },
        { label: "رقم الدار", value: p.house_number },
        { label: "أقرب معلم", value: p.nearest_landmark },
        { label: "العنوان التفصيلي", value: p.address_details },
        { label: "المدينة", value: p.city },
      ],
    },
    {
      title: "المساحة والسعر",
      items: [
        { label: "نوع العقار", value: p.property_type },
        { label: "الصفة القانونية", value: p.legal_type },
        {
          label: "المساحة",
          value: `${formatNumber(p.area_value)} ${p.area_unit ?? ""}`.trim(),
        },
        { label: "الواجهة", value: meters(p.frontage) },
        { label: "النزال / العمق", value: meters(p.nazal) },
        { label: "عرض الشارع", value: meters(p.street_width) },
        { label: "طريقة التسعير", value: p.pricing_method },
        { label: "سعر الوحدة", value: money(p.unit_price) },
        { label: "السعر الكلي", value: money(p.total_price) },
        { label: "قابل للتفاوض", value: p.is_negotiable ? "نعم" : "لا" },
      ],
    },
    {
      title: "المواصفات",
      items: [
        { label: "عدد الغرف", value: p.rooms_count },
        { label: "عدد الحمامات", value: p.bathrooms_count },
        { label: "المميزات", value: amenitiesText(p.amenities) },
      ],
    },
    {
      title: "التواريخ",
      items: [
        { label: "تاريخ الإضافة", value: formatDateTime(p.created_at) },
        { label: "آخر تحديث", value: formatDateTime(p.updated_at) },
        {
          label: "تاريخ الأرشفة",
          value: p.archived_at ? formatDateTime(p.archived_at) : null,
        },
      ],
    },
  ];
});

async function loadAudit(id: number) {
  if (!can("audit.read")) return;
  auditLoadedFor = id;
  auditLoading.value = true;
  auditError.value = "";
  try {
    auditLogs.value = await getPropertyAudit(id);
  } catch (cause) {
    auditLogs.value = [];
    auditError.value = getErrorMessage(cause);
  } finally {
    auditLoading.value = false;
  }
}

// الخريطة والسجل يُحمَّلان عند أول فتح لتبويبهما، لا مع كل فتح للصفحة.
watch(tab, (value) => {
  if (value === "map") mapVisited.value = true;
  if (value === "audit" && auditLoadedFor !== props.property.id)
    void loadAudit(props.property.id);
});
watch(
  () => props.property.id,
  () => {
    tab.value = "details";
    mapVisited.value = false;
    auditLoadedFor = null;
    auditLogs.value = [];
  },
);

/** بعد «تسجيل متابعة» من شريط الأوامر: يحدّث التبويب إن كان مركّباً. */
function followupSaved() {
  void followupsTab.value?.reload();
}
defineExpose({ followupSaved });
</script>

<template>
  <div class="listing-record">
    <section class="dal-panel" aria-label="بيانات العرض">
      <v-tabs v-model="tab" color="primary" show-arrows>
        <v-tab value="details">التفاصيل</v-tab>
        <v-tab value="map">الموقع</v-tab>
        <v-tab v-if="can('followups.read')" value="followups">المتابعات</v-tab>
        <v-tab value="notes">الملاحظات</v-tab>
        <v-tab v-if="can('audit.read')" value="audit">السجل</v-tab>
      </v-tabs>
      <v-divider />
      <v-window v-model="tab" class="listing-record__body">
        <v-window-item value="details">
          <DetailList :sections="sections" />
        </v-window-item>
        <v-window-item value="map">
          <PropertyLocationView
            v-if="mapVisited"
            :key="property.id"
            :active="tab === 'map'"
            :address="address"
            :property-name="property.name || `عقار ${property.code}`"
            :latitude="property.latitude"
            :longitude="property.longitude"
            :location-link="property.location_link"
            :can-edit="can('properties.update')"
            @edit="emit('edit', property)"
          />
        </v-window-item>
        <v-window-item v-if="can('followups.read')" value="followups">
          <ListingFollowups
            ref="followups"
            kind="sale"
            :listing-id="property.id"
          />
        </v-window-item>
        <v-window-item value="notes">
          <RecordNotes
            :notes="[
              { label: 'ملاحظات العقار', text: property.notes },
              { label: 'ملاحظات المالك', text: property.owner_notes },
            ]"
            :updated-at="property.updated_at"
            :can-edit="can('properties.update')"
            @edit="emit('edit', property)"
          />
        </v-window-item>
        <v-window-item v-if="can('audit.read')" value="audit">
          <v-alert v-if="auditError" type="error" variant="tonal"
            >{{ auditError
            }}<template #append
              ><v-btn variant="text" @click="loadAudit(property.id)"
                >إعادة المحاولة</v-btn
              ></template
            ></v-alert
          >
          <AuditLogList v-else :logs="auditLogs" :loading="auditLoading" />
        </v-window-item>
      </v-window>
    </section>

    <aside class="dal-panel" aria-labelledby="media-title">
      <div class="dal-panel__header">
        <h2 id="media-title" class="dal-section-title">الصور</h2>
      </div>
      <div class="listing-record__media">
        <ListingImages
          kind="sale"
          :listing-id="property.id"
          :can-manage="can('properties.images.manage')"
        />
      </div>
    </aside>
  </div>
</template>
