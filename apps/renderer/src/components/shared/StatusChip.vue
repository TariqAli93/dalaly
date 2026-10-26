<script setup lang="ts">
/**
 * شريحة حالة العرض العقاري — مكوّن عرض بحت.
 * يعتمد على خريطة الألوان والتسميات الموجودة في constants/domain
 * دون أي منطق جديد، ليوحّد شكل الحالة في كل الشاشات (الجدول، اللوحة،
 * التفاصيل) في مصدر واحد.
 */
import { statusColor, statusLabel } from "../../constants/domain";

// color لحالات غير حالات العرض (الزبون مثلاً)؛ بدونه لون حالة العرض.
defineProps<{
  status: string;
  size?: string;
  label?: string;
  color?: string;
}>();
</script>

<template>
  <v-chip
    :color="color ?? statusColor(status)"
    :size="size ?? 'small'"
    variant="tonal"
    label
  >
    {{ label ?? statusLabel(status) }}
  </v-chip>
</template>
