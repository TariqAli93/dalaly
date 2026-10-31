<script setup lang="ts">
import { formatDateTime } from "../../utils/format";

// مسودة حفظها خروج قسري (الخمول أو انتهاء الجلسة) لهذا السجل نفسه.
defineProps<{ savedAt: number }>();
const emit = defineEmits<{ restore: []; discard: [] }>();
</script>

<template>
  <v-alert type="info" variant="tonal" class="mb-3" role="status">
    توجد تعديلات لم تُحفظ على هذا النموذج من
    <bdi dir="rtl">{{ formatDateTime(savedAt) }}</bdi
    >، قبل أن تنتهي الجلسة.
    <template #append>
      <div class="d-flex ga-2">
        <v-btn color="primary" variant="flat" @click="emit('restore')"
          >استعادة التعديلات</v-btn
        >
        <v-btn variant="text" @click="emit('discard')">تجاهل</v-btn>
      </div>
    </template>
  </v-alert>
</template>
