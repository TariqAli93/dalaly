<script setup lang="ts">
import { useConfirm } from "../../composables/useConfirm";

const { state, runConfirmedAction } = useConfirm();
</script>

<template>
  <v-dialog
    v-model="state.open"
    width="430"
    :persistent="state.loading"
    role="alertdialog"
    aria-labelledby="dal-confirm-title"
    aria-describedby="dal-confirm-body"
  >
    <v-card>
      <v-card-title id="dal-confirm-title">{{ state.title }}</v-card-title>
      <v-card-text id="dal-confirm-body">{{ state.body }}</v-card-text>
      <v-card-actions>
        <!-- الأمر أولاً في اتجاه القراءة، والمجموعة في الطرف، كبقية الحوارات. -->
        <v-spacer />
        <v-btn
          :color="state.color"
          variant="flat"
          :loading="state.loading"
          @click="runConfirmedAction"
        >
          {{ state.confirmText }}
        </v-btn>
        <v-btn
          variant="text"
          :disabled="state.loading"
          @click="state.open = false"
          >إلغاء</v-btn
        >
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>
