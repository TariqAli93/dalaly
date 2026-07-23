<script setup lang="ts">
import type { AuditLogRecord } from "../../types";

defineProps<{ logs: AuditLogRecord[]; loading?: boolean }>();

const ACTION_LABELS: Record<string, string> = {
  created: "إنشاء العرض",
  updated: "تعديل العرض",
  price_changed: "تغيير السعر",
  status_changed: "تغيير الحالة",
  archived: "أرشفة",
  restored: "إرجاع من الأرشيف",
  deleted: "حذف",
  image_added: "إضافة صورة",
  image_removed: "حذف صورة",
};

const ACTION_ICONS: Record<string, string> = {
  created: "mdi-plus-circle-outline",
  updated: "mdi-pencil-outline",
  price_changed: "mdi-cash",
  status_changed: "mdi-swap-horizontal",
  archived: "mdi-archive-arrow-down-outline",
  restored: "mdi-archive-arrow-up-outline",
  deleted: "mdi-delete-outline",
  image_added: "mdi-image-plus-outline",
  image_removed: "mdi-image-remove-outline",
};

function label(action: string) {
  return ACTION_LABELS[action] ?? action;
}
function icon(action: string) {
  return ACTION_ICONS[action] ?? "mdi-history";
}
function when(value: string) {
  return new Date(value).toLocaleString("ar-IQ", { numberingSystem: "latn" });
}
function detail(log: AuditLogRecord) {
  const value = (log.new_value ?? {}) as Record<string, unknown>;
  if (log.action === "price_changed") return `إلى ${value.total_price ?? ""}`;
  if (log.action === "status_changed") return `إلى ${value.status ?? ""}`;
  return "";
}
</script>

<template>
  <div>
    <v-progress-linear
      v-if="loading"
      indeterminate
      color="primary"
      class="mb-2"
    />
    <v-empty-state
      v-else-if="!logs.length"
      icon="mdi-history"
      title="لا يوجد سجل تغييرات"
    />
    <v-timeline v-else density="compact" side="end" align="start">
      <v-timeline-item
        v-for="log in logs"
        :key="log.id"
        :dot-color="log.action === 'deleted' ? 'error' : 'primary'"
        size="x-small"
      >
        <template #icon>
          <v-icon :icon="icon(log.action)" />
        </template>
        <div class="d-flex flex-column">
          <div class="font-weight-medium">
            {{ label(log.action) }}
            <span v-if="detail(log)" class="text-medium-emphasis"
              >— {{ detail(log) }}</span
            >
          </div>
          <div class="text-caption text-medium-emphasis">
            {{ log.user_name || "النظام" }} · {{ when(log.created_at) }}
          </div>
        </div>
      </v-timeline-item>
    </v-timeline>
  </div>
</template>
