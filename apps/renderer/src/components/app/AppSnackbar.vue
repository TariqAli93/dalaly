<script setup lang="ts">
import {
  useSnackbar,
  type SnackbarMessage,
} from "../../composables/useSnackbar";

const { queue, actionFor } = useSnackbar();

async function runAction(item: SnackbarMessage, close: () => void) {
  close();
  await actionFor(item.id)?.run();
}
</script>

<template>
  <!-- أسفل الحافة الأمامية بعيداً عن شريط الأوامر وأزرار الحوارات. المرور
       بالمؤشر يوقف العدّ، والخطأ لا يختفي إلا بإغلاقه. -->
  <v-snackbar-queue
    v-model="queue"
    class="app-notification"
    location="bottom start"
  >
    <template #actions="{ item, props }">
      <v-btn
        v-if="actionFor((item as SnackbarMessage).id)"
        variant="text"
        @click="runAction(item as SnackbarMessage, props.onClick)"
        >{{ actionFor((item as SnackbarMessage).id)?.label }}</v-btn
      >
      <v-btn
        variant="text"
        icon="mdi-close"
        aria-label="إغلاق الإشعار"
        @click="props.onClick"
      />
    </template>
  </v-snackbar-queue>
</template>
