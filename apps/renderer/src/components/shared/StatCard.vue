<script setup lang="ts">
/**
 * بطاقة إحصائية مضغوطة — مكوّن عرض بحت لعرض قيمة رقمية مع عنوانها.
 * القيمة تُمرَّر منسّقة مسبقاً (عبر formatNumber/formatMoney) فلا يحمل
 * المكوّن أي منطق حساب أو تنسيق. الرقم داخل .money لعزل الاتجاه.
 */
defineProps<{
  label: string;
  value: string | number;
  icon?: string;
}>();
</script>

<template>
  <v-card rounded="lg" variant="flat" border>
    <v-card-text class="d-flex align-center ga-3">
      <v-icon
        v-if="icon"
        :icon="icon"
        size="22"
        class="text-medium-emphasis flex-shrink-0"
      />
      <div class="min-w-0">
        <div class="text-body-2 text-medium-emphasis">{{ label }}</div>
        <div class="text-h5 font-weight-bold money">{{ value }}</div>
      </div>
    </v-card-text>
  </v-card>
</template>
