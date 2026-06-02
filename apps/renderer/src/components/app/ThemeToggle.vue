<script setup lang="ts">
import { useThemeMode } from "../../composables/useThemeMode";

const { isDark, toggle } = useThemeMode();
</script>

<template>
  <v-btn
    :icon="isDark ? 'mdi-weather-sunny' : 'mdi-weather-night'"
    variant="text"
    title="تبديل الثيم"
    @click="toggle"
  />
</template>
