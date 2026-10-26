<script setup lang="ts">
import { computed, nextTick, ref, watch } from "vue";
import { AREA_UNITS, RENT_PERIODS } from "../../constants/domain";
import { REQUEST_STATUSES } from "../../constants/crm";
import * as requests from "../../services/requests.service";
import { useApiFormErrors } from "../../composables/useApiFormErrors";
import { usePermissions } from "../../composables/usePermissions";
import { useSnackbar } from "../../composables/useSnackbar";
import { AMENITY_OPTIONS } from "../../utils/amenities";
import {
  emptyRequestForm,
  requestLabel,
  requestPayload,
  requestPropertyTypes,
  requestToForm,
  type RequestForm,
  type RequestMode,
  type RequestRecord,
} from "../../utils/requestForm";
import type { PersonRecord } from "../../types";
import FormSection from "../shared/FormSection.vue";
import LocationSelects from "../properties/LocationSelects.vue";
import NumberField from "../app/NumberField.vue";
import CountField from "../app/CountField.vue";
import PersonPicker from "../people/PersonPicker.vue";
import PersonEditor from "../people/PersonEditor.vue";

/**
 * إضافة طلب شراء أو إيجار وتعديله في حوار نموذج:
 * - أقسام بترتيب المكالمة: الزبون، المطلوب، الميزانية والمساحة، الموقع،
 *   المواصفات، الملاحظات. الزبون يُختار بالاسم أو الهاتف، أو يُضاف هنا دون
 *   مغادرة الطلب.
 * - لا يُغلق بـ Esc أو بالنقر خارجه بعد أي تعديل؛ Ctrl+S وEnter يحفظان.
 * - أخطاء الخادم تحت حقولها؛ الحفظ يعيد السجل المحفوظ، والمطابقة للأب.
 */
const open = defineModel<boolean>({ required: true });
const props = defineProps<{
  mode: RequestMode;
  request: RequestRecord | null;
  /** زبون مختار مسبقاً لطلب جديد (من ملف الزبون). */
  personId?: number | null;
}>();
const emit = defineEmits<{ saved: [RequestRecord, boolean] }>();

const { can } = usePermissions();
const { notifyError } = useSnackbar();
const apiErrors = useApiFormErrors();
const form = ref<RequestForm>(emptyRequestForm(props.mode));
const saving = ref(false);
const personEditorOpen = ref(false);
const formRef = ref<{
  validate: () => Promise<{
    valid: boolean;
    errors: { id: string | number }[];
  }>;
} | null>(null);
// الطلب المحفوظ في هذا الحوار: حفظ ثانٍ يحدّثه ولا يُنشئ طلباً آخر.
const saved = ref<RequestRecord | null>(null);
const editing = computed(() => saved.value ?? props.request);

const label = computed(() => requestLabel(props.mode));
const title = computed(() =>
  editing.value
    ? `تعديل ${label.value} ${editing.value.code}`
    : `إضافة ${label.value}`,
);
const propertyItems = computed(() => requestPropertyTypes(props.mode));
const statusItems = computed(() =>
  editing.value?.status === "archived"
    ? [...REQUEST_STATUSES, { title: "مؤرشف", value: "archived" }]
    : REQUEST_STATUSES,
);

const FIELD_DEFAULTS = {
  VTextField: { hideDetails: "auto" },
  VSelect: { hideDetails: "auto" },
  VTextarea: { hideDetails: "auto" },
  VAutocomplete: { hideDetails: "auto" },
};
const required = (value: unknown) =>
  (value !== null && value !== undefined && String(value).trim() !== "") ||
  "هذا الحقل مطلوب";
const errorsOf = (field: string) => apiErrors.messages(field);

// ما فُتح به الحوار، لمعرفة هل عُدّل.
const openedWith = ref("");
const dirty = computed(
  () => open.value && JSON.stringify(form.value) !== openedWith.value,
);
let opener: HTMLElement | null = null;

watch(open, (isOpen) => {
  if (!isOpen) {
    // التركيز يعود إلى ما فتح الحوار، لا إلى بداية الصفحة.
    const target = opener;
    opener = null;
    if (target?.isConnected) void nextTick(() => target.focus());
    return;
  }
  opener = document.activeElement as HTMLElement | null;
  saved.value = null;
  apiErrors.clear();
  form.value = props.request
    ? requestToForm(props.request)
    : emptyRequestForm(props.mode, props.personId ?? null);
  openedWith.value = JSON.stringify(form.value);
});

function removeOtherAmenity(name: string) {
  form.value.other_amenities = form.value.other_amenities.filter(
    (item) => item !== name,
  );
}
function personCreated(person: PersonRecord) {
  form.value.person_id = person.id;
}

function focusFirstError(id?: string | number) {
  if (id === undefined) return;
  const element =
    document.querySelector<HTMLElement>(`.request-form [name="${id}"]`) ??
    document.getElementById(String(id));
  element?.focus();
}

async function save() {
  if (saving.value) return;
  apiErrors.clear();
  const result = await formRef.value?.validate();
  if (result && !result.valid) {
    focusFirstError(result.errors[0]?.id);
    return;
  }
  saving.value = true;
  const payload = requestPayload(form.value, props.mode);
  const current = editing.value;
  try {
    let record: RequestRecord;
    if (props.mode === "rental")
      record = current
        ? await requests.updateRentalRequest(current.id, payload)
        : await requests.createRentalRequest(payload);
    else
      record = current
        ? await requests.updatePurchaseRequest(current.id, payload)
        : await requests.createPurchaseRequest(payload);
    saved.value = record;
    openedWith.value = JSON.stringify(form.value);
    open.value = false;
    emit("saved", record, !current);
  } catch (cause) {
    const general = apiErrors.apply(cause);
    if (general) notifyError(general);
    const first = apiErrors.fields()[0];
    if (first) void nextTick(() => focusFirstError(first));
  } finally {
    saving.value = false;
  }
}

// Ctrl+S داخل الحوار (useSaveShortcut يتجاهل ما فوقه حوار). code لا key.
function onKeydown(event: KeyboardEvent) {
  if (!(event.ctrlKey || event.metaKey) || event.code !== "KeyS") return;
  if (personEditorOpen.value) return;
  event.preventDefault();
  void save();
}
</script>

<template>
  <v-dialog
    v-model="open"
    max-width="880"
    scrollable
    :persistent="dirty || saving"
    aria-labelledby="request-form-title"
  >
    <v-card tag="section" @keydown="onKeydown">
      <v-card-title id="request-form-title">{{ title }}</v-card-title>
      <v-divider />
      <v-card-text class="request-form__body">
        <v-form ref="formRef" class="request-form" @submit.prevent="save">
          <v-defaults-provider :defaults="FIELD_DEFAULTS">
            <p class="dal-form__hint">الحقول المعلّمة بـ * مطلوبة.</p>
            <FormSection title="الزبون" :columns="2">
              <PersonPicker
                v-model="form.person_id"
                name="person_id"
                :rules="[required]"
                :error-messages="errorsOf('person_id')"
                label="الزبون *"
                placeholder="ابحث بالاسم أو الهاتف"
                autofocus
              />
              <div class="request-form__new-person">
                <v-btn
                  v-if="can('people.create')"
                  variant="tonal"
                  prepend-icon="mdi-account-plus-outline"
                  @click="personEditorOpen = true"
                  >زبون جديد</v-btn
                >
              </div>
            </FormSection>

            <FormSection title="المطلوب">
              <v-select
                v-model="form.property_type"
                name="property_type"
                :items="propertyItems"
                :rules="[required]"
                :error-messages="errorsOf('property_type')"
                label="نوع العقار *"
              />
              <v-select
                v-if="mode === 'rental'"
                v-model="form.rent_period"
                name="rent_period"
                :items="RENT_PERIODS"
                :rules="[required]"
                :error-messages="errorsOf('rent_period')"
                label="نوع الإيجار *"
              />
              <v-select
                v-model="form.status"
                name="status"
                :items="statusItems"
                :error-messages="errorsOf('status')"
                label="الحالة"
              />
            </FormSection>

            <FormSection title="الميزانية">
              <NumberField
                v-model="form.budget_min"
                name="budget_min"
                :decimals="false"
                :error-messages="errorsOf('budget_min')"
                label="من (د.ع)"
              />
              <NumberField
                v-model="form.budget_max"
                name="budget_max"
                :decimals="false"
                :error-messages="errorsOf('budget_max')"
                label="إلى (د.ع)"
              />
            </FormSection>

            <FormSection title="الموقع">
              <LocationSelects
                v-model:governorate-id="form.governorate_id"
                v-model:district-id="form.district_id"
                v-model:neighborhood-id="form.neighborhood_id"
                v-model:governorate-text="form.governorate"
                v-model:district-text="form.district"
                v-model:neighborhood-text="form.neighborhood"
                class="form-section__wide"
              />
            </FormSection>

            <FormSection title="المساحة والمواصفات">
              <NumberField
                v-model="form.area_min"
                name="area_min"
                :error-messages="errorsOf('area_min')"
                label="المساحة من"
              />
              <NumberField
                v-model="form.area_max"
                name="area_max"
                :error-messages="errorsOf('area_max')"
                label="المساحة إلى"
              />
              <v-select
                v-model="form.area_unit"
                name="area_unit"
                :items="AREA_UNITS"
                label="وحدة المساحة"
                clearable
              />
              <CountField
                v-model="form.rooms_count"
                name="rooms_count"
                label="الغرف"
              />
              <CountField
                v-model="form.bathrooms_count"
                name="bathrooms_count"
                label="الحمامات"
              />
              <CountField
                v-model="form.floors_count"
                name="floors_count"
                label="الطوابق"
              />
              <fieldset class="request-form__amenities form-section__wide">
                <legend class="dal-form__label">المميزات المطلوبة</legend>
                <v-chip-group v-model="form.amenity_keys" column multiple>
                  <v-chip
                    v-for="item in AMENITY_OPTIONS"
                    :key="item.key"
                    :value="item.key"
                    filter
                    variant="outlined"
                    >{{ item.title }}</v-chip
                  >
                </v-chip-group>
                <div
                  v-if="form.other_amenities.length"
                  class="request-form__other"
                >
                  <span class="dal-form__label"
                    >مكتوبة يدوياً ولا تدخل في المطابقة:</span
                  >
                  <v-chip
                    v-for="name in form.other_amenities"
                    :key="name"
                    closable
                    :close-label="`إزالة ${name}`"
                    @click:close="removeOtherAmenity(name)"
                    >{{ name }}</v-chip
                  >
                </div>
              </fieldset>
            </FormSection>

            <FormSection title="الملاحظات" :columns="2">
              <v-textarea
                v-model="form.other_requirements"
                name="other_requirements"
                label="متطلبات إضافية"
                rows="2"
                auto-grow
              />
              <v-textarea
                v-model="form.notes"
                name="notes"
                label="ملاحظات"
                rows="2"
                auto-grow
              />
            </FormSection>
          </v-defaults-provider>
          <!-- زر إرسال مخفي: Enter في حقل نصي يحفظ. -->
          <button type="submit" hidden tabindex="-1" />
        </v-form>
      </v-card-text>
      <v-divider />
      <v-card-actions>
        <span v-if="dirty" class="request-form__state" role="status">
          <v-icon
            icon="mdi-circle"
            size="8"
            color="warning"
            aria-hidden="true"
          />
          تعديلات غير محفوظة
        </span>
        <v-spacer />
        <v-btn
          color="primary"
          variant="flat"
          :loading="saving"
          prepend-icon="mdi-content-save-outline"
          title="حفظ ومطابقة (Ctrl+S)"
          aria-keyshortcuts="Control+S"
          @click="save"
          >حفظ ومطابقة</v-btn
        >
        <v-btn variant="text" :disabled="saving" @click="open = false"
          >إلغاء</v-btn
        >
      </v-card-actions>
    </v-card>
    <PersonEditor
      v-model="personEditorOpen"
      :person="null"
      @saved="personCreated"
    />
  </v-dialog>
</template>

<style scoped>
.request-form__body {
  padding-top: 0;
}
.request-form__new-person {
  display: flex;
  align-items: center;
  min-height: 40px;
}
.request-form__amenities {
  border: 0;
  margin: 0;
  padding: 0;
}
.request-form__other {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  margin-top: 6px;
}
.request-form__state {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: var(--dal-muted);
  font-size: calc(13px * var(--dal-font-scale));
}
</style>
