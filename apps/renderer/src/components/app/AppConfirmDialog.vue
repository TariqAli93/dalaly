<script setup lang="ts">
import { useConfirm } from "../../composables/useConfirm";

const { state, runConfirmedAction } = useConfirm();
</script>

<template>
  <v-dialog v-model="state.open" width="430">
    <v-card>
      <v-card-title>{{ state.title }}</v-card-title>
      <v-card-text>{{ state.body }}</v-card-text>
      <v-card-actions>
        <v-spacer />
        <v-btn variant="text" @click="state.open = false">إلغاء</v-btn>
        <v-btn
          :color="state.color"
          variant="flat"
          :loading="state.loading"
          @click="runConfirmedAction"
        >
          {{ state.confirmText }}
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>
