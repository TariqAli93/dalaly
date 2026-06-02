<script setup lang="ts">
import { useRouter } from "vue-router";
import { useDisplay } from "vuetify";
import { useProperties } from "../../composables/useProperties";
import ThemeToggle from "./ThemeToggle.vue";

const emit = defineEmits<{ refresh: []; "toggle-drawer": [] }>();

const router = useRouter();
const { mdAndUp } = useDisplay();
const { filters, loadProperties } = useProperties();

function runSearch() {
  void router.push("/properties").then(() => loadProperties());
}
</script>

<template>
  <v-app-bar class="top-navbar border-b" height="74" flat density="comfortable">
    <v-app-bar-nav-icon @click="emit('toggle-drawer')" />
    <v-app-bar-title class="font-weight-bold"> دلالي </v-app-bar-title>

    <v-spacer />

    <v-text-field
      v-model="filters.q"
      class="global-search"
      density="compact"
      hide-details
      clearable
      prepend-inner-icon="mdi-magnify"
      label="بحث سريع"
      @keyup.enter="runSearch"
    />

    <ThemeToggle />
    <v-btn
      icon="mdi-refresh"
      variant="text"
      title="تحديث"
      @click="emit('refresh')"
    />
  </v-app-bar>
</template>
