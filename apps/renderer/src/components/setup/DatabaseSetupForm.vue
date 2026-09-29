<script setup lang="ts">
import { useI18n } from "vue-i18n";
import type { DatabaseSetupInput } from "../../types";

const model = defineModel<DatabaseSetupInput>({ required: true });

defineProps<{ testing?: boolean }>();
const emit = defineEmits<{ test: [] }>();
const { t } = useI18n();

const required = (value: unknown) => Boolean(value) || t("common.required");
const dbNameRule = (value: string) =>
  /^[a-zA-Z0-9_]+$/.test(value) || t("database.nameRule");
</script>

<template>
  <div>
    <div class="text-h6 mb-2">{{ t("database.title") }}</div>
    <div class="text-body-2 text-medium-emphasis mb-5">
      {{ t("database.description") }}
    </div>
    <div class="dialog-grid">
      <v-text-field
        v-model="model.host"
        :label="t('common.host')"
        :rules="[required]"
      />
      <v-text-field
        v-model="model.port"
        :label="t('common.port')"
        :rules="[required]"
      />
      <v-text-field
        v-model="model.adminUsername"
        :label="t('database.adminUsername')"
        :rules="[required]"
      />
      <v-text-field
        v-model="model.adminPassword"
        :label="t('database.adminPassword')"
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
        {{ t("database.testConnection") }}
      </v-btn>
    </div>
  </div>
</template>
