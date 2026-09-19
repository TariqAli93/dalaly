<script setup lang="ts">
import { computed, ref } from "vue";
import { AREA_UNITS } from "../../constants/domain";
import type { RentalForm as RentalFormType } from "../../types";
import LocationSelects from "../properties/LocationSelects.vue";
import NumberField from "../app/NumberField.vue";
import RentalImages from "./RentalImages.vue";
import { AMENITY_OPTIONS } from "../../utils/amenities";
const model = defineModel<RentalFormType>({ required: true });
const props = defineProps<{
  editing?: boolean;
  saving?: boolean;
  rentalId?: number | null;
}>();
const emit = defineEmits<{ submit: []; cancel: [] }>();
const formRef = ref<{ validate: () => Promise<{ valid: boolean }> } | null>(
  null,
);
const required = (value: unknown) => Boolean(value) || "هذا الحقل مطلوب";
const positive = (value: unknown) =>
  Number(value) > 0 || "يجب أن تكون القيمة أكبر من صفر";
const propertyTypes = [
  { title: "بيت", value: "house" },
  { title: "شقة", value: "apartment" },
  { title: "محل", value: "shop" },
  { title: "مخزن", value: "warehouse" },
  { title: "أخرى", value: "other" },
];
const periods = [
  { title: "شهري", value: "monthly" },
  { title: "نصف سنوي", value: "semi_annual" },
  { title: "سنوي", value: "annual" },
];
const statuses = [
  { title: "متاح", value: "available" },
  { title: "محجوز", value: "reserved" },
  { title: "قيد التفاوض", value: "negotiating" },
  { title: "مؤجر", value: "rented" },
  { title: "مؤرشف", value: "archived" },
];
const amenityOptions = AMENITY_OPTIONS;
const amenities = computed({
  get: () =>
    amenityOptions
      .filter((item) => model.value.amenities[item.key] === true)
      .map((item) => item.key),
  set: (keys: string[]) => {
    const next: Record<string, unknown> = {};
    for (const key of keys) next[key] = true;
    model.value.amenities = next;
  },
});
async function validate() {
  return (await formRef.value?.validate())?.valid ?? false;
}
defineExpose({ validate });
</script>
<template>
  <v-form ref="formRef" @submit.prevent="emit('submit')"
    ><v-card variant="flat" border
      ><v-card-title>{{
        editing ? "تعديل عرض إيجاري" : "إضافة عرض إيجاري"
      }}</v-card-title
      ><v-card-text>
        <div class="rental-form-grid">
          <v-text-field
            v-model="model.name"
            label="اسم العرض"
            hint="اختياري؛ سيُستخدم اسم تلقائي عند تركه فارغاً"
            persistent-hint
          /><v-select
            v-model="model.property_type"
            :items="propertyTypes"
            :rules="[required]"
            label="نوع العقار"
          /><NumberField
            v-model="model.rent_price"
            :rules="[required, positive]"
            label="سعر الإيجار"
          /><v-select
            v-model="model.rent_period"
            :items="periods"
            :rules="[required]"
            label="نوع الإيجار"
          /><v-select
            v-model="model.status"
            :items="statuses"
            :rules="[required]"
            label="الحالة"
          />
        </div>
        <v-divider class="my-4" />
        <div class="text-subtitle-2 mb-2">الموقع</div>
        <LocationSelects
          v-model:governorate-id="model.governorate_id"
          v-model:district-id="model.district_id"
          v-model:neighborhood-id="model.neighborhood_id"
          v-model:governorate-text="model.governorate"
          v-model:district-text="model.district"
          v-model:neighborhood-text="model.neighborhood"
        /><v-text-field
          v-model="model.address_details"
          class="mt-2"
          label="تفاصيل العنوان"
        />
        <v-divider class="my-4" />
        <div class="rental-form-grid">
          <NumberField
            v-model="model.area_value"
            :rules="[required, positive]"
            label="المساحة"
          /><v-select
            v-model="model.area_unit"
            :items="AREA_UNITS"
            :rules="[required]"
            label="وحدة المساحة"
          /><v-text-field
            v-model="model.floors_count"
            type="number"
            label="عدد الطوابق"
          /><v-text-field
            v-model="model.rooms_count"
            type="number"
            label="عدد الغرف"
          /><v-text-field
            v-model="model.bathrooms_count"
            type="number"
            label="عدد الحمامات"
          />
        </div>
        <v-divider class="my-4" />
        <div class="text-subtitle-2 mb-2">الملحقات / المميزات</div>
        <v-chip-group v-model="amenities" column multiple
          ><v-chip
            v-for="item in amenityOptions"
            :key="item.key"
            :value="item.key"
            filter
            variant="outlined"
            >{{ item.title }}</v-chip
          ></v-chip-group
        ><v-textarea
          v-model="model.other_details"
          label="تفاصيل أخرى"
          rows="2"
          class="mt-3"
        />
        <v-divider class="my-4" />
        <div class="rental-form-grid">
          <v-text-field
            v-model="model.owner_name"
            :rules="[required]"
            label="اسم المالك"
          /><v-text-field
            v-model="model.owner_phone"
            :rules="[required]"
            label="رقم الهاتف"
          /><v-textarea
            v-model="model.owner_notes"
            label="ملاحظات المالك"
            rows="2"
          /><v-switch
            v-model="model.is_negotiable"
            label="قابل للتفاوض"
            color="primary"
          />
        </div>
        <v-textarea v-model="model.notes" label="ملاحظات" rows="2" />
        <template v-if="rentalId"
          ><v-divider class="my-4" />
          <div class="text-subtitle-2 mb-2">صور الإيجار</div>
          <RentalImages :rental-id="rentalId" can-manage /></template
        ><v-alert v-else type="info" variant="tonal" class="mt-3"
          >احفظ العرض أولاً ثم أضف صوره من شاشة التعديل.</v-alert
        > </v-card-text
      ><v-card-actions
        ><v-spacer /><v-btn variant="text" @click="emit('cancel')">إلغاء</v-btn
        ><v-btn
          color="primary"
          type="submit"
          :loading="saving"
          prepend-icon="mdi-content-save"
          >حفظ</v-btn
        ></v-card-actions
      ></v-card
    ></v-form
  >
</template>
<style scoped>
.rental-form-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(190px, 1fr));
  gap: 12px;
}
</style>
