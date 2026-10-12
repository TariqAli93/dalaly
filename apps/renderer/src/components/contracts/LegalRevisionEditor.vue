<script setup lang="ts">
import { computed, onMounted, onBeforeUnmount, ref, watch } from "vue";
import * as legal from "../../services/legal-content.service";
import * as contracts from "../../services/contracts.service";
import { usePermissions } from "../../composables/usePermissions";
import { useSnackbar } from "../../composables/useSnackbar";
import { getErrorMessage } from "../../services/api.service";
import ContractDocumentPreview from "./ContractDocumentPreview.vue";
import { platform } from "../../platform";
import type { ContractTemplateRecord, ContractRecord } from "../../types";
const props = defineProps<{
  revision?: legal.LegalRevision | null;
  imported?: legal.RevisionInput | null;
  mode: string;
  options: legal.LegalOptions;
  rows: legal.LegalRevision[];
  contractId?: number | null;
}>();
const emit = defineEmits<{ close: []; saved: [] }>();
const { can } = usePermissions(),
  { notifyError, notifySuccess } = useSnackbar();
const blank = (): legal.RevisionInput => ({
  contract_type: "rental",
  property_type: "house",
  jurisdiction: "iq_federal",
  transaction_kind: "lease",
  title: "",
  legal_basis: "",
  applicability_notes: "",
  clauses: [],
  target_at: new Date(Date.now() + 86400000).toISOString(),
  priority: 1,
  revision_note: "",
});
const form = ref<legal.RevisionInput>(
  props.imported
    ? JSON.parse(JSON.stringify(props.imported))
    : props.revision
      ? legal.payloadOf(props.revision)
      : blank(),
);
if (props.mode === "copy") {
  form.value.title += " — نسخة";
  form.value.revision_note = "نسخ صيغة إلى إصدار جديد";
}
const previewTab = ref("print"),
  renderedClauses = ref<Array<{ code: string; title: string; text: string }>>(
    [],
  ),
  previewVariables = ref<Array<{ key: string; value: string }>>([]),
  previewContent = ref("");
const readonly = computed(() => props.mode === "preview");
const legalLocked = computed(() =>
  Boolean(
    props.revision?.based_on_id ||
    props.revision?.approval_status === "approved" ||
    selectedBase.value,
  ),
);
const substantive = ref(false),
  busy = ref(false),
  previewing = ref(false),
  previewHtml = ref(""),
  previewError = ref(""),
  result = ref<legal.Validation | null>(null);
const locked = computed(
  () => readonly.value || (legalLocked.value && !substantive.value),
);
const designs = ref<ContractTemplateRecord[]>([]),
  visualId = ref<number | null>(null),
  realContracts = ref<ContractRecord[]>([]),
  dataSource = ref<number | null>(null),
  extraConditions = ref("");
const selectedBase = ref<number | null>(null),
  selectedLibrary = ref<number | null>(null),
  variable = ref<string | null>(null),
  activeClause = ref(0);
const availableBases = computed(() =>
  props.rows.filter(
    (r) =>
      r.approval_status === "approved" &&
      r.contract_type === form.value.contract_type &&
      r.property_type === form.value.property_type &&
      r.jurisdiction === form.value.jurisdiction &&
      r.transaction_kind === form.value.transaction_kind,
  ),
);
const scopeOptions = computed(() =>
  [
    ...new Set([
      ...legal.propertyScopes.map((p) => p.value),
      ...props.options.property_scopes,
    ]),
  ].map((value) => ({
    value,
    title: legal.propertyScopes.find((p) => p.value === value)?.title ?? value,
  })),
);
const library = computed(() =>
  props.options.clause_library.filter((c) =>
    c.contract_types.includes(form.value.contract_type),
  ),
);
const dateLocal = (value: string | null) =>
  value
    ? new Intl.DateTimeFormat("sv-SE", {
        timeZone: "Asia/Baghdad",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23",
      })
        .format(new Date(value))
        .replace(" ", "T")
    : "";
const target = ref(dateLocal(form.value.target_at));
const conditions = [
  { title: "نوع السند", value: "legal_type" },
  { title: "وحدة المساحة", value: "area_unit" },
  { title: "دورية الأجرة", value: "rent_period" },
  { title: "الاستخدام المتفق عليه", value: "intended_use" },
  { title: "المبلغ", value: "amount" },
  { title: "المدفوع", value: "paid_amount" },
  { title: "المتبقي", value: "remaining_amount" },
  { title: "مرجع التسجيل", value: "registration_reference" },
];
const operators = [
  { title: "يساوي", value: "eq" },
  { title: "لا يساوي", value: "neq" },
  { title: "أكبر من", value: "gt" },
  { title: "أكبر أو يساوي", value: "gte" },
  { title: "أصغر من", value: "lt" },
  { title: "أصغر أو يساوي", value: "lte" },
  { title: "موجود", value: "present" },
];
function payload() {
  return {
    ...form.value,
    target_at: target.value
      ? new Date(`${target.value}:00+03:00`).toISOString()
      : null,
    revision_note:
      form.value.revision_note.trim() || "معاينة والتحقق من الصيغة",
  };
}
function clearSource(c: legal.LegalClause) {
  c.source_clause_id = null;
  result.value = null;
}
function addClause() {
  form.value.clauses.push({
    clause_code: `clause_${Date.now().toString(36)}`,
    clause_title: "",
    clause_content_ar: "",
    clause_order: form.value.clauses.length + 1,
    is_required: true,
    conditions_json: { all: [] },
  });
  activeClause.value = form.value.clauses.length - 1;
}
function useLibrary() {
  const c = library.value.find(
    (c) => c.source_clause_id === selectedLibrary.value,
  );
  if (!c) return;
  const copy: legal.LegalClause = {
    clause_code: c.clause_code,
    clause_title: c.clause_title,
    clause_content_ar: c.clause_content_ar,
    clause_order: form.value.clauses.length + 1,
    is_required: c.is_required,
    conditions_json: JSON.parse(JSON.stringify(c.conditions_json)),
    source_clause_id: c.source_clause_id,
  };
  if (form.value.clauses.some((x) => x.clause_code === copy.clause_code))
    copy.clause_code += `_${Date.now().toString(36)}`;
  form.value.clauses.push(copy);
  selectedLibrary.value = null;
}
function reorder(index: number, direction: number) {
  const other = index + direction;
  if (other < 0 || other >= form.value.clauses.length) return;
  [form.value.clauses[index], form.value.clauses[other]] = [
    form.value.clauses[other],
    form.value.clauses[index],
  ];
  form.value.clauses.forEach((c, i) => (c.clause_order = i + 1));
  activeClause.value = other;
}
function insertVariable() {
  const c = form.value.clauses[activeClause.value];
  if (!c || !variable.value) return;
  c.clause_content_ar += ` {{${variable.value}}}`;
  clearSource(c);
  variable.value = null;
}
function useBase() {
  const base = availableBases.value.find((r) => r.id === selectedBase.value);
  if (!base) return;
  const copy = legal.payloadOf(base);
  form.value = {
    ...form.value,
    legal_basis: copy.legal_basis,
    applicability_notes: copy.applicability_notes,
    clauses: copy.clauses,
  };
  substantive.value = false;
}
let generation = 0,
  timer: ReturnType<typeof setTimeout> | undefined;
async function refreshPreview() {
  if (!visualId.value) return;
  const current = ++generation;
  previewing.value = true;
  try {
    const response = await legal.preview(
      payload(),
      visualId.value,
      dataSource.value ?? undefined,
      extraConditions.value,
    );
    if (current === generation) {
      previewHtml.value = response.html;
      previewContent.value = response.content;
      renderedClauses.value = response.rendered_clauses;
      previewVariables.value = response.variables;
      previewError.value = "";
    }
  } catch (e) {
    if (current === generation) {
      previewHtml.value = "";
      previewError.value = getErrorMessage(e);
    }
  } finally {
    if (current === generation) previewing.value = false;
  }
}
watch(
  [form, visualId, dataSource, extraConditions, target],
  () => {
    clearTimeout(timer);
    generation++;
    timer = setTimeout(() => void refreshPreview(), 500);
  },
  { deep: true },
);
watch(
  [form, target],
  () => {
    result.value = null;
  },
  { deep: true },
);
watch(
  () => form.value.contract_type,
  async (kind) => {
    form.value.transaction_kind =
      kind === "rental" ? "lease" : "preliminary_sale";
    dataSource.value = null;
    designs.value = await contracts.listTemplates(kind);
    visualId.value = designs.value[0]?.id ?? null;
  },
);
async function validate() {
  busy.value = true;
  try {
    result.value = await legal.validate(payload());
  } catch (e) {
    notifyError(getErrorMessage(e));
  } finally {
    busy.value = false;
  }
}
async function sampleOutput(pdf = false) {
  if (!previewHtml.value) return;
  busy.value = true;
  try {
    const result = pdf
      ? await platform.exportPdf({
          html: previewHtml.value,
          text: previewContent.value,
          title: "معاينة الصيغة القانونية",
          suggestedName: `معاينة_${form.value.title}.pdf`,
        })
      : await platform.printDocument({
          html: previewHtml.value,
          title: "طباعة تجريبية للصيغة القانونية",
        });
    if (!result.ok && !result.canceled)
      notifyError(result.message ?? "تعذر إخراج المعاينة.");
  } catch (e) {
    notifyError(getErrorMessage(e));
  } finally {
    busy.value = false;
  }
}
async function save(action?: string) {
  busy.value = true;
  let stored = false;
  try {
    const input = payload();
    if (!form.value.revision_note.trim()) {
      notifyError("أدخل سبب التغيير لحفظه في سجل الإصدارات.");
      return;
    }
    if (action) {
      result.value = await legal.validate(input);
      if (!result.value.valid) return;
    }
    const row = await legal.saveRevision(
      props.mode === "edit" ? (props.revision?.id ?? null) : null,
      input,
    );
    stored = true;
    if (action) await legal.decision(row.id, action, form.value.revision_note);
    notifySuccess(
      action === "approve_publish"
        ? "اعتمدت الصيغة ونشرت للعقود الجديدة."
        : action === "submit"
          ? "أرسلت الصيغة للاعتماد وفق نوع التغيير."
          : "حفظت المسودة بإصدار جديد.",
    );
    emit("saved");
    emit("close");
  } catch (e) {
    notifyError(
      (stored ? "حفظت المسودة، وتعذر إكمال القرار: " : "") + getErrorMessage(e),
    );
    if (stored) {
      emit("saved");
      emit("close");
    }
  } finally {
    busy.value = false;
  }
}
onMounted(async () => {
  try {
    designs.value = await contracts.listTemplates(form.value.contract_type);
    visualId.value = designs.value[0]?.id ?? null;
    if (can("contracts.read"))
      realContracts.value = await contracts.listContracts();
    if (
      props.contractId &&
      realContracts.value.some(
        (c) =>
          c.id === props.contractId &&
          c.contract_type === form.value.contract_type,
      )
    )
      dataSource.value = props.contractId;
    await refreshPreview();
  } catch (e) {
    notifyError(getErrorMessage(e));
  }
});
onBeforeUnmount(() => {
  clearTimeout(timer);
  generation++;
});
</script>
<template>
  <v-card class="legal-editor" rounded="lg">
    <v-card-title class="d-flex align-center ga-3"
      ><v-icon icon="mdi-text-box-edit-outline" /><span>{{
        readonly ? "معاينة الصيغة القانونية" : "محرر الصيغة القانونية"
      }}</span
      ><v-spacer /><v-btn
        icon="mdi-close"
        variant="text"
        aria-label="إغلاق المحرر"
        :disabled="busy"
        @click="emit('close')"
    /></v-card-title>
    <v-divider />
    <v-card-text class="editor-grid">
      <v-sheet class="editor-fields">
        <v-alert
          v-if="!readonly"
          type="info"
          variant="tonal"
          density="compact"
          class="mb-4"
          >تعديل البيانات الإدارية لا يغير الأحكام المعتمدة. يقارن النظام النصوص
          قبل النشر.</v-alert
        >
        <v-text-field
          v-model="form.title"
          label="اسم الصيغة"
          :readonly="readonly"
        />
        <v-row dense
          ><v-col cols="6"
            ><v-select
              v-model="form.contract_type"
              label="نوع العقد"
              :items="[
                { title: 'إيجار', value: 'rental' },
                { title: 'بيع', value: 'sale' },
              ]"
              :disabled="readonly || mode === 'edit'" /></v-col
          ><v-col cols="6"
            ><v-combobox
              v-model="form.property_type"
              :items="scopeOptions"
              :return-object="false"
              label="جنس العقار"
              :disabled="readonly || mode === 'edit'" /></v-col
        ></v-row>
        <v-row dense
          ><v-col cols="6"
            ><v-select
              v-model="form.jurisdiction"
              :items="legal.jurisdictions"
              label="الاختصاص"
              :disabled="readonly || mode === 'edit'" /></v-col
          ><v-col cols="6"
            ><v-select
              v-model="form.transaction_kind"
              :items="
                legal.transactionKinds.filter((k) =>
                  form.contract_type === 'rental'
                    ? k.value === 'lease'
                    : k.value !== 'lease',
                )
              "
              label="المعاملة القانونية"
              :disabled="readonly || mode === 'edit'" /></v-col
        ></v-row>
        <v-autocomplete
          v-if="!readonly && mode !== 'edit'"
          v-model="selectedBase"
          :items="availableBases"
          item-title="title"
          item-value="id"
          label="صيغة أساسية معتمدة"
          clearable
          @update:model-value="useBase"
        />
        <v-switch
          v-if="!readonly && (legalLocked || selectedBase)"
          v-model="substantive"
          color="warning"
          label="فتح تعديل الأحكام القانونية"
          hide-details
          class="mb-3"
        />
        <v-alert
          v-if="substantive"
          type="warning"
          variant="tonal"
          density="compact"
          class="mb-4"
          >راجع الأحكام وشروط تطبيقها قبل النشر. اتفاق المكتب لا يغني عن إجراءات
          التصديق أو التسجيل الرسمية المطلوبة.</v-alert
        >
        <v-textarea
          v-model="form.legal_basis"
          label="مصدر الصيغة والمراجع عند الحاجة"
          :readonly="locked"
          rows="2"
          auto-grow
        />
        <v-textarea
          v-model="form.applicability_notes"
          label="نطاق التطبيق والاستثناءات"
          :readonly="locked"
          rows="2"
          auto-grow
        />
        <div class="d-flex align-center mb-3">
          <h3 class="text-subtitle-1">البنود القانونية</h3>
          <v-spacer /><v-chip size="small" variant="tonal"
            >{{ form.clauses.length }} بند</v-chip
          >
        </div>
        <v-expansion-panels
          v-model="activeClause"
          variant="accordion"
          class="mb-4"
        >
          <v-expansion-panel
            v-for="(clause, index) in form.clauses"
            :key="clause.clause_code + index"
            :value="index"
          >
            <v-expansion-panel-title
              ><v-icon
                :icon="
                  clause.is_required
                    ? 'mdi-lock-outline'
                    : 'mdi-text-box-plus-outline'
                "
                size="18"
                class="me-2"
              /><span
                >{{ index + 1 }}. {{ clause.clause_title || "بند جديد" }}</span
              ><v-chip size="x-small" class="ms-2">{{
                clause.is_required ? "أساسي" : "اختياري"
              }}</v-chip></v-expansion-panel-title
            >
            <v-expansion-panel-text>
              <v-text-field
                v-model="clause.clause_title"
                label="عنوان البند"
                :readonly="locked"
                @update:model-value="clearSource(clause)"
              />
              <v-textarea
                v-model="clause.clause_content_ar"
                label="النص القانوني العربي"
                :readonly="locked"
                rows="5"
                auto-grow
                @update:model-value="clearSource(clause)"
              />
              <v-switch
                v-model="clause.is_required"
                label="بند أساسي إلزامي"
                :disabled="locked"
                hide-details
                @update:model-value="clearSource(clause)"
              />
              <v-expansion-panels variant="accordion" class="my-3"
                ><v-expansion-panel title="شروط تطبيق البند والرمز الثابت"
                  ><v-expansion-panel-text>
                    <v-text-field
                      v-model="clause.clause_code"
                      label="رمز البند"
                      :readonly="locked"
                    />
                    <p class="text-caption mb-2">
                      يطبق البند عند تحقق جميع الشروط.
                    </p>
                    <v-row
                      v-for="(condition, i) in clause.conditions_json.all"
                      :key="i"
                      dense
                    >
                      <v-col cols="5"
                        ><v-select
                          v-model="condition.field"
                          :items="conditions"
                          label="الحقل"
                          :disabled="locked"
                          @update:model-value="clearSource(clause)"
                      /></v-col>
                      <v-col cols="5"
                        ><v-select
                          v-model="condition.op"
                          :items="operators"
                          label="الشرط"
                          :disabled="locked"
                          @update:model-value="clearSource(clause)"
                      /></v-col>
                      <v-col cols="2"
                        ><v-btn
                          icon="mdi-close"
                          variant="text"
                          aria-label="إزالة شرط"
                          :disabled="locked"
                          @click="
                            clause.conditions_json.all.splice(i, 1);
                            clearSource(clause);
                          "
                      /></v-col>
                      <v-col cols="12"
                        ><v-number-input
                          v-if="
                            [
                              'amount',
                              'paid_amount',
                              'remaining_amount',
                            ].includes(condition.field)
                          "
                          :model-value="Number(condition.value ?? 0)"
                          :disabled="locked || condition.op === 'present'"
                          label="قيمة الشرط"
                          @update:model-value="
                            condition.value = $event ?? 0;
                            clearSource(clause);
                          " /><v-text-field
                          v-else
                          v-model="condition.value"
                          label="قيمة الشرط"
                          :disabled="locked || condition.op === 'present'"
                          @update:model-value="clearSource(clause)"
                      /></v-col>
                    </v-row>
                    <v-btn
                      v-if="!locked"
                      variant="text"
                      @click="
                        clause.conditions_json.all.push({
                          field: 'legal_type',
                          op: 'eq',
                          value: '',
                        });
                        clearSource(clause);
                      "
                      >إضافة شرط تطبيق</v-btn
                    >
                  </v-expansion-panel-text></v-expansion-panel
                ></v-expansion-panels
              >
              <div v-if="!readonly" class="d-flex ga-1">
                <v-btn
                  icon="mdi-arrow-up"
                  variant="text"
                  aria-label="نقل البند للأعلى"
                  :disabled="locked || index === 0"
                  @click="reorder(index, -1)"
                /><v-btn
                  icon="mdi-arrow-down"
                  variant="text"
                  aria-label="نقل البند للأسفل"
                  :disabled="locked || index === form.clauses.length - 1"
                  @click="reorder(index, 1)"
                /><v-spacer /><v-btn
                  color="error"
                  variant="text"
                  :disabled="locked"
                  @click="form.clauses.splice(index, 1)"
                  >إزالة البند</v-btn
                >
              </div>
            </v-expansion-panel-text>
          </v-expansion-panel>
        </v-expansion-panels>
        <template v-if="!readonly">
          <v-btn
            variant="tonal"
            prepend-icon="mdi-plus"
            :disabled="locked"
            @click="addClause"
            >إضافة بند</v-btn
          >
          <v-autocomplete
            v-model="selectedLibrary"
            :items="library"
            item-title="clause_title"
            item-value="source_clause_id"
            label="إعادة استخدام بند مراجع"
            :disabled="locked"
            class="mt-4"
            @update:model-value="useLibrary"
          />
          <v-autocomplete
            v-model="variable"
            :items="options.variables"
            label="إدراج متغير في البند المفتوح"
            :disabled="locked || !form.clauses.length"
            @update:model-value="insertVariable"
          />
          <v-textarea
            v-model="form.revision_note"
            label="سبب التغيير"
            rows="2"
          />
          <v-row dense
            ><v-col cols="7"
              ><v-text-field
                v-model="target"
                type="datetime-local"
                label="الموعد المستهدف — توقيت بغداد" /></v-col
            ><v-col cols="5"
              ><v-select
                v-model="form.priority"
                :items="legal.priorities"
                label="الأولوية"
                :disabled="!can('legal_content.manage')" /></v-col
          ></v-row>
          <p class="text-caption text-medium-emphasis">
            هدف إداري: تعديل شكلي خلال ٥ دقائق واعتماد المدير خلال يوم عمل. تحدد
            مهلة مراجعة النص داخل المكتب حسب طبيعة التغيير.
          </p>
        </template>
        <v-alert
          v-if="result"
          :type="result.valid ? 'success' : 'warning'"
          variant="tonal"
          class="mt-4"
          role="status"
          ><strong>{{ legal.changeLabels[result.change_kind] }}</strong>
          <p v-if="result.baseline_version">
            المقارنة مع الإصدار المعتمد {{ result.baseline_version }}.
          </p>
          <p v-for="issue in result.issues" :key="issue">{{ issue }}</p>
          <p v-if="result.valid">اكتمل التحقق الآلي.</p></v-alert
        >
      </v-sheet>
      <v-sheet class="editor-preview">
        <div class="d-flex align-center mb-3">
          <h3 class="text-subtitle-1">معاينة مباشرة · A4</h3>
          <v-spacer /><v-progress-circular
            v-if="previewing"
            indeterminate
            size="20"
            width="2"
          />
        </div>
        <v-row dense
          ><v-col cols="6"
            ><v-select
              v-model="visualId"
              :items="designs"
              item-title="name"
              item-value="id"
              label="التصميم المرئي" /></v-col
          ><v-col cols="6"
            ><v-autocomplete
              v-model="dataSource"
              :items="[
                { id: null, code: 'بيانات تجريبية' },
                ...realContracts.filter(
                  (c) => c.contract_type === form.contract_type,
                ),
              ]"
              item-title="code"
              item-value="id"
              label="بيانات المعاينة"
              clearable /></v-col
        ></v-row>
        <v-alert v-if="previewError" type="info" variant="tonal" class="mb-3">{{
          previewError
        }}</v-alert>
        <v-tabs
          v-model="previewTab"
          density="compact"
          color="primary"
          class="mb-3"
        >
          <v-tab value="raw">النص والمتغيرات</v-tab
          ><v-tab value="variables">بيانات المتغيرات</v-tab
          ><v-tab value="rendered">النص بعد الاستبدال</v-tab
          ><v-tab value="print">الشكل المطبوع</v-tab>
        </v-tabs>
        <v-sheet
          v-if="previewTab === 'raw'"
          class="raw-clauses"
          border
          rounded="lg"
        >
          <section
            v-for="(clause, i) in [...form.clauses].sort(
              (a, b) => a.clause_order - b.clause_order,
            )"
            :key="clause.clause_code"
            class="pa-3"
          >
            <h4>{{ i + 1 }}. {{ clause.clause_title }}</h4>
            <p class="legal-text">{{ clause.clause_content_ar }}</p>
          </section>
        </v-sheet>
        <v-data-table
          v-else-if="previewTab === 'variables'"
          :items="previewVariables"
          :headers="[
            { title: 'المتغير', key: 'key' },
            { title: 'القيمة المستخدمة', key: 'value' },
          ]"
          density="compact"
          :items-per-page="10"
          ><template #item.key="{ item }"
            ><code dir="ltr" v-text="'{{' + item.key + '}}'" /></template
        ></v-data-table>
        <v-sheet v-else-if="previewTab === 'rendered'" border rounded="lg">
          <section
            v-for="(clause, i) in renderedClauses"
            :key="clause.code"
            class="pa-3"
          >
            <h4>{{ i + 1 }}. {{ clause.title }}</h4>
            <p class="legal-text">{{ clause.text }}</p>
          </section>
        </v-sheet>
        <ContractDocumentPreview v-else-if="previewHtml" :html="previewHtml" />
        <v-sheet v-else class="preview-empty" border rounded
          ><v-icon icon="mdi-file-document-outline" size="40" />
          <p>أدخل اسم الصيغة والبنود لعرض معاينة العقد.</p></v-sheet
        >
        <v-expansion-panels variant="accordion" class="mt-3"
          ><v-expansion-panel title="تجربة شروط إضافية في المعاينة"
            ><v-expansion-panel-text
              ><v-textarea
                v-model="extraConditions"
                label="شروط إضافية تجريبية"
                rows="2"
              />
              <p class="text-caption">
                للمعاينة فقط. تظهر الشروط الحرة في العقد الفعلي دون اشتراط محامٍ
                موثّق. راجعها مع الأطراف قبل الإصدار.
              </p></v-expansion-panel-text
            ></v-expansion-panel
          ></v-expansion-panels
        >
      </v-sheet>
    </v-card-text>
    <v-divider />
    <v-card-actions class="editor-actions"
      ><v-btn :disabled="busy" @click="emit('close')">{{
        readonly ? "إغلاق" : "إلغاء"
      }}</v-btn
      ><v-spacer /><v-btn
        :disabled="!previewHtml || busy"
        prepend-icon="mdi-printer-outline"
        @click="sampleOutput()"
        >طباعة تجريبية</v-btn
      ><v-btn
        :disabled="!previewHtml || busy"
        prepend-icon="mdi-file-pdf-box"
        @click="sampleOutput(true)"
        >تصدير PDF</v-btn
      ><template v-if="!readonly"
        ><v-btn :disabled="busy" variant="text" @click="validate"
          >التحقق من الصيغة</v-btn
        ><v-btn :disabled="busy" variant="tonal" @click="save()"
          >حفظ كمسودة</v-btn
        ><v-btn :disabled="busy" variant="tonal" @click="save('submit')"
          >إرسال للاعتماد</v-btn
        ><v-btn
          v-if="can('legal_content.publish')"
          :loading="busy"
          color="primary"
          @click="save('approve_publish')"
          >اعتماد ونشر</v-btn
        ></template
      ></v-card-actions
    >
  </v-card>
</template>
<style scoped>
.legal-text {
  white-space: pre-wrap;
  line-height: 2;
  margin-top: 8px;
  overflow-wrap: anywhere;
}
.raw-clauses code {
  direction: ltr;
}
.legal-editor {
  max-height: calc(100dvh - 48px);
}
.editor-grid {
  display: grid;
  grid-template-columns: minmax(340px, 0.9fr) minmax(420px, 1.1fr);
  gap: 24px;
  overflow: auto;
  padding: 24px;
}
.editor-fields,
.editor-preview {
  min-width: 0;
  background: transparent;
}
.editor-preview {
  position: sticky;
  top: 0;
  align-self: start;
}
.editor-preview :deep(.document-frame) {
  height: 58vh;
  min-height: 360px;
  border-radius: 8px;
}
.preview-empty {
  display: grid;
  justify-items: center;
  align-content: center;
  gap: 16px;
  min-height: 360px;
  color: var(--dal-muted);
  background: var(--dal-canvas);
}
.editor-actions {
  flex-wrap: wrap;
  gap: 8px;
  padding: 12px 24px;
}
@media (max-width: 1000px) {
  .editor-grid {
    grid-template-columns: 1fr;
    padding: 16px;
  }
  .editor-preview {
    position: static;
  }
  .editor-actions {
    padding: 12px;
  }
}
</style>
