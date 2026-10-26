<script setup lang="ts">
import { computed, ref, useTemplateRef, watch } from "vue";
import { usePermissions } from "../../composables/usePermissions";
import { getRentalAudit } from "../../services/rentals.service";
import { getErrorMessage } from "../../services/api.service";
import { formatDateTime, formatMoney, formatNumber } from "../../utils/format";
import { amenitiesText } from "../../utils/amenities";
import {
  RENT_PERIOD_LABELS,
  RENTAL_PROPERTY_LABELS,
} from "../../constants/domain";
import type { AuditLogRecord, RentalRecord } from "../../types";
import AuditLogList from "../properties/AuditLogList.vue";
import ListingImages from "../shared/ListingImages.vue";
import ListingFollowups from "../shared/ListingFollowups.vue";
import RecordNotes from "../shared/RecordNotes.vue";
import DetailList from "../shared/DetailList.vue";
import PropertyLocationView from "../shared/PropertyLocationView.vue";
import type { DetailSection } from "../shared/record";

/**
 * جسم صفحة العرض الإيجاري، بتخطيط صفحة عرض البيع نفسه: تبويبات التفاصيل
 * والموقع والمتابعات والملاحظات والسجل في لوح، والصور في عمود ظاهر دائماً.
 * السعر والمالك والموقع في شريط RecordFacts فوقه.
 */
const props = defineProps<{ rental: RentalRecord }>();
const emit = defineEmits<{ edit: [RentalRecord] }>();

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

const locationLine = computed(() =>
  [
    props.rental.governorate,
    props.rental.district,
    props.rental.neighborhood,
    props.rental.address_details,
  ]
    .filter(Boolean)
    .join(" · "),
);

const sections = computed<DetailSection[]>(() => {
  const r = props.rental;
  return [
    {
      title: "الإيجار",
      items: [
        {
          label: "نوع العقار",
          value: RENTAL_PROPERTY_LABELS[r.property_type] ?? r.property_type,
        },
        {
          label: "نوع الإيجار",
          value: RENT_PERIOD_LABELS[r.rent_period] ?? r.rent_period,
        },
        { label: "سعر الإيجار", value: `${formatMoney(r.rent_price)} د.ع` },
        { label: "قابل للتفاوض", value: r.is_negotiable ? "نعم" : "لا" },
      ],
    },
    {
      title: "الموقع",
      items: [
        { label: "المحافظة", value: r.governorate },
        { label: "المنطقة", value: r.district },
        { label: "الحي", value: r.neighborhood },
        { label: "العنوان التفصيلي", value: r.address_details },
      ],
    },
    {
      title: "المواصفات",
      items: [
        {
          label: "المساحة",
          value: `${formatNumber(r.area_value)} ${r.area_unit ?? ""}`.trim(),
        },
        { label: "عدد الطوابق", value: r.floors_count },
        { label: "عدد الغرف", value: r.rooms_count },
        { label: "عدد الحمامات", value: r.bathrooms_count },
        { label: "المميزات", value: amenitiesText(r.amenities) },
      ],
    },
    {
      title: "التواريخ",
      items: [
        { label: "تاريخ الإضافة", value: formatDateTime(r.created_at) },
        { label: "آخر تحديث", value: formatDateTime(r.updated_at) },
        {
          label: "تاريخ الأرشفة",
          value: r.archived_at ? formatDateTime(r.archived_at) : null,
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
    auditLogs.value = await getRentalAudit(id);
  } catch (cause) {
    auditLogs.value = [];
    auditError.value = getErrorMessage(cause);
  } finally {
    auditLoading.value = false;
  }
}

// الخريطة والسجل يُحمَّلان عند أول فتح لتبويبهما.
watch(tab, (value) => {
  if (value === "map") mapVisited.value = true;
  if (value === "audit" && auditLoadedFor !== props.rental.id)
    void loadAudit(props.rental.id);
});
watch(
  () => props.rental.id,
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
    <section class="dal-panel" aria-label="بيانات العرض الإيجاري">
      <v-tabs v-model="tab" color="primary" show-arrows>
        <v-tab value="details">التفاصيل</v-tab>
        <v-tab value="map">الموقع</v-tab>
        <v-tab v-if="can('rentals.followups.read')" value="followups"
          >المتابعات</v-tab
        >
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
            :key="rental.id"
            :active="tab === 'map'"
            :address="locationLine"
            :property-name="rental.name || `إيجار ${rental.code}`"
            :latitude="rental.latitude"
            :longitude="rental.longitude"
            :location-link="rental.location_link"
            :can-edit="can('rentals.update')"
            @edit="emit('edit', rental)"
          />
        </v-window-item>
        <v-window-item v-if="can('rentals.followups.read')" value="followups">
          <ListingFollowups
            ref="followups"
            kind="rental"
            :listing-id="rental.id"
          />
        </v-window-item>
        <v-window-item value="notes">
          <!-- الحقول الثلاثة كلها: كانت «تفاصيل أخرى» تختفي متى وُجدت ملاحظات،
               وملاحظات المالك لا تظهر في أي مكان. -->
          <RecordNotes
            :notes="[
              { label: 'ملاحظات الإيجار', text: rental.notes },
              { label: 'تفاصيل أخرى', text: rental.other_details },
              { label: 'ملاحظات المالك', text: rental.owner_notes },
            ]"
            :updated-at="rental.updated_at"
            :can-edit="can('rentals.update')"
            @edit="emit('edit', rental)"
          />
        </v-window-item>
        <v-window-item v-if="can('audit.read')" value="audit">
          <v-alert v-if="auditError" type="error" variant="tonal"
            >{{ auditError
            }}<template #append
              ><v-btn variant="text" @click="loadAudit(rental.id)"
                >إعادة المحاولة</v-btn
              ></template
            ></v-alert
          >
          <AuditLogList v-else :logs="auditLogs" :loading="auditLoading" />
        </v-window-item>
      </v-window>
    </section>

    <aside class="dal-panel" aria-labelledby="rental-media-title">
      <div class="dal-panel__header">
        <h2 id="rental-media-title" class="dal-section-title">الصور</h2>
      </div>
      <div class="listing-record__media">
        <ListingImages
          kind="rental"
          :listing-id="rental.id"
          :can-manage="can('rentals.images.manage')"
        />
      </div>
    </aside>
  </div>
</template>
