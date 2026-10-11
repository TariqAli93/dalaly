<script setup lang="ts">
defineProps<{ src: string; alt: string }>();
</script>

<template>
  <v-img :src="src" :alt="alt" class="listing-image">
    <template #placeholder>
      <div class="listing-image__placeholder">
        <v-icon icon="mdi-home-city-outline" size="22" />
      </div>
    </template>
    <template #error>
      <div
        class="listing-image__placeholder"
        role="img"
        aria-label="الصورة غير متاحة"
      >
        <v-icon icon="mdi-image-off-outline" size="22" />
      </div>
    </template>
  </v-img>
</template>

<style scoped>
.listing-image {
  background: var(--dal-hover);
}
.listing-image__placeholder {
  height: 100%;
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--dal-muted);
}
</style>
