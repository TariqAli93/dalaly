<script setup lang="ts">
import { computed, ref } from "vue";
import {
  AREA_UNITS,
  DIRECT_PRICE,
  LEGAL_TYPES,
  PRICING_METHODS,
  PROPERTY_TYPES,
  STATUSES,
} from "../../constants/domain";
import { formatMoney, toNumber } from "../../utils/format";
import type { PropertyForm } from "../../types";
import LocationSelects from "./LocationSelects.vue";
import NumberField from "../app/NumberField.vue";

const model = defineModel<PropertyForm>({ required: true });

defineProps<{ editing?: boolean; saving?: boolean }>();
const emit = defineEmits<{ submit: []; cancel: [] }>();

const formRef = ref<{ validate: () => Promise<{ valid: boolean }> } | null>(
  null,
);
const extraOpen = ref(false);

const required = (value: unknown) => Boolean(value) || "هذا الحقل مطلوب";
const positive = (value: unknown) =>
  toNumber(value) > 0 || "يجب أن تكون القيمة أكبر من صفر";

const isDirectPrice = computed(
  () => model.value.pricing_method === DIRECT_PRICE,
);

const computedTotal = computed(() => {
  if (isDirectPrice.value) return toNumber(model.value.total_price);
  return toNumber(model.value.area_value) * toNumber(model.value.unit_price);
});

async function validate() {
  const result = await formRef.value?.validate();
  return result?.valid ?? false;
}

defineExpose({ validate, computedTotal });
</script>

<template>
  <v-form ref="formRef" @submit.prevent="emit('submit')">
    <v-card rounded="lg" variant="flat" border>
      <v-card-title>
        {{ editing ? "تعديل عرض عقاري" : "إضافة عرض عقاري" }}
      </v-card-title>

      <v-card-text>
        <div class="form-grid">
          <v-select
            v-model="model.property_type"
            :items="PROPERTY_TYPES"
            :rules="[required]"
            label="نوع العقار"
          />
          <v-select
            v-model="model.legal_type"
            :items="LEGAL_TYPES"
            :rules="[required]"
            label="جنس الأرض / الصفة القانونية"
          />
          <v-select
            v-model="model.status"
            :items="STATUSES"
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
          v-model:governorate-text="model.governorate_text"
          v-model:district-text="model.district_text"
          v-model:neighborhood-text="model.neighborhood_text"
        />
        <v-text-field
          v-model="model.address_details"
          class="w-100 mt-2"
          label="العنوان التفصيلي"
        />

        <v-divider class="my-4" />
        <div class="form-grid">
          <NumberField
            v-model="model.area_value"
            :rules="[required, positive]"
            label="المساحة"
          />
          <v-select
            v-model="model.area_unit"
            :items="AREA_UNITS"
            :rules="[required]"
            label="وحدة المساحة"
          />
          <v-select
            v-model="model.pricing_method"
            :items="PRICING_METHODS"
            :rules="[required]"
            label="طريقة التسعير"
          />
          <NumberField
            v-if="!isDirectPrice"
            v-model="model.unit_price"
            :rules="[required, positive]"
            :decimals="false"
            label="سعر الوحدة"
          />
          <NumberField
            v-else
            v-model="model.total_price"
            :rules="[required, positive]"
            :decimals="false"
            label="السعر الإجمالي المباشر"
          />
          <v-text-field
            :model-value="formatMoney(computedTotal)"
            label="السعر الكلي المحسوب"
            readonly
          />
          <v-switch
            v-model="model.is_negotiable"
            label="السعر قابل للتفاوض"
            color="primary"
            hide-details
          />
        </div>

        <v-divider class="my-4" />
        <div class="text-subtitle-2 mb-2">أبعاد الأرض</div>
        <div class="d-flex gap-4">
          <v-text-field
            v-model="model.frontage"
            class="w-100"
            label="الواجهة (متر)"
          />
          <v-text-field
            v-model="model.nazal"
            class="w-100"
            label="النزال / العمق (متر)"
            hint="عمق الأرض بالمتر، مثال: 12.5"
            persistent-hint
          />
        </div>

        <v-divider class="my-4" />
        <div class="form-grid">
          <v-text-field
            v-model="model.owner_name"
            :rules="[required]"
            label="اسم المالك"
          />
          <v-text-field
            v-model="model.owner_phone"
            :rules="[required]"
            label="رقم هاتف المالك"
          />
          <v-textarea
            v-model="model.owner_notes"
            label="ملاحظات المالك"
            rows="2"
          />
        </div>

        <v-expansion-panels
          v-model="extraOpen"
          class="my-4"
          variant="accordion"
        >
          <v-expansion-panel>
            <v-expansion-panel-title>
              حقول عقارية إضافية (اختيارية)
            </v-expansion-panel-title>
            <v-expansion-panel-text>
              <div class="form-grid">
                <v-text-field v-model="model.plot_number" label="رقم القطعة" />
                <v-text-field
                  v-model="model.plot_letter"
                  label="حرف القطعة (اختياري)"
                  hint="يقبل العربي والإنجليزي مثل: أ أو A"
                />
                <v-text-field
                  v-model="model.subdistrict_number"
                  label="رقم المقاطعة"
                />
                <v-text-field
                  v-model="model.subdistrict_name"
                  label="اسم المقاطعة"
                />
                <v-text-field v-model="model.mahalla" label="المحلة" />
                <v-text-field v-model="model.alley" label="الزقاق" />
                <v-text-field v-model="model.house_number" label="الدار" />
                <v-text-field
                  v-model="model.nearest_landmark"
                  label="أقرب نقطة دالة"
                />
                <v-text-field v-model="model.street_width" label="عرض الشارع" />
                <v-text-field
                  v-model="model.rooms_count"
                  label="عدد الغرف"
                  type="number"
                />
                <v-text-field
                  v-model="model.bathrooms_count"
                  label="عدد الحمامات"
                  type="number"
                />
              </div>
            </v-expansion-panel-text>
          </v-expansion-panel>
        </v-expansion-panels>

        <v-textarea v-model="model.notes" label="ملاحظات العقار" rows="3" />
      </v-card-text>
      <v-card-actions>
        <v-spacer />
        <v-btn variant="text" @click="emit('cancel')">إلغاء</v-btn>
        <v-btn
          color="primary"
          type="submit"
          :loading="saving"
          prepend-icon="mdi-content-save"
        >
          حفظ
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-form>
</template>
