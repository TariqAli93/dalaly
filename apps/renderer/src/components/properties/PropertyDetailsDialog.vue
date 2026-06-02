<script setup lang="ts">
import { ref, watch } from "vue";
import { statusColor, statusLabel } from "../../constants/domain";
import { usePermissions } from "../../composables/usePermissions";
import { getPropertyAudit } from "../../services/properties.service";
import { formatMoney } from "../../utils/format";
import type { AuditLogRecord, PropertyRecord } from "../../types";
import PropertyExportMenu from "./PropertyExportMenu.vue";
import AuditLogList from "./AuditLogList.vue";
import PropertyImages from "./PropertyImages.vue";
import FollowupsTab from "./FollowupsTab.vue";

const open = defineModel<boolean>({ required: true });

const props = defineProps<{ property: PropertyRecord | null }>();

const emit = defineEmits<{
  edit: [PropertyRecord];
  archive: [PropertyRecord];
  restore: [PropertyRecord];
  delete: [PropertyRecord];
}>();

const { can } = usePermissions();

const tab = ref("details");
const auditLogs = ref<AuditLogRecord[]>([]);
const auditLoading = ref(false);

function formatDate(value: string) {
  return new Date(value).toLocaleString("ar-IQ");
}

async function loadAudit(id: number) {
  if (!can("audit.read")) return;
  auditLoading.value = true;
  try {
    auditLogs.value = await getPropertyAudit(id);
  } catch {
    auditLogs.value = [];
  } finally {
    auditLoading.value = false;
  }
}

watch(
  () => [open.value, props.property?.id] as const,
  ([isOpen, id]) => {
    if (isOpen) {
      tab.value = "details";
      if (id) void loadAudit(id);
    }
  },
);
</script>

<template>
  <v-dialog v-model="open" width="980" scrollable>
    <v-card v-if="property" rounded="lg">
      <v-card-title class="d-flex align-center ga-2">
        <span>{{ property.code }}</span>
        <v-chip :color="statusColor(property.status)" variant="tonal">
          {{ statusLabel(property.status) }}
        </v-chip>
        <v-chip v-if="property.is_negotiable" size="small" color="warning" variant="tonal">
          قابل للتفاوض
        </v-chip>
        <v-spacer />
        <v-btn icon="mdi-close" variant="text" @click="open = false" />
      </v-card-title>

      <v-tabs v-model="tab" color="primary">
        <v-tab value="details">التفاصيل</v-tab>
        <v-tab value="images">الصور</v-tab>
        <v-tab v-if="can('followups.read')" value="followups">المتابعات</v-tab>
        <v-tab v-if="can('audit.read')" value="audit">السجل</v-tab>
      </v-tabs>

      <v-card-text style="max-height: 60vh">
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
                  <span class="money">{{ formatMoney(property.total_price) }}</span>
                  دينار
                </div>
              </div>
              <div class="detail-item">
                <div class="detail-label">المحافظة</div>
                <div class="detail-value">{{ property.governorate || "-" }}</div>
              </div>
              <div class="detail-item">
                <div class="detail-label">المنطقة</div>
                <div class="detail-value">{{ property.district || "-" }}</div>
              </div>
              <div class="detail-item">
                <div class="detail-label">المدينة</div>
                <div class="detail-value">{{ property.city || "-" }}</div>
              </div>
              <div class="detail-item">
                <div class="detail-label">اسم المالك</div>
                <div class="detail-value">{{ property.owner_name }}</div>
              </div>
              <div class="detail-item">
                <div class="detail-label">هاتف المالك</div>
                <div class="detail-value">{{ property.owner_phone }}</div>
              </div>
              <div class="detail-item">
                <div class="detail-label">آخر تحديث</div>
                <div class="detail-value">{{ formatDate(property.updated_at) }}</div>
              </div>
              <div v-if="property.frontage" class="detail-item">
                <div class="detail-label">الواجهة</div>
                <div class="detail-value">{{ property.frontage }}</div>
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
                <div class="detail-value">{{ property.address_details || "-" }}</div>
              </div>
              <div class="detail-item">
                <div class="detail-label">ملاحظات العقار</div>
                <div class="detail-value">{{ property.notes || "-" }}</div>
              </div>
            </div>
          </v-window-item>

          <v-window-item value="images">
            <PropertyImages
              :property-id="property.id"
              :can-manage="can('properties.images.manage')"
            />
          </v-window-item>

          <v-window-item v-if="can('followups.read')" value="followups">
            <FollowupsTab :property-id="property.id" />
          </v-window-item>

          <v-window-item v-if="can('audit.read')" value="audit">
            <AuditLogList :logs="auditLogs" :loading="auditLoading" />
          </v-window-item>
        </v-window>
      </v-card-text>

      <v-card-actions>
        <PropertyExportMenu v-if="can('properties.export')" :property="property" />
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
  </v-dialog>
</template>
