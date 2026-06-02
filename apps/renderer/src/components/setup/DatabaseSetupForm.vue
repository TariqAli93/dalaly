<script setup lang="ts">
import type { DatabaseSetupInput } from "../../types";

const model = defineModel<DatabaseSetupInput>({ required: true });

defineProps<{ testing?: boolean }>();
const emit = defineEmits<{ test: [] }>();

const required = (value: unknown) => Boolean(value) || "هذا الحقل مطلوب";
const dbNameRule = (value: string) =>
  /^[a-zA-Z0-9_]+$/.test(value) ||
  "اسم القاعدة: حروف وأرقام وشرطة سفلية فقط.";
</script>

<template>
  <div>
    <div class="text-h6 mb-2">إعداد قاعدة بيانات PostgreSQL</div>
    <div class="text-body-2 text-medium-emphasis mb-5">
      أدخل بيانات مدير PostgreSQL لإنشاء قاعدة البيانات تلقائياً.
    </div>
    <div class="dialog-grid">
      <v-text-field v-model="model.host" label="Host" :rules="[required]" />
      <v-text-field v-model="model.port" label="Port" :rules="[required]" />
      <v-text-field
        v-model="model.adminUsername"
        label="PostgreSQL Admin Username"
        :rules="[required]"
      />
      <v-text-field
        v-model="model.adminPassword"
        label="PostgreSQL Admin Password"
        type="password"
      />
      <v-text-field
        v-model="model.databaseName"
        class="span-2"
        label="اسم قاعدة البيانات"
        :rules="[required, dbNameRule]"
      />
    </div>
    <div class="d-flex justify-end mt-3">
      <v-btn
        variant="tonal"
        prepend-icon="mdi-database-check-outline"
        :loading="testing"
        @click="emit('test')"
      >
        اختبار الاتصال
      </v-btn>
    </div>
  </div>
</template>
