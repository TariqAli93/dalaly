<script setup lang="ts">
import { computed, nextTick, ref } from "vue";
import {
  AREA_UNITS,
  RENT_PERIODS,
  RENTAL_PROPERTY_TYPES,
  RENTAL_STATUSES,
} from "../../constants/domain";
import { toNumber } from "../../utils/format";
import type { PersonRecord, RentalForm as RentalFormType } from "../../types";
import LocationSelects from "../properties/LocationSelects.vue";
import PropertyLocationEditor from "../shared/PropertyLocationEditor.vue";
import FormSection from "../shared/FormSection.vue";
import FormActionsBar from "../shared/FormActionsBar.vue";
import NumberField from "../app/NumberField.vue";
import PhoneField from "../app/PhoneField.vue";
import CountField from "../app/CountField.vue";
import PersonPicker from "../people/PersonPicker.vue";
import { AMENITY_OPTIONS } from "../../utils/amenities";

/**
 * نموذج العرض الإيجاري بأجزاء نموذج عرض البيع نفسها: أقسام بترتيب العمل (العرض،
 * الموقع، الإيجار والمساحة، المالك، المواصفات، الخريطة، الملاحظات)، والحقول
 * المطلوبة معلّمة بـ *، وأول حقل خاطئ يأخذ التركيز، وشريط حفظ ثابت. الصور في
 * صفحة العرض بعد الحفظ، كما في عروض البيع.
 */
const model = defineModel<RentalFormType>({ required: true });
const props = defineProps<{
  saving?: boolean;
  dirty?: boolean;
  fieldErrors?: Record<string, string[]>;
}>();
const emit = defineEmits<{ submit: []; cancel: [] }>();

type ValidationResult = {
  valid: boolean;
  errors: { id: string | number; errorMessages: string[] }[];
};
const formRef = ref<{ validate: () => Promise<ValidationResult> } | null>(null);

const FIELD_DEFAULTS = {
  VTextField: { hideDetails: "auto" },
  VSelect: { hideDetails: "auto" },
  VTextarea: { hideDetails: "auto" },
  VAutocomplete: { hideDetails: "auto" },
};

const required = (value: unknown) =>
  (value !== null && value !== undefined && String(value).trim() !== "") ||
  "هذا الحقل مطلوب";
const positive = (value: unknown) =>
  toNumber(value) > 0 || "يجب أن تكون القيمة أكبر من صفر";

const AMENITY_KEYS = new Set(AMENITY_OPTIONS.map((item) => item.key));
// المفاتيح خارج القائمة (من استيراد مثلاً) تبقى كما هي عند الحفظ.
const amenities = computed({
  get: () =>
    AMENITY_OPTIONS.filter(
      (item) => model.value.amenities[item.key] === true,
    ).map((item) => item.key),
  set: (keys: string[]) => {
    const kept = Object.entries(model.value.amenities).filter(
      ([key]) => !AMENITY_KEYS.has(key),
    );
    model.value.amenities = {
      ...Object.fromEntries(kept),
      ...Object.fromEntries(keys.map((key) => [key, true])),
    };
  },
});

// ربط المالك بزبون يملأ اسمه وهاتفه إن كانا فارغين، ولا يمسّ ما كُتب.
function ownerPicked(person: PersonRecord | null) {
  if (!person) return;
  if (!model.value.owner_name.trim()) model.value.owner_name = person.full_name;
  if (!model.value.owner_phone.trim() && person.phone_primary)
    model.value.owner_phone = person.phone_primary;
}

const errorsOf = (field: string) => props.fieldErrors?.[field] ?? [];

function focusElement(element: HTMLElement | null) {
  if (!element) return;
  element.scrollIntoView({ block: "center" });
  element.focus({ preventScroll: true });
}
function fieldElement(key: string) {
  return (
    document.querySelector<HTMLElement>(`.rental-form [name="${key}"]`) ??
    document.getElementById(key)
  );
}
/** التحقق، ثم التركيز على أول حقل خاطئ. */
async function validate() {
  const result = await formRef.value?.validate();
  if (result && !result.valid) {
    const first = result.errors[0]?.id;
    if (first !== undefined) focusElement(fieldElement(String(first)));
  }
  return result?.valid ?? false;
}
async function focusField(name: string) {
  await nextTick();
  focusElement(fieldElement(name));
}
defineExpose({ validate, focusField });
</script>

<template>
  <v-form
    ref="formRef"
    class="dal-panel rental-form dal-form"
    @submit.prevent="emit('submit')"
  >
    <v-defaults-provider :defaults="FIELD_DEFAULTS">
      <div class="dal-form__body">
        <p class="dal-form__hint">الحقول المعلّمة بـ * مطلوبة.</p>

        <FormSection title="العرض">
          <v-select
            v-model="model.property_type"
            name="property_type"
            :items="RENTAL_PROPERTY_TYPES"
            :rules="[required]"
            :error-messages="errorsOf('property_type')"
            label="نوع العقار *"
          />
          <v-select
            v-model="model.status"
            name="status"
            :items="RENTAL_STATUSES"
            :rules="[required]"
            :error-messages="errorsOf('status')"
            label="الحالة *"
          />
          <v-text-field
            v-model="model.name"
            name="name"
            :error-messages="errorsOf('name')"
            label="اسم العرض"
            hint="اختياري؛ يُستخدم «إيجار» ورمز العرض عند تركه فارغاً"
            persistent-hint
          />
        </FormSection>

        <FormSection title="الموقع">
          <LocationSelects
            v-model:governorate-id="model.governorate_id"
            v-model:district-id="model.district_id"
            v-model:neighborhood-id="model.neighborhood_id"
            v-model:governorate-text="model.governorate"
            v-model:district-text="model.district"
            v-model:neighborhood-text="model.neighborhood"
            class="form-section__wide"
          />
          <v-text-field
            v-model="model.address_details"
            name="address_details"
            class="form-section__wide"
            label="العنوان التفصيلي"
          />
        </FormSection>

        <FormSection title="الإيجار والمساحة">
          <NumberField
            v-model="model.rent_price"
            name="rent_price"
            :rules="[required, positive]"
            :error-messages="errorsOf('rent_price')"
            :decimals="false"
            label="سعر الإيجار (د.ع) *"
          />
          <v-select
            v-model="model.rent_period"
            name="rent_period"
            :items="RENT_PERIODS"
            :rules="[required]"
            :error-messages="errorsOf('rent_period')"
            label="نوع الإيجار *"
          />
          <v-switch
            v-model="model.is_negotiable"
            label="السعر قابل للتفاوض"
            color="primary"
            hide-details
          />
          <NumberField
            v-model="model.area_value"
            name="area_value"
            :rules="[required, positive]"
            :error-messages="errorsOf('area_value')"
            label="المساحة *"
          />
          <v-select
            v-model="model.area_unit"
            name="area_unit"
            :items="AREA_UNITS"
            :rules="[required]"
            :error-messages="errorsOf('area_unit')"
            label="وحدة المساحة *"
          />
        </FormSection>

        <FormSection title="المالك">
          <v-text-field
            v-model="model.owner_name"
            name="owner_name"
            :rules="[required]"
            :error-messages="errorsOf('owner_name')"
            label="اسم المالك *"
          />
          <PhoneField
            v-model="model.owner_phone"
            name="owner_phone"
            :rules="[required]"
            :error-messages="errorsOf('owner_phone')"
            label="هاتف المالك *"
          />
          <PersonPicker
            v-model="model.owner_person_id"
            clearable
            label="ربط المالك بزبون مسجّل"
            hint="يملأ الاسم والهاتف إن كانا فارغين"
            persistent-hint
            @picked="ownerPicked"
          />
        </FormSection>

        <FormSection title="المواصفات">
          <CountField
            v-model="model.rooms_count"
            name="rooms_count"
            label="عدد الغرف"
          />
          <CountField
            v-model="model.bathrooms_count"
            name="bathrooms_count"
            label="عدد الحمامات"
          />
          <CountField
            v-model="model.floors_count"
            name="floors_count"
            label="عدد الطوابق"
          />
          <div class="form-section__wide">
            <div class="dal-form__label">المميزات</div>
            <v-chip-group v-model="amenities" column multiple>
              <v-chip
                v-for="item in AMENITY_OPTIONS"
                :key="item.key"
                :value="item.key"
                filter
                variant="outlined"
                >{{ item.title }}</v-chip
              >
            </v-chip-group>
          </div>
          <v-textarea
            v-model="model.other_details"
            name="other_details"
            class="form-section__wide"
            label="تفاصيل أخرى"
            rows="2"
            auto-grow
          />
        </FormSection>

        <FormSection title="الموقع على الخريطة" :columns="1">
          <PropertyLocationEditor
            v-model:latitude="model.latitude"
            v-model:longitude="model.longitude"
            v-model:location-link="model.location_link"
          />
        </FormSection>

        <FormSection title="الملاحظات" :columns="2">
          <v-textarea
            v-model="model.notes"
            name="notes"
            label="ملاحظات الإيجار"
            rows="3"
            auto-grow
          />
          <v-textarea
            v-model="model.owner_notes"
            name="owner_notes"
            label="ملاحظات المالك"
            rows="3"
            auto-grow
          />
        </FormSection>
      </div>
    </v-defaults-provider>
    <FormActionsBar :saving="saving" :dirty="dirty" @cancel="emit('cancel')" />
  </v-form>
</template>
