<script setup lang="ts">
import { ref, watch } from "vue";

// صورة صف في جداول العروض والإيجارات: <img> عادي بتحميل كسول، بلا مكوّن
// معرض ولا طلب قائمة صور لكل صف.
const props = defineProps<{ src: string | null }>();
const emit = defineEmits<{ load: [] }>();

const failed = ref(false);
watch(
  () => props.src,
  () => (failed.value = false),
);
</script>

<template>
  <img
    v-if="src && !failed"
    :src="src"
    alt=""
    class="row-thumbnail"
    width="48"
    height="40"
    loading="lazy"
    decoding="async"
    @load="emit('load')"
    @error="failed = true"
  />
  <div
    v-else
    class="row-thumbnail row-thumbnail--empty"
    :role="src ? 'img' : undefined"
    :aria-label="src ? 'الصورة غير متاحة' : undefined"
  >
    <v-icon
      :icon="src ? 'mdi-image-off-outline' : 'mdi-home-city-outline'"
      size="22"
    />
  </div>
</template>

<style scoped>
.row-thumbnail {
  display: block;
  width: 48px;
  height: 40px;
  margin-block: 6px;
  border-radius: 6px;
  object-fit: cover;
  background: var(--dal-hover);
}
.row-thumbnail--empty {
  display: flex;
  align-items: center;
  justify-content: center;
  color: rgb(var(--v-theme-primary));
  background: rgba(var(--v-theme-primary), 0.12);
}
</style>
