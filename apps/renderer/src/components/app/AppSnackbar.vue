<script setup lang="ts">
import { useSnackbar } from "../../composables/useSnackbar";

const { state } = useSnackbar();
</script>

<template>
  <v-snackbar
    class="app-notification"
    v-model="state.show"
    :color="state.color"
    timeout="3600"
    location="top center"
  >
    {{ state.text }}
  </v-snackbar>
</template>

<style scoped>
/* This notification has no actions; it must not cover document controls. */
.app-notification :deep(.v-snackbar__wrapper) {
  pointer-events: none;
}
</style>
