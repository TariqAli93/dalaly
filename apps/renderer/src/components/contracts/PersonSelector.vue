<script setup lang="ts">
import { ref } from "vue";
import type { PersonRecord } from "../../types";
import * as peopleService from "../../services/people.service";
import { getErrorMessage } from "../../services/api.service";

const props = defineProps<{
  modelValue: number | null;
  people: PersonRecord[];
  label: string;
}>();
const emit = defineEmits<{
  "update:modelValue": [value: number | null];
  created: [person: PersonRecord];
}>();
const createOpen = ref(false);
const saving = ref(false);
const error = ref("");
const form = ref({
  full_name: "",
  phone_primary: "",
  national_id: "",
  address: "",
});

function reset() {
  form.value = {
    full_name: "",
    phone_primary: "",
    national_id: "",
    address: "",
  };
  error.value = "";
}
async function create() {
  if (!form.value.full_name.trim()) return;
  saving.value = true;
  error.value = "";
  try {
    const person = await peopleService.createPerson({
      ...form.value,
      phone_secondary: null,
      email: null,
      person_type: "individual",
      status: "active",
      notes: null,
    });
    emit("created", person);
    emit("update:modelValue", person.id);
    createOpen.value = false;
    reset();
  } catch (cause) {
    error.value = getErrorMessage(cause);
  } finally {
    saving.value = false;
  }
}
</script>
<template>
  <div>
    <v-autocomplete
      :model-value="props.modelValue"
      :items="props.people"
      item-title="full_name"
      item-value="id"
      :label="props.label"
      clearable
      @update:model-value="emit('update:modelValue', $event)"
    >
      <template #append-inner>
        <v-btn
          icon="mdi-account-plus-outline"
          size="small"
          variant="text"
          title="إضافة شخص"
          @click.stop="createOpen = true"
        />
      </template>
    </v-autocomplete>
    <v-dialog v-model="createOpen" max-width="560">
      <v-card>
        <v-card-title>إضافة شخص داخل العقد</v-card-title>
        <v-card-text class="form-grid">
          <v-text-field
            v-model="form.full_name"
            label="الاسم الكامل"
            autofocus
          />
          <v-text-field v-model="form.phone_primary" label="رقم الهاتف" />
          <v-text-field v-model="form.national_id" label="رقم الهوية" />
          <v-text-field v-model="form.address" label="العنوان" />
          <v-alert
            v-if="error"
            type="error"
            variant="tonal"
            class="grid-span"
            >{{ error }}</v-alert
          >
        </v-card-text>
        <v-card-actions
          ><v-spacer /><v-btn @click="createOpen = false">إلغاء</v-btn
          ><v-btn color="primary" :loading="saving" @click="create"
            >إضافة</v-btn
          ></v-card-actions
        >
      </v-card>
    </v-dialog>
  </div>
</template>
<style scoped>
.form-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}
.grid-span {
  grid-column: 1 / -1;
}
</style>
