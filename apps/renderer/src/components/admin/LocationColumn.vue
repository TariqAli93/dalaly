<script setup lang="ts">
/**
 * عمود في شاشة المحافظات والمناطق والأحياء: عنوان بعدده وزر «إضافة»، ثم
 * القائمة. لكل صف زر اختيار باسمه، ومفتاح تفعيل وزرّا تعديل وحذف يحمل كل منها
 * اسم العنصر في aria-label. القائمة افتراضية (v-virtual-scroll)، فمئات
 * الأحياء لا تُرسم كلها.
 */
type LocationItem = { id: number; name: string; is_active: boolean };

defineProps<{
  title: string;
  /** المفرد في أسماء الأزرار: «المحافظة»، «المنطقة»، «الحي». */
  noun: string;
  items: LocationItem[];
  selectedId?: number | null;
  /** القائمة تتبع اختياراً في عمود سابق لم يُجرَ بعد. */
  waitingFor?: string | null;
  emptyText: string;
  selectable?: boolean;
}>();
const emit = defineEmits<{
  select: [number];
  add: [];
  edit: [LocationItem];
  toggle: [LocationItem];
  remove: [LocationItem];
}>();
</script>

<template>
  <section class="dal-panel location-column" :aria-label="title">
    <div class="dal-panel__header">
      <h2 class="dal-section-title">{{ title }}</h2>
      <span v-if="!waitingFor" class="dal-count">{{ items.length }}</span>
      <v-spacer />
      <v-btn
        size="small"
        variant="text"
        prepend-icon="mdi-plus"
        :disabled="Boolean(waitingFor)"
        :aria-label="`إضافة ${noun}`"
        @click="emit('add')"
        >إضافة</v-btn
      >
    </div>

    <!-- السهم يشير إلى العمود السابق: في RTL هو على اليمين. -->
    <div v-if="waitingFor" class="location-column__state">
      <v-icon icon="mdi-arrow-right" size="20" aria-hidden="true" />
      <span>اختر {{ waitingFor }} من العمود السابق.</span>
    </div>
    <div v-else-if="!items.length" class="location-column__state">
      <v-icon icon="mdi-map-marker-off-outline" size="20" aria-hidden="true" />
      <span>{{ emptyText }}</span>
    </div>
    <v-virtual-scroll
      v-else
      :items="items"
      :item-height="40"
      class="location-column__list"
      role="list"
    >
      <template #default="{ item }">
        <div
          class="location-row"
          :class="{
            'location-row--selected': selectable && item.id === selectedId,
            'location-row--inactive': !item.is_active,
          }"
          role="listitem"
        >
          <button
            v-if="selectable"
            type="button"
            class="location-row__name"
            :aria-pressed="item.id === selectedId"
            @click="emit('select', item.id)"
          >
            {{ item.name }}
          </button>
          <span v-else class="location-row__name">{{ item.name }}</span>
          <span v-if="!item.is_active" class="location-row__off">معطّل</span>
          <v-switch
            :model-value="item.is_active"
            color="primary"
            density="compact"
            hide-details
            :aria-label="`${item.is_active ? 'تعطيل' : 'تفعيل'} ${noun} ${item.name}`"
            class="location-row__switch"
            @update:model-value="emit('toggle', item)"
          />
          <v-btn
            icon="mdi-pencil-outline"
            size="small"
            variant="text"
            :aria-label="`تعديل ${noun} ${item.name}`"
            :title="`تعديل ${item.name}`"
            @click="emit('edit', item)"
          />
          <v-btn
            icon="mdi-delete-outline"
            size="small"
            variant="text"
            color="error"
            :aria-label="`حذف ${noun} ${item.name}`"
            :title="`حذف ${item.name}`"
            @click="emit('remove', item)"
          />
        </div>
      </template>
    </v-virtual-scroll>
  </section>
</template>

<style scoped>
.location-column {
  display: flex;
  flex-direction: column;
  min-height: 0;
}
.location-column__list {
  flex: 1 1 auto;
  min-height: 0;
}
.location-column__state {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 16px;
  color: var(--dal-muted);
  font-size: calc(13px * var(--dal-font-scale));
}
.location-row {
  display: flex;
  align-items: center;
  gap: 4px;
  height: 40px;
  padding-inline: 8px 4px;
  border-bottom: 1px solid var(--dal-stroke);
}
.location-row:hover {
  background: var(--dal-hover);
}
.location-row--selected,
.location-row--selected:hover {
  background: rgba(var(--v-theme-primary), 0.12);
}
.location-row__name {
  flex: 1 1 auto;
  min-width: 0;
  height: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  text-align: start;
  font-size: calc(13px * var(--dal-font-scale));
  display: flex;
  align-items: center;
}
button.location-row__name {
  cursor: pointer;
  border-radius: var(--dal-radius-control);
  padding-inline: 4px;
}
.location-row--selected .location-row__name {
  font-weight: 700;
}
.location-row--inactive .location-row__name {
  color: var(--dal-muted);
}
.location-row__off {
  flex: 0 0 auto;
  color: var(--dal-muted);
  font-size: calc(12px * var(--dal-font-scale));
}
.location-row__switch {
  flex: 0 0 auto;
}
</style>
