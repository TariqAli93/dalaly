<script setup lang="ts">
/**
 * شريحة حالة العرض العقاري — مكوّن عرض بحت.
 * يعتمد على خريطة الألوان والتسميات الموجودة في constants/domain
 * دون أي منطق جديد، ليوحّد شكل الحالة في كل الشاشات (الجدول، اللوحة،
 * التفاصيل) في مصدر واحد.
 */
import { statusColor, statusLabel } from "../../constants/domain";

defineProps<{ status: string; size?: string }>();
</script>

<template>
  <v-chip
    :color="statusColor(status)"
    :size="size ?? 'small'"
    variant="tonal"
    label
  >
    {{ statusLabel(status) }}
  </v-chip>
</template>
