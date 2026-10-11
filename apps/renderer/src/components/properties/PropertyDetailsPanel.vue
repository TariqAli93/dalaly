<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { statusColor, statusLabel } from "../../constants/domain";
import { usePermissions } from "../../composables/usePermissions";
import { getPropertyAudit } from "../../services/properties.service";
import { formatMoney, formatPlot } from "../../utils/format";
import { neighborhoodOf } from "../../utils/exportProperty";
import type { AuditLogRecord, PropertyRecord } from "../../types";
import PropertyExportMenu from "./PropertyExportMenu.vue";
import AuditLogList from "./AuditLogList.vue";
import PropertyImages from "./PropertyImages.vue";
import FollowupsTab from "./FollowupsTab.vue";
import LinkedContracts from "../contracts/LinkedContracts.vue";
import RecordNotes from "../shared/RecordNotes.vue";
import PropertyLocationView from "../shared/PropertyLocationView.vue";
import { getErrorMessage } from "../../services/api.service";
import { amenitiesText } from "../../utils/amenities";

const props = defineProps<{ property: PropertyRecord }>();

const emit = defineEmits<{
  edit: [PropertyRecord];
  archive: [PropertyRecord];
  restore: [PropertyRecord];
  delete: [PropertyRecord];
}>();

const { can } = usePermissions();

const tab = ref("details");
const mapVisited = ref(false);
watch(tab, (value) => { if (value === "map") mapVisited.value = true; });
const auditLogs = ref<AuditLogRecord[]>([]);
const auditLoading = ref(false);
const auditError = ref("");
const address = computed(() => [
  props.property.governorate || props.property.governorate_text, props.property.city,
  props.property.district || props.property.district_text, neighborhoodOf(props.property), props.property.address_details,
].filter(Boolean).join(" · "));
const extraFields = computed(() =>
  [
    ["المدينة", props.property.city],
    ["رقم المقاطعة", props.property.subdistrict_number],
    ["اسم المقاطعة", props.property.subdistrict_name],
    ["الزقاق", props.property.alley],
    ["رقم الدار", props.property.house_number],
    ["أقرب معلم", props.property.nearest_landmark],
    ["عرض الشارع (متر)", props.property.street_width],
    ["عدد الحمامات", props.property.bathrooms_count],
    ["المزايا", amenitiesText(props.property.amenities)],
    ["تاريخ الإضافة", formatDate(props.property.created_at)],
    [
      "تاريخ الأرشفة",
      props.property.archived_at
        ? formatDate(props.property.archived_at)
        : null,
    ],
  ].filter(
    ([, value]) => value !== null && value !== undefined && value !== "",
  ),
);

function formatDate(value: string) {
  return new Date(value).toLocaleString("ar-IQ", { numberingSystem: "latn" });
}

async function loadAudit(id: number) {
  if (!can("audit.read")) return;
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

watch(
  () => props.property.id,
  (id) => {
    tab.value = "details";
    mapVisited.value = false;
    void loadAudit(id);
  },
  { immediate: true },
);
</script>

<template>
  <v-card class="property-detail-card" variant="flat" border>
    <v-card-title class="d-flex align-center ga-2">
      <span
        >{{ property.name || `عقار ${property.code}` }} ·
        {{ property.code }}</span
      >
      <v-chip :color="statusColor(property.status)" variant="tonal">
        {{ statusLabel(property.status) }}
      </v-chip>
      <v-chip v-if="property.is_negotiable" color="warning" variant="tonal">
        قابل للتفاوض
      </v-chip>
      <v-spacer />
    </v-card-title>

    <v-tabs v-model="tab" color="primary" show-arrows>
      <v-tab value="details">المعلومات الأساسية</v-tab>
      <v-tab value="map">الموقع على الخريطة</v-tab>
      <v-tab value="notes">الملاحظات</v-tab>
      <v-tab value="contracts">العقود</v-tab>
      <v-tab value="images">الصور</v-tab>
      <v-tab v-if="can('followups.read')" value="followups">المتابعات</v-tab>
      <v-tab v-if="can('audit.read')" value="audit">السجل</v-tab>
    </v-tabs>

    <v-card-text class="property-detail-body">
      <div v-if="tab === 'details'" class="detail-identity">
        <div>
          <h2>{{ property.name || property.code }}</h2>
          <p>
            <v-icon icon="mdi-map-marker-outline" size="16" />{{
              [property.governorate, property.district, property.neighborhood]
                .filter(Boolean)
                .join(" · ")
            }}
          </p>
        </div>
        <div class="detail-price">
          <span>السعر الإجمالي</span
          ><strong
            ><bdi>{{ formatMoney(property.total_price) }}</bdi>
            <small>د.ع</small></strong
          >
        </div>
      </div>
      <div
        class="detail-workspace"
        :class="{ 'detail-workspace--wide': tab !== 'details' }"
      >
        <div
          v-show="tab === 'details' || tab === 'images'"
          class="detail-gallery"
        >
          <PropertyImages
            :property-id="property.id"
            :can-manage="can('properties.images.manage')"
          />
        </div>
        <v-window v-model="tab">
          <v-window-item value="details">
            <div class="detail-grid">
              <div class="detail-item">
                <div class="detail-label">نوع العقار</div>
                <div class="detail-value">{{ property.property_type }}</div>
              </div>
              <div class="detail-item">
                <div class="detail-label">الصفة القانونية</div>
                <div class="detail-value">{{ property.legal_type }}</div>
              </div>
              <div class="detail-item">
                <div class="detail-label">المساحة</div>
                <div class="detail-value">
                  {{ property.area_value }} {{ property.area_unit }}
                </div>
              </div>
              <div class="detail-item">
                <div class="detail-label">طريقة التسعير</div>
                <div class="detail-value">{{ property.pricing_method }}</div>
              </div>
              <div class="detail-item">
                <div class="detail-label">سعر الوحدة</div>
                <div class="detail-value">
                  <span class="money">{{
                    property.unit_price ? formatMoney(property.unit_price) : "-"
                  }}</span>
                </div>
              </div>
              <div class="detail-item">
                <div class="detail-label">السعر الكلي</div>
                <div class="detail-value">
                  <span class="money">{{
                    formatMoney(property.total_price)
                  }}</span>
                  دينار
                </div>
              </div>
              <div class="detail-item">
                <div class="detail-label">المحافظة</div>
                <div class="detail-value">
                  {{ property.governorate || "-" }}
                </div>
              </div>
              <div class="detail-item">
                <div class="detail-label">المنطقة</div>
                <div class="detail-value">{{ property.district || "-" }}</div>
              </div>
              <div class="detail-item">
                <div class="detail-label">الحي</div>
                <div class="detail-value">
                  {{ neighborhoodOf(property) || "-" }}
                </div>
              </div>
              <div v-if="property.frontage" class="detail-item">
                <div class="detail-label">الواجهة (متر)</div>
                <div class="detail-value">{{ property.frontage }}</div>
              </div>
              <div v-if="property.nazal" class="detail-item">
                <div class="detail-label">النزال / العمق (متر)</div>
                <div class="detail-value">{{ property.nazal }}</div>
              </div>
              <div v-if="property.plot_number" class="detail-item">
                <div class="detail-label">رقم القطعة</div>
                <div class="detail-value">
                  {{ formatPlot(property.plot_number, property.plot_letter) }}
                </div>
              </div>
              <div class="detail-item">
                <div class="detail-label">اسم المالك</div>
                <div class="detail-value">
                  <router-link
                    v-if="property.owner_person_id && can('people.read')"
                    :to="`/clients/${property.owner_person_id}`"
                    class="record-link"
                    >{{ property.owner_name }}</router-link
                  ><span v-else>{{ property.owner_name }}</span>
                </div>
              </div>
              <div class="detail-item">
                <div class="detail-label">هاتف المالك</div>
                <div class="detail-value">{{ property.owner_phone }}</div>
              </div>
              <div class="detail-item">
                <div class="detail-label">آخر تحديث</div>
                <div class="detail-value">
                  {{ formatDate(property.updated_at) }}
                </div>
              </div>
              <div v-if="property.rooms_count" class="detail-item">
                <div class="detail-label">عدد الغرف</div>
                <div class="detail-value">{{ property.rooms_count }}</div>
              </div>
              <div v-if="property.mahalla" class="detail-item">
                <div class="detail-label">المحلة</div>
                <div class="detail-value">{{ property.mahalla }}</div>
              </div>
              <div class="detail-item">
                <div class="detail-label">العنوان التفصيلي</div>
                <div class="detail-value">
                  {{ property.address_details || "-" }}
                </div>
              </div>
              <div class="detail-item">
                <div class="detail-label">ملاحظات العقار</div>
                <div class="detail-value">{{ property.notes || "-" }}</div>
              </div>
              <div
                v-for="[label, value] in extraFields"
                :key="String(label)"
                class="detail-item"
              >
                <div class="detail-label">{{ label }}</div>
                <div class="detail-value">{{ value }}</div>
              </div>
            </div>
          </v-window-item>

          <v-window-item value="images" />

          <v-window-item value="map">
            <PropertyLocationView v-if="mapVisited" :active="tab === 'map'" :key="property.id"
              :address="address"
              :property-name="property.name || `عقار ${property.code}`"
              :latitude="property.latitude" :longitude="property.longitude" :location-link="property.location_link"
              :can-edit="can('properties.update')" @edit="emit('edit', property)" />
          </v-window-item>
          <v-window-item value="notes"
            ><RecordNotes
              :notes="[
                { label: 'ملاحظات العقار', text: property.notes },
                { label: 'ملاحظات المالك', text: property.owner_notes },
              ]"
              :updated-at="property.updated_at"
              :can-edit="can('properties.update')"
              @edit="emit('edit', property)"
          /></v-window-item>
          <v-window-item value="contracts"
            ><LinkedContracts :property-id="property.id"
          /></v-window-item>

          <v-window-item v-if="can('followups.read')" value="followups">
            <FollowupsTab :property-id="property.id" />
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
      </div>
    </v-card-text>

    <v-card-actions>
      <PropertyExportMenu
        v-if="can('properties.export')"
        :property="property"
      />
      <v-spacer />
      <v-btn
        v-if="can('properties.update')"
        variant="tonal"
        prepend-icon="mdi-pencil"
        @click="emit('edit', property)"
      >
        تعديل
      </v-btn>
      <v-btn
        v-if="property.status === 'archived' && can('properties.restore')"
        color="success"
        variant="tonal"
        prepend-icon="mdi-archive-arrow-up-outline"
        @click="emit('restore', property)"
      >
        إرجاع من الأرشيف
      </v-btn>
      <v-btn
        v-else-if="property.status !== 'archived' && can('properties.archive')"
        color="warning"
        variant="tonal"
        prepend-icon="mdi-archive-arrow-down-outline"
        @click="emit('archive', property)"
      >
        أرشفة
      </v-btn>
      <v-btn
        v-if="can('properties.delete')"
        color="error"
        variant="text"
        prepend-icon="mdi-delete-outline"
        @click="emit('delete', property)"
      >
        حذف
      </v-btn>
    </v-card-actions>
  </v-card>
</template>

<style scoped>
.property-detail-body {
  overflow: visible;
}
.property-detail-card > :deep(.v-card-actions) {
  flex-wrap: wrap;
  gap: 8px;
}
.detail-identity {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 20px;
}
.detail-identity h2 {
  font-size: calc(20px * var(--dal-font-scale));
  font-weight: 700;
  overflow-wrap: anywhere;
}
.detail-identity p {
  color: var(--dal-muted);
  font-size: calc(12px * var(--dal-font-scale));
  margin-top: 4px;
}
.detail-price > span {
  color: var(--dal-muted);
  font-size: calc(11px * var(--dal-font-scale));
}
.detail-price {
  flex-shrink: 0;
  text-align: end;
}
.detail-price strong {
  display: block;
  font-size: calc(24px * var(--dal-font-scale));
  color: rgb(var(--v-theme-primary-text));
}
.detail-price small {
  font-size: calc(12px * var(--dal-font-scale));
  margin-inline-start: 6px;
}
.detail-workspace {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1.15fr);
  gap: 24px;
}
.detail-workspace--wide {
  grid-template-columns: 1fr;
}
.detail-workspace--wide .detail-gallery {
  max-width: 800px;
  margin-inline: auto;
  width: 100%;
}
.detail-workspace :deep(.detail-grid) {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}
.detail-workspace :deep(.detail-item) {
  border: 0;
  border-bottom: 1px solid var(--dal-stroke);
  border-radius: 0;
  padding: 12px 4px;
  min-height: 64px;
}
.detail-workspace :deep(.detail-label) {
  font-size: calc(12px * var(--dal-font-scale));
  margin-bottom: 4px;
}
.detail-workspace :deep(.detail-value) {
  font-size: calc(13px * var(--dal-font-scale));
  font-weight: 600;
  overflow-wrap: anywhere;
}
@media (max-width: 900px) {
  .detail-workspace {
    grid-template-columns: 1fr;
  }
  .detail-identity {
    align-items: flex-start;
    flex-direction: column;
  }
  .detail-price {
    text-align: start;
  }
}
@media (max-width: 540px) {
  .detail-workspace :deep(.detail-grid) {
    grid-template-columns: 1fr;
  }
}
</style>
