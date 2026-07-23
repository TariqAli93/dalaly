<script setup lang="ts">
type AdminModel = { username: string; pin: string };

const model = defineModel<AdminModel>({ required: true });

const required = (value: unknown) => Boolean(value) || "هذا الحقل مطلوب";
const pinRule = (value: string) =>
  (value.length >= 4 && value.length <= 12) || "الـ PIN بين 4 و12 خانة.";

function generatePin() {
  // PIN عشوائي من 4 أرقام، آمن عبر crypto.
  const buffer = new Uint32Array(1);
  crypto.getRandomValues(buffer);
  model.value.pin = String(1000 + (buffer[0] % 9000));
}
</script>

<template>
  <div>
    <div class="text-h6 mb-2">إنشاء أول مستخدم (Super Admin)</div>
    <div class="text-body-2 text-medium-emphasis mb-5">
      سيتم تخزين الـ PIN كـ hash داخل قاعدة البيانات، ولن يُعرض إلا مرة واحدة.
    </div>
    <v-text-field
      v-model="model.username"
      label="Username"
      :rules="[required]"
    />
    <v-text-field v-model="model.pin" label="PIN" :rules="[required, pinRule]">
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
