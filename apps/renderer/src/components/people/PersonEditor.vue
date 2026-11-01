<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from "vue";
import { useRouter } from "vue-router";
import FormSection from "../shared/FormSection.vue";
import PhoneField from "../app/PhoneField.vue";
import * as peopleService from "../../services/people.service";
import { getErrorMessage } from "../../services/api.service";
import { useSnackbar } from "../../composables/useSnackbar";
import { useAssignees } from "../../composables/useAssignees";
import { usePermissions } from "../../composables/usePermissions";
import { PERSON_ROLES, PERSON_SOURCES } from "../../constants/crm";
import type {
  PersonDuplicate,
  PersonRecord,
  PersonRole,
  PersonSource,
} from "../../types";
const open = defineModel<boolean>({ required: true });
const props = defineProps<{
  person: PersonRecord | null;
  /**
   * After adding a customer, the message offers to open their file (from the
   * customers list; not inside another form, which would be left behind).
   */
  offerFile?: boolean;
}>();
const emit = defineEmits<{ saved: [PersonRecord] }>();

/**
 * إضافة زبون وتعديله: أقسام الاتصال والهوية والسكن وعلاقته بالمكتب (صفاته،
 * ومن أين جاء، والموظف المتابع)، والاسم وحده مطلوب. يُنبّه، دون أن يمنع،
 * إن كان للهاتف أو رقم الهوية زبون مسجل آخر. لا يُغلق بـ Esc أو بالنقر خارجه
 * بعد أي تعديل؛ Ctrl+S وEnter يحفظان، والتركيز يعود بعد الإغلاق إلى ما فتحه.
 */
const PERSON_TYPES = [
  { title: "فرد", value: "individual" },
  { title: "شركة", value: "company" },
  { title: "أخرى", value: "other" },
];
const STATUSES = [
  { title: "نشط", value: "active" },
  { title: "غير نشط", value: "inactive" },
];
const FIELD_DEFAULTS = {
  VTextField: { hideDetails: "auto" },
  VSelect: { hideDetails: "auto" },
  VTextarea: { hideDetails: "auto" },
};
let opener: HTMLElement | null = null;
const { notifySuccess } = useSnackbar();
const router = useRouter();
const { can } = usePermissions();
const { assignees, loadAssignees } = useAssignees();
const duplicates = ref<PersonDuplicate[]>([]);
let duplicateTimer: ReturnType<typeof setTimeout> | undefined;
let duplicateRequest = 0;
const saving = ref(false);
const submitted = ref(false);
const error = ref("");
const fieldErrors = ref<Record<string, string[]>>({});
const form = ref({
  full_name: "",
  phone_primary: "",
  phone_secondary: "",
  email: "",
  address: "",
  national_id: "",
  governorate: "",
  district: "",
  neighborhood: "",
  alley: "",
  house_number: "",
  residence_card_number: "",
  person_type: "individual" as PersonRecord["person_type"],
  status: "active" as PersonRecord["status"],
  notes: "",
  roles: [] as PersonRole[],
  source: null as PersonSource | null,
  assigned_user_id: null as number | null,
});
// بعد أي تعديل لا يُغلق الحوار بـ Esc أو بالنقر خارجه؛ «إلغاء» يبقى متاحاً.
const openedWith = ref("");
const dirty = computed(
  () => open.value && JSON.stringify(form.value) !== openedWith.value,
);
watch(
  () => [open.value, props.person] as const,
  ([isOpen, person]) => {
    if (!isOpen) {
      const target = opener;
      opener = null;
      if (target?.isConnected) void nextTick(() => target.focus());
      return;
    }
    opener ??= document.activeElement as HTMLElement | null;
    submitted.value = false;
    error.value = "";
    fieldErrors.value = {};
    form.value = {
      full_name: person?.full_name ?? "",
      phone_primary: person?.phone_primary ?? "",
      phone_secondary: person?.phone_secondary ?? "",
      email: person?.email ?? "",
      address: person?.address ?? "",
      national_id: person?.national_id ?? "",
      governorate: person?.governorate ?? "",
      district: person?.district ?? "",
      neighborhood: person?.neighborhood ?? "",
      alley: person?.alley ?? "",
      house_number: person?.house_number ?? "",
      residence_card_number: person?.residence_card_number ?? "",
      person_type: person?.person_type ?? "individual",
      status: person?.status ?? "active",
      notes: person?.notes ?? "",
      roles: [...(person?.roles ?? [])],
      source: person?.source ?? null,
      assigned_user_id: person?.assigned_user_id ?? null,
    };
    openedWith.value = JSON.stringify(form.value);
    duplicates.value = [];
    void loadAssignees();
  },
  { immediate: true },
);
// زبون آخر بالهاتف أو رقم الهوية نفسه: تنبيه بعد توقف الكتابة، لا منع.
watch(
  () => [
    open.value,
    form.value.phone_primary,
    form.value.phone_secondary,
    form.value.national_id,
  ],
  () => {
    clearTimeout(duplicateTimer);
    if (!open.value || !can("people.read")) return;
    duplicateTimer = setTimeout(async () => {
      const current = ++duplicateRequest;
      const { phone_primary, phone_secondary, national_id } = form.value;
      if (!phone_primary && !phone_secondary && !national_id.trim()) {
        duplicates.value = [];
        return;
      }
      try {
        const found = await peopleService.findDuplicatePeople({
          phone: phone_primary || undefined,
          phone_secondary: phone_secondary || undefined,
          national_id: national_id.trim() || undefined,
          exclude_id: props.person?.id,
        });
        if (current === duplicateRequest) duplicates.value = found;
      } catch {
        // التنبيه مساعدة؛ فشله لا يمنع الحفظ.
      }
    }, 400);
  },
);
onBeforeUnmount(() => clearTimeout(duplicateTimer));
const matchedOn = (row: PersonDuplicate) =>
  row.matched_on
    .map((field) => (field === "phone" ? "الهاتف" : "رقم الهوية"))
    .join(" و");

async function save() {
  if (saving.value) return;
  submitted.value = true;
  if (!form.value.full_name.trim()) {
    document
      .querySelector<HTMLElement>('.person-editor [name="full_name"]')
      ?.focus();
    return;
  }
  saving.value = true;
  error.value = "";
  fieldErrors.value = {};
  try {
    const person = props.person
      ? await peopleService.updatePerson(props.person.id, form.value)
      : await peopleService.createPerson(form.value);
    open.value = false;
    notifySuccess(
      `تم حفظ بيانات ${person.full_name}.`,
      props.offerFile && !props.person
        ? {
            label: "فتح ملف الزبون",
            run: () => void router.push(`/clients/${person.id}`),
          }
        : undefined,
    );
    emit("saved", person);
  } catch (cause) {
    // الخادم يرسل { field, message } (ApiErrorBody)؛ path احتياط لشكل قديم.
    const issues = (
      cause as {
        issues?: Array<{
          message: string;
          field?: string;
          path?: string | (string | number)[];
        }>;
      }
    )?.issues;
    if (issues?.length) {
      for (const issue of issues) {
        const key =
          issue.field ??
          (Array.isArray(issue.path) ? issue.path.join(".") : issue.path);
        if (key) (fieldErrors.value[key] ??= []).push(issue.message);
        else error.value = issue.message;
      }
    } else error.value = getErrorMessage(cause);
  } finally {
    saving.value = false;
  }
}
// Ctrl+S داخل الحوار (useSaveShortcut يتجاهل ما فوقه حوار). code لا key.
function onKeydown(event: KeyboardEvent) {
  if (!(event.ctrlKey || event.metaKey) || event.code !== "KeyS") return;
  event.preventDefault();
  void save();
}
const nameError = computed(() =>
  submitted.value && !form.value.full_name.trim()
    ? ["اسم الزبون مطلوب."]
    : fieldErrors.value.full_name,
);
</script>

<template>
  <v-dialog
    v-model="open"
    max-width="760"
    scrollable
    :persistent="dirty || saving"
    aria-labelledby="person-editor-title"
  >
    <v-card class="person-editor" @keydown="onKeydown">
      <v-card-title id="person-editor-title">{{
        person ? `تعديل ${person.full_name}` : "إضافة زبون"
      }}</v-card-title>
      <v-divider />
      <v-card-text>
        <v-alert v-if="error" type="error" variant="tonal" class="mb-3">{{
          error
        }}</v-alert>
        <v-form @submit.prevent="save">
          <v-defaults-provider :defaults="FIELD_DEFAULTS">
            <p class="dal-form__hint">
              الاسم وحده مطلوب؛ الباقي يُكمَل لاحقاً.
            </p>
            <FormSection title="الاتصال" :columns="2">
              <v-text-field
                v-model="form.full_name"
                name="full_name"
                class="form-section__wide"
                label="الاسم الرباعي مع اللقب *"
                :error-messages="nameError"
                autofocus
              />
              <PhoneField
                v-model="form.phone_primary"
                name="phone_primary"
                label="الهاتف"
                :error-messages="fieldErrors.phone_primary"
              />
              <PhoneField
                v-model="form.phone_secondary"
                name="phone_secondary"
                label="هاتف إضافي"
                :error-messages="fieldErrors.phone_secondary"
              />
              <v-text-field
                v-model="form.email"
                name="email"
                type="email"
                label="البريد الإلكتروني"
                :error-messages="fieldErrors.email"
              />
              <v-select
                v-model="form.person_type"
                :items="PERSON_TYPES"
                label="النوع"
              />
            </FormSection>
            <v-alert
              v-if="duplicates.length"
              type="warning"
              variant="tonal"
              density="compact"
              class="mb-3"
              role="status"
            >
              <p class="mb-1">
                يوجد زبون مسجل بالبيانات نفسها؛ تأكد أنه ليس الشخص ذاته قبل
                الحفظ:
              </p>
              <ul class="person-editor__duplicates">
                <li v-for="row in duplicates" :key="row.id">
                  <strong>{{ row.full_name }}</strong>
                  (<bdi>{{ row.code }}</bdi
                  >) — {{ matchedOn(row)
                  }}<span v-if="row.status === 'archived'"> (مؤرشف)</span>
                </li>
              </ul>
            </v-alert>
            <FormSection title="الهوية" :columns="2">
              <v-text-field
                v-model="form.national_id"
                name="national_id"
                label="رقم البطاقة الوطنية أو هوية الأحوال المدنية"
                :error-messages="fieldErrors.national_id"
              />
              <v-text-field
                v-model="form.residence_card_number"
                name="residence_card_number"
                label="رقم بطاقة السكن"
                :error-messages="fieldErrors.residence_card_number"
              />
            </FormSection>
            <FormSection title="السكن">
              <v-text-field v-model="form.governorate" label="المحافظة" />
              <v-text-field v-model="form.district" label="القضاء أو الناحية" />
              <v-text-field
                v-model="form.neighborhood"
                label="المنطقة أو المحلة"
              />
              <v-text-field v-model="form.alley" label="الزقاق" />
              <v-text-field v-model="form.house_number" label="الدار" />
              <v-select
                v-if="person && person.status !== 'archived'"
                v-model="form.status"
                :items="STATUSES"
                label="الحالة"
              />
              <v-text-field
                v-model="form.address"
                class="form-section__wide"
                label="محل الإقامة الحالي وتفاصيل العنوان"
              />
            </FormSection>
            <FormSection title="علاقته بالمكتب" :columns="2">
              <v-select
                v-model="form.roles"
                :items="PERSON_ROLES"
                class="form-section__wide"
                label="صفة الزبون"
                hint="قد تجتمع أكثر من صفة؛ مالك العرض وصاحب الطلب يُعرفان من سجلاتهما أيضاً."
                persistent-hint
                multiple
                chips
                closable-chips
              />
              <v-select
                v-model="form.source"
                :items="PERSON_SOURCES"
                label="كيف وصل إلى المكتب"
                clearable
              />
              <v-select
                v-if="assignees.length"
                v-model="form.assigned_user_id"
                :items="assignees"
                item-title="display_name"
                item-value="id"
                label="الموظف المتابع"
                clearable
              />
            </FormSection>
            <FormSection title="الملاحظات" :columns="1">
              <v-textarea
                v-model="form.notes"
                label="ملاحظات"
                rows="2"
                auto-grow
              />
            </FormSection>
          </v-defaults-provider>
          <button type="submit" hidden tabindex="-1" />
        </v-form>
      </v-card-text>
      <v-divider />
      <v-card-actions>
        <v-spacer />
        <v-btn
          color="primary"
          variant="flat"
          :loading="saving"
          prepend-icon="mdi-content-save-outline"
          title="حفظ (Ctrl+S)"
          aria-keyshortcuts="Control+S"
          @click="save"
          >حفظ</v-btn
        >
        <v-btn variant="text" :disabled="saving" @click="open = false"
          >إلغاء</v-btn
        >
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<style scoped>
.person-editor__duplicates {
  margin: 0;
  padding-inline-start: 18px;
}
</style>
