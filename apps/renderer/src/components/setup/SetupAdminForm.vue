<script setup lang="ts">
import { useI18n } from "vue-i18n";

type AdminModel = { username: string; pin: string };

const model = defineModel<AdminModel>({ required: true });
const { t } = useI18n();

const required = (value: unknown) => Boolean(value) || t("common.required");
const pinRule = (value: string) =>
  (value.length >= 4 && value.length <= 12) ||
  "يجب أن يتكون الرمز السري من 4 إلى 12 خانة.";

function generatePin() {
  // رمز سري عشوائي من 4 أرقام، آمن عبر crypto.
  const buffer = new Uint32Array(1);
  crypto.getRandomValues(buffer);
  model.value.pin = String(1000 + (buffer[0] % 9000));
}
</script>

<template>
  <div>
    <div class="text-h6 mb-2">{{ t("auth.firstAdmin") }}</div>
    <div class="text-body-2 text-medium-emphasis mb-5">
      {{ t("auth.firstAdminDescription") }}
    </div>
    <v-text-field
      v-model="model.username"
      :label="t('common.username')"
      :rules="[required]"
    />
    <v-text-field
      v-model="model.pin"
      :label="t('common.pin')"
      :rules="[required, pinRule]"
    >
      <template #append-inner>
        <v-btn
          variant="text"
          prepend-icon="mdi-dice-5-outline"
          @click="generatePin"
        >
          توليد
        </v-btn>
      </template>
    </v-text-field>
  </div>
</template>
