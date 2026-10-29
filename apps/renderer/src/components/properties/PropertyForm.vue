<script setup lang="ts">
import { computed, nextTick, ref } from "vue";
import {
  AREA_UNITS,
  DIRECT_PRICE,
  LEGAL_TYPES,
  PRICING_METHODS,
  PROPERTY_TYPES,
  STATUSES,
} from "../../constants/domain";
import { formatMoney, toNumber } from "../../utils/format";
import type { PersonRecord, PropertyForm } from "../../types";
import LocationSelects from "./LocationSelects.vue";
import PropertyLocationEditor from "../shared/PropertyLocationEditor.vue";
import FormSection from "../shared/FormSection.vue";
import FormActionsBar from "../shared/FormActionsBar.vue";
import NumberField from "../app/NumberField.vue";
import PhoneField from "../app/PhoneField.vue";
import PersonPicker from "../people/PersonPicker.vue";
import CountField from "../app/CountField.vue";
import { AMENITY_OPTIONS } from "../../utils/amenities";

/**
 * نموذج العرض بترتيب العمل على الهاتف: العرض، ثم الموقع والقطعة (هوية القطعة
 * التي يكشف بها التكرار)، ثم المساحة والسعر، ثم المالك؛ والتفاصيل الإضافية
 * بعدها ظاهرة لا مطويّة. الحقول المطلوبة معلّمة بـ *، وأول حقل خاطئ يأخذ
 * التركيز. أخطاء الخادم تصل عبر fieldErrors باسم الحقل في الطلب.
 */
const model = defineModel<PropertyForm>({ required: true });

// ربط المالك بزبون يملأ اسمه وهاتفه إن كانا فارغين، ولا يمسّ ما كُتب.
function ownerPicked(person: PersonRecord | null) {
  if (!person) return;
  if (!model.value.owner_name.trim()) model.value.owner_name = person.full_name;
  if (!model.value.owner_phone.trim() && person.phone_primary)
    model.value.owner_phone = person.phone_primary;
}

const props = defineProps<{
  saving?: boolean;
  dirty?: boolean;
  fieldErrors?: Record<string, string[]>;
  /** عرض مسجّل بهوية القطعة نفسها (تحذير قبل الحفظ). */
  duplicate?: { id: number; label: string; owner: string } | null;
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
};

const AMENITY_KEYS = new Set(AMENITY_OPTIONS.map((item) => item.key));
// المفاتيح خارج القائمة (من استيراد إكسل مثلاً) تبقى كما هي عند الحفظ؛ كان
// الضابط يبني الكائن من الخيارات وحدها فيحذفها.
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

const required = (value: unknown) =>
  (value !== null && value !== undefined && String(value).trim() !== "") ||
  "هذا الحقل مطلوب";
const positive = (value: unknown) =>
  toNumber(value) > 0 || "يجب أن تكون القيمة أكبر من صفر";

const isDirectPrice = computed(
  () => model.value.pricing_method === DIRECT_PRICE,
);
const computedTotal = computed(() => {
  if (isDirectPrice.value) return toNumber(model.value.total_price);
  return toNumber(model.value.area_value) * toNumber(model.value.unit_price);
});

const errorsOf = (field: string) => props.fieldErrors?.[field] ?? [];

function focusElement(element: HTMLElement | null) {
  if (!element) return;
  element.scrollIntoView({ block: "center" });
  element.focus({ preventScroll: true });
}

// Vuetify يعرّف خطأ الحقل باسمه (name) إن وُجد، وإلا بمعرّف عنصره.
function fieldElement(key: string) {
  return (
    document.querySelector<HTMLElement>(`.property-form [name="${key}"]`) ??
    document.getElementById(key)
  );
}

/** التحقق، ثم التركيز على أول حقل خاطئ بدل رسالة عامة في أعلى الشاشة. */
async function validate() {
  const result = await formRef.value?.validate();
  if (result && !result.valid) {
    const first = result.errors[0]?.id;
    if (first !== undefined) focusElement(fieldElement(String(first)));
  }
  return result?.valid ?? false;
}

/** بعد خطأ من الخادم: التركيز على أول حقل يحمل رسالته. */
async function focusField(name: string) {
  await nextTick();
  focusElement(fieldElement(name));
}

defineExpose({ validate, focusField, computedTotal });
</script>

<template>
  <v-form
    ref="formRef"
    class="dal-panel property-form dal-form"
    @submit.prevent="emit('submit')"
  >
    <!-- سطر الرسائل يظهر عند خطأ أو تلميح فقط: 22px محجوزة تحت كل حقل كانت
         تطيل النموذج ثلث طوله. الإعداد العام معطّل عمداً، فيُفعَّل هنا وحده. -->
    <v-defaults-provider :defaults="FIELD_DEFAULTS">
      <div class="dal-form__body">
        <p class="dal-form__hint">الحقول المعلّمة بـ * مطلوبة.</p>

        <FormSection title="الموقع والقطعة">
          <LocationSelects
            v-model:governorate-id="model.governorate_id"
            v-model:district-id="model.district_id"
            v-model:neighborhood-id="model.neighborhood_id"
            v-model:governorate-text="model.governorate_text"
            v-model:district-text="model.district_text"
            v-model:neighborhood-text="model.neighborhood_text"
            class="form-section__wide"
          />
          <v-text-field
            v-model="model.plot_number"
            name="plot_number"
            :error-messages="errorsOf('plot_number')"
            label="رقم القطعة"
          />
          <v-text-field
            v-model="model.plot_letter"
            name="plot_letter"
            :error-messages="errorsOf('plot_letter')"
            label="حرف القطعة"
            hint="عربي أو إنجليزي، مثل: أ أو A"
          />
          <v-text-field
            v-model="model.subdistrict_number"
            name="subdistrict_number"
            label="رقم المقاطعة"
          />
          <v-text-field
            v-model="model.subdistrict_name"
            name="subdistrict_name"
            label="اسم المقاطعة"
          />
          <template #after>
            <v-alert
              v-if="duplicate"
              type="warning"
              variant="tonal"
              density="compact"
              class="mt-3"
              role="status"
            >
              هذه القطعة مسجّلة في عرض آخر: «{{ duplicate.label }}» باسم
              {{ duplicate.owner }}. الحفظ سيُرفض ما دامت هوية القطعة نفسها.
              <template #append>
                <v-btn
                  variant="text"
                  size="small"
                  :to="`/properties/${duplicate.id}`"
                  >فتح العرض</v-btn
                >
              </template>
            </v-alert>
          </template>
        </FormSection>

        <FormSection title="العرض">
          <v-select
            v-model="model.property_type"
            name="property_type"
            :items="PROPERTY_TYPES"
            :rules="[required]"
            :error-messages="errorsOf('property_type')"
            label="نوع العقار *"
          />
          <v-select
            v-model="model.legal_type"
            name="legal_type"
            :items="LEGAL_TYPES"
            :rules="[required]"
            :error-messages="errorsOf('legal_type')"
            label="الصفة القانونية *"
          />
          <v-select
            v-model="model.status"
            name="status"
            :items="STATUSES"
            :rules="[required]"
            :error-messages="errorsOf('status')"
            label="الحالة *"
          />
          <v-text-field
            v-model="model.name"
            name="name"
            class="form-section__wide"
            :error-messages="errorsOf('name')"
            label="اسم العرض"
            hint="اختياري؛ يُستخدم «عقار» ورمز العرض عند تركه فارغاً"
            persistent-hint
          />
        </FormSection>

        <FormSection title="المساحة والسعر">
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
          <v-select
            v-model="model.pricing_method"
            name="pricing_method"
            :items="PRICING_METHODS"
            :rules="[required]"
            :error-messages="errorsOf('pricing_method')"
            label="طريقة التسعير *"
          />
          <NumberField
            v-if="!isDirectPrice"
            v-model="model.unit_price"
            name="unit_price"
            :rules="[required, positive]"
            :error-messages="errorsOf('unit_price')"
            :decimals="false"
            :label="`سعر ${model.area_unit || 'الوحدة'} (د.ع) *`"
          />
          <NumberField
            v-else
            v-model="model.total_price"
            name="total_price"
            :rules="[required, positive]"
            :error-messages="errorsOf('total_price')"
            :decimals="false"
            label="السعر الإجمالي (د.ع) *"
          />
          <div class="property-form__total" aria-live="polite">
            <span>السعر الكلي</span>
            <strong
              ><bdi>{{ formatMoney(computedTotal) }}</bdi> د.ع</strong
            >
          </div>
          <v-switch
            v-model="model.is_negotiable"
            label="السعر قابل للتفاوض"
            color="primary"
            hide-details
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
          <v-textarea
            v-model="model.owner_notes"
            name="owner_notes"
            class="form-section__wide"
            label="ملاحظات المالك"
            rows="2"
            auto-grow
          />
        </FormSection>

        <FormSection title="تفاصيل إضافية">
          <v-text-field
            v-model="model.frontage"
            name="frontage"
            label="الواجهة (متر)"
          />
          <v-text-field
            v-model="model.nazal"
            name="nazal"
            label="النزال / العمق (متر)"
          />
          <v-text-field
            v-model="model.street_width"
            name="street_width"
            label="عرض الشارع (متر)"
          />
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
          <v-text-field v-model="model.mahalla" name="mahalla" label="المحلة" />
          <v-text-field v-model="model.alley" name="alley" label="الزقاق" />
          <v-text-field
            v-model="model.house_number"
            name="house_number"
            label="رقم الدار"
          />
          <v-text-field
            v-model="model.nearest_landmark"
            name="nearest_landmark"
            label="أقرب نقطة دالة"
          />
          <v-text-field
            v-model="model.address_details"
            name="address_details"
            class="form-section__wide"
            label="العنوان التفصيلي"
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
              >
                {{ item.title }}
              </v-chip>
            </v-chip-group>
          </div>
        </FormSection>

        <FormSection title="الموقع على الخريطة" :columns="1">
          <PropertyLocationEditor
            v-model:latitude="model.latitude"
            v-model:longitude="model.longitude"
            v-model:location-link="model.location_link"
          />
        </FormSection>

        <FormSection title="ملاحظات العقار" :columns="1">
          <v-textarea
            v-model="model.notes"
            name="notes"
            label="ملاحظات العقار"
            rows="3"
            auto-grow
          />
        </FormSection>
      </div>
    </v-defaults-provider>
    <FormActionsBar :saving="saving" :dirty="dirty" @cancel="emit('cancel')" />
  </v-form>
</template>

<style scoped>
.property-form__total {
  display: flex;
  flex-direction: column;
  justify-content: center;
  min-height: 40px;
}
.property-form__total span {
  color: var(--dal-muted);
  font-size: calc(12px * var(--dal-font-scale));
}
.property-form__total strong {
  font-size: calc(16px * var(--dal-font-scale));
  color: rgb(var(--v-theme-primary-text));
}
</style>
