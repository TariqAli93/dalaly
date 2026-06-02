<script setup lang="ts">
import AppNavbar from "../components/app/AppNavbar.vue";
import { useRefresh } from "../composables/useRefresh";

defineProps<{ title?: string; subtitle?: string }>();

const { refresh } = useRefresh();
</script>

<template>
  <AppNavbar @refresh="refresh" />
  <v-main>
    <main class="main-content">
      <section class="page-band">
        <div v-if="title" class="page-header">
          <div>
            <div class="text-h5 font-weight-bold">{{ title }}</div>
            <div v-if="subtitle" class="text-body-2 text-medium-emphasis">
              {{ subtitle }}
            </div>
          </div>
          <slot name="header-actions" />
        </div>
        <slot />
      </section>
    </main>
  </v-main>
</template>
