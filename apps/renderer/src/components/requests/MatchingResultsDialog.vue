<script setup lang="ts">
import type { MatchResult } from "../../types";
import MatchList from "./MatchList.vue";

/** نتائج مطابقة بعد الحفظ أو من زر «المطابقات»: القائمة نفسها في حوار. */
const open = defineModel<boolean>({ required: true });
defineProps<{ matches: MatchResult[]; title: string }>();
const emit = defineEmits<{ open: [MatchResult] }>();
</script>

<template>
  <v-dialog
    v-model="open"
    max-width="760"
    scrollable
    aria-labelledby="match-dialog-title"
  >
    <v-card>
      <v-card-title id="match-dialog-title" class="d-flex align-center ga-2">
        <span>{{ title }}: {{ matches.length }}</span>
        <v-spacer />
        <v-btn
          icon="mdi-close"
          variant="text"
          aria-label="إغلاق المطابقات"
          @click="open = false"
        />
      </v-card-title>
      <v-divider />
      <v-card-text>
        <MatchList :matches="matches" @open="emit('open', $event)" />
      </v-card-text>
      <v-card-actions>
        <v-spacer />
        <v-btn variant="text" @click="open = false">إغلاق</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>
