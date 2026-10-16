<script setup lang="ts">
import { useRouter } from "vue-router";
import { useSetup } from "../composables/useSetup";
import FirstRunLayout from "../layouts/FirstRunLayout.vue";

const router = useRouter();
const { startupMessage, loading, fetchStatus } = useSetup();
async function retry() {
  try {
    const health = await fetchStatus();
    if (health.startup_state !== "ERROR")
      await router.replace(
        health.startup_state === "SETUP_REQUIRED" ? "/setup" : "/login",
      );
  } catch {
    /* Reactive startupMessage already contains the retry error. */
  }
}
</script>

<template>
  <FirstRunLayout>
    <v-alert type="error" variant="tonal" :text="startupMessage" class="mb-4" />
    <v-btn
      color="primary"
      prepend-icon="mdi-refresh"
      :loading="loading"
      @click="retry"
      >إعادة المحاولة</v-btn
    >
  </FirstRunLayout>
</template>
