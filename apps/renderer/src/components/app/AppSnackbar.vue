<script setup lang="ts">
import { useSnackbar } from "../../composables/useSnackbar";

const { state } = useSnackbar();
</script>

<template>
  <v-snackbar
    v-model="state.show"
    :color="state.color"
    timeout="3600"
    location="top center"
  >
    {{ state.text }}
  </v-snackbar>
</template>
