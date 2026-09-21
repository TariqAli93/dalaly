<script setup lang="ts">
import { ref, watch } from "vue";
import { statusColor, statusLabel } from "../../constants/domain";
import { usePermissions } from "../../composables/usePermissions";
import { getRentalAudit } from "../../services/rentals.service";
import { amenitiesText } from "../../utils/amenities";
import { formatMoney } from "../../utils/format";
import type { AuditLogRecord, RentalRecord } from "../../types";
import RentalExportMenu from "./RentalExportMenu.vue";
import RentalImages from "./RentalImages.vue";
import RentalFollowupsTab from "./RentalFollowupsTab.vue";
import AuditLogList from "../properties/AuditLogList.vue";

const open = defineModel<boolean>({ required: true });
const props = defineProps<{ rental: RentalRecord | null }>();
const emit = defineEmits<{
  edit: [RentalRecord];
  archive: [RentalRecord];
  restore: [RentalRecord];
  delete: [RentalRecord];
}>();

const { can } = usePermissions();
const tab = ref("details");
const auditLogs = ref<AuditLogRecord[]>([]);
const auditLoading = ref(false);

const typeLabel: Record<string, string> = {
  house: "بيت",
  apartment: "شقة",
  shop: "محل",
  warehouse: "مخزن",
  other: "أخرى",
};
const periodLabel: Record<string, string> = {
  monthly: "شهري",
  semi_annual: "نصف سنوي",
  annual: "سنوي",
};

function formatDate(value: string) {
  return new Date(value).toLocaleString("ar-IQ", { numberingSystem: "latn" });
}

async function loadAudit(id: number) {
  if (!can("audit.read")) return;
  auditLoading.value = true;
  try {
    auditLogs.value = await getRentalAudit(id);
  } catch {
    auditLogs.value = [];
  } finally {
    auditLoading.value = false;
  }
}

watch(
  () => [open.value, props.rental?.id] as const,
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
    <v-card v-if="rental">
      <v-card-title class="d-flex align-center ga-2">
        <span>{{ rental.name || `rentals ${rental.code}` }} · {{ rental.code }}</span>
        <v-chip :color="statusColor(rental.status)" variant="tonal">
          {{ statusLabel(rental.status) }}
        </v-chip>
        <v-chip v-if="rental.is_negotiable" color="warning" variant="tonal">
          قابل للتفاوض
        </v-chip>
        <v-spacer />
        <v-btn icon="mdi-close" variant="text" @click="open = false" />
      </v-card-title>

      <v-tabs v-model="tab" color="primary">
        <v-tab value="details">التفاصيل</v-tab>
        <v-tab value="images">الصور</v-tab>
        <v-tab v-if="can('rentals.followups.read')" value="followups">المتابعات</v-tab>
        <v-tab v-if="can('audit.read')" value="audit">السجل</v-tab>
      </v-tabs>

      <v-card-text style="max-height: 60vh">
        <v-window v-model="tab">
          <v-window-item value="details">
            <div class="detail-grid">
              <div class="detail-item">
                <div class="detail-label">نوع العقار</div>
                <div class="detail-value">{{ typeLabel[rental.property_type] ?? rental.property_type }}</div>
              </div>
              <div class="detail-item">
                <div class="detail-label">نوع الإيجار</div>
                <div class="detail-value">{{ periodLabel[rental.rent_period] ?? rental.rent_period }}</div>
              </div>
              <div class="detail-item">
                <div class="detail-label">سعر الإيجار</div>
                <div class="detail-value"><span class="money">{{ formatMoney(rental.rent_price) }}</span> دينار</div>
              </div>
              <div class="detail-item">
                <div class="detail-label">المساحة</div>
                <div class="detail-value">{{ rental.area_value }} {{ rental.area_unit }}</div>
              </div>
              <div class="detail-item">
                <div class="detail-label">الغرف / الحمامات</div>
                <div class="detail-value">{{ rental.rooms_count ?? "-" }} / {{ rental.bathrooms_count ?? "-" }}</div>
              </div>
              <div class="detail-item">
                <div class="detail-label">الطوابق</div>
                <div class="detail-value">{{ rental.floors_count ?? "-" }}</div>
              </div>
              <div class="detail-item">
                <div class="detail-label">المحافظة</div>
                <div class="detail-value">{{ rental.governorate || "-" }}</div>
              </div>
              <div class="detail-item">
                <div class="detail-label">المنطقة</div>
                <div class="detail-value">{{ rental.district || "-" }}</div>
              </div>
              <div class="detail-item">
                <div class="detail-label">الحي</div>
                <div class="detail-value">{{ rental.neighborhood || "-" }}</div>
              </div>
              <div class="detail-item">
                <div class="detail-label">اسم المالك</div>
                <div class="detail-value">{{ rental.owner_name }}</div>
              </div>
              <div class="detail-item">
                <div class="detail-label">هاتف المالك</div>
                <div class="detail-value">{{ rental.owner_phone }}</div>
              </div>
              <div class="detail-item">
                <div class="detail-label">آخر تحديث</div>
                <div class="detail-value">{{ formatDate(rental.updated_at) }}</div>
              </div>
              <div class="detail-item">
                <div class="detail-label">العنوان التفصيلي</div>
                <div class="detail-value">{{ rental.address_details || "-" }}</div>
              </div>
              <div class="detail-item">
                <div class="detail-label">المميزات</div>
                <div class="detail-value">{{ amenitiesText(rental.amenities) || "-" }}</div>
              </div>
              <div class="detail-item">
                <div class="detail-label">ملاحظات الإيجار</div>
                <div class="detail-value">{{ rental.notes || rental.other_details || "-" }}</div>
              </div>
            </div>
          </v-window-item>

          <v-window-item value="images">
            <RentalImages :rental-id="rental.id" :can-manage="can('rentals.images.manage')" />
          </v-window-item>

          <v-window-item v-if="can('rentals.followups.read')" value="followups">
            <RentalFollowupsTab :rental-id="rental.id" />
          </v-window-item>

          <v-window-item v-if="can('audit.read')" value="audit">
            <AuditLogList :logs="auditLogs" :loading="auditLoading" />
          </v-window-item>
        </v-window>
      </v-card-text>

      <v-card-actions>
        <RentalExportMenu v-if="can('rentals.export')" :rental="rental" />
        <v-spacer />
        <v-btn v-if="can('rentals.update')" variant="tonal" prepend-icon="mdi-pencil" @click="emit('edit', rental)">
          تعديل
        </v-btn>
        <v-btn v-if="rental.status === 'archived' && can('rentals.restore')" color="success" variant="tonal" prepend-icon="mdi-archive-arrow-up-outline" @click="emit('restore', rental)">
          إرجاع من الأرشيف
        </v-btn>
        <v-btn v-else-if="rental.status !== 'archived' && can('rentals.archive')" color="warning" variant="tonal" prepend-icon="mdi-archive-arrow-down-outline" @click="emit('archive', rental)">
          أرشفة
        </v-btn>
        <v-btn v-if="can('rentals.delete')" color="error" variant="text" prepend-icon="mdi-delete-outline" @click="emit('delete', rental)">
          حذف
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<style scoped>
.detail-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(210px, 1fr));
  gap: 12px 16px;
}
.detail-item {
  min-width: 0;
}
.detail-label {
  color: rgba(var(--v-theme-on-surface), 0.6);
  font-size: 12px;
}
.detail-value {
  font-weight: 600;
  margin-top: 3px;
  overflow-wrap: anywhere;
}
</style>
