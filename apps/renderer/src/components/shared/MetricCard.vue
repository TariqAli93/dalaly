<script setup lang="ts">
defineProps<{
  label: string;
  value: string | number;
  icon: string;
  note?: string;
  tone?: string;
}>();
</script>

<template>
  <v-card variant="flat" border class="metric-card">
    <v-avatar :color="tone ?? 'primary'" variant="tonal" rounded="lg" size="44">
      <v-icon :icon="icon" size="22" />
    </v-avatar>
    <div class="metric-card__copy">
      <div class="metric-card__label">{{ label }}</div>
      <strong class="metric-card__value">{{ value }}</strong>
      <span v-if="note" class="metric-card__note">{{ note }}</span>
    </div>
  </v-card>
</template>

<style scoped>
.metric-card {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 16px 20px;
  min-height: 92px;
  min-width: 0;
}
.metric-card__copy {
  min-width: 0;
}
.metric-card__label {
  font-size: calc(12px * var(--dal-font-scale));
  color: var(--dal-muted);
}
.metric-card__value {
  display: block;
  margin-top: 4px;
  font-size: calc(26px * var(--dal-font-scale));
  line-height: 1.2;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}
.metric-card__note {
  color: var(--dal-muted);
  font-size: calc(11px * var(--dal-font-scale));
}
</style>
