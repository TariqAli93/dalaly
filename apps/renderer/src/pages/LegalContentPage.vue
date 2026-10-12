<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { useRoute } from "vue-router";
import AppLayout from "../layouts/AppLayout.vue";
import LegalRevisionEditor from "../components/contracts/LegalRevisionEditor.vue";
import { usePermissions } from "../composables/usePermissions";
import { useSnackbar } from "../composables/useSnackbar";
import { getErrorMessage } from "../services/api.service";
import * as legal from "../services/legal-content.service";
const { can } = usePermissions(),
  { notifyError, notifySuccess } = useSnackbar(),
  route = useRoute();
const rows = ref<legal.LegalRevision[]>([]),
  history = ref<legal.LegalEvent[]>([]),
  options = ref<legal.LegalOptions>({
    property_scopes: [],
    variables: [],
    clause_library: [],
  });
const tab = ref("rental"),
  propertyFilter = ref<string | null>(null),
  statusFilter = ref<string | null>(null),
  search = ref(""),
  loading = ref(false),
  busy = ref(false);
const editing = ref(false),
  mode = ref("new"),
  selected = ref<legal.LegalRevision | null>(null),
  imported = ref<legal.RevisionInput | null>(null);
const canEdit = computed(
  () => can("legal_content.manage") || can("legal_content.propose"),
);
const returnContractId = computed(() => {
  const id = Number(route.query.contract_id);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
});
const latest = computed(() =>
  rows.value.filter(
    (r, i, all) =>
      r.property_type !== "*" &&
      all.findIndex((x) => x.family_code === r.family_code) === i,
  ),
);
const displayRows = computed(() =>
  rows.value.filter(
    (r) =>
      r.property_type !== "*" &&
      (latest.value.some((l) => l.id === r.id) ||
        r.publication_status === "active" ||
        r.approval_status === "pending"),
  ),
);
const visible = computed(() =>
  displayRows.value.filter(
    (r) =>
      r.contract_type === tab.value &&
      (!propertyFilter.value || r.property_type === propertyFilter.value) &&
      (!statusFilter.value || r.workflow_status === statusFilter.value) &&
      r.title.includes((search.value ?? "").trim()),
  ),
);
const statistics = computed(() => [
  {
    label: "إجمالي الصيغ",
    value: latest.value.length,
    icon: "mdi-text-box-multiple-outline",
  },
  {
    label: "الصيغ النشطة",
    value: rows.value.filter((r) => r.publication_status === "active").length,
    icon: "mdi-check-circle-outline",
  },
  {
    label: "المسودات",
    value: latest.value.filter((r) => r.approval_status === "draft").length,
    icon: "mdi-pencil-outline",
  },
  {
    label: "تحتاج إجراء",
    value: rows.value.filter(
      (r) =>
        r.approval_status === "pending" ||
        (r.approval_status === "approved" &&
          r.publication_status === "unpublished"),
    ).length,
    icon: "mdi-clock-alert-outline",
  },
]);
const scopeLabel = (value: string) =>
  legal.propertyScopes.find((p) => p.value === value)?.title ??
  (value === "*" ? "نص سابق محفوظ" : value);
const scopes = computed(() =>
  [
    ...new Set([
      ...options.value.property_scopes,
      ...latest.value.map((r) => r.property_type),
    ]),
  ].map((value) => ({ value, title: scopeLabel(value) })),
);
const date = (value: string | null) =>
  value
    ? new Date(value).toLocaleString("ar-IQ", {
        timeZone: "Asia/Baghdad",
        dateStyle: "short",
        timeStyle: "short",
      })
    : "—";
const color = (status: string) =>
  status === "active"
    ? "success"
    : status === "specialist_review"
      ? "warning"
      : status === "ready"
        ? "info"
        : status === "approved"
          ? "primary"
          : "default";
const deadline = (row: legal.LegalRevision) => {
  if (!row.target_at) return "بدون موعد مستهدف";
  const hours = Math.ceil(
    (new Date(row.target_at).getTime() - Date.now()) / 3600000,
  );
  return hours <= 0
    ? `متأخر ${Math.abs(hours)} ساعة`
    : hours > 24
      ? `متبقي ${Math.ceil(hours / 24)} يوم`
      : `متبقي ${hours} ساعة`;
};
const taskGroups = computed(() => {
  const map = new Map<
    string,
    {
      title: string;
      count: number;
      overdue: number;
      kind: string;
      property: string;
      status: string;
    }
  >();
  for (const r of rows.value.filter((r) => r.approval_status === "pending")) {
    const key = [r.contract_type, r.property_type, r.review_required].join(":");
    const group = map.get(key) ?? {
      title: `${r.contract_type === "rental" ? "إيجار" : "بيع"} · ${scopeLabel(r.property_type)} · ${r.review_required ? "مراجعة النص" : "اعتماد المدير"}`,
      count: 0,
      overdue: 0,
      kind: r.contract_type,
      property: r.property_type,
      status: r.review_required ? "specialist_review" : "ready",
    };
    group.count++;
    if (r.target_at && new Date(r.target_at).getTime() < Date.now())
      group.overdue++;
    map.set(key, group);
  }
  return [...map.values()];
});
const family = ref<string | null>(null),
  left = ref<number | null>(null),
  right = ref<number | null>(null),
  comparison = ref<Awaited<ReturnType<typeof legal.compare>> | null>(null);
const versions = computed(() =>
  rows.value.filter((r) => !family.value || r.family_code === family.value),
);
const families = computed(() => [
  ...new Map(
    rows.value
      .filter(
        (r, i, all) =>
          all.findIndex((x) => x.family_code === r.family_code) === i,
      )
      .map((r) => [r.family_code, { title: r.title, value: r.family_code }]),
  ).values(),
]);
const versionLabel = (r: legal.LegalRevision) =>
  `${r.title} · إصدار ${r.version} · ${legal.statusLabels[r.workflow_status]}`;
const importOpen = ref(false),
  importText = ref(""),
  importFile = ref<File | File[] | null>(null),
  importError = ref("");
const decisionOpen = ref(false),
  action = ref("submit"),
  comment = ref("");
const scheduleOpen = ref(false),
  scheduleTarget = ref(""),
  schedulePriority = ref(1);
const deleteOpen = ref(false),
  deleteError = ref("");
const headers = [
  { title: "اسم الصيغة", key: "title" },
  { title: "نوع العقد", key: "contract_type" },
  { title: "جنس العقار", key: "property_type" },
  { title: "الفئة", key: "category" },
  { title: "الإصدار", key: "version" },
  { title: "الحالة", key: "workflow_status" },
  { title: "آخر تعديل", key: "updated_at" },
  { title: "الإجراءات", key: "actions", sortable: false },
];
const eventNames: Record<string, string> = {
  revision: "إصدار جديد",
  submit: "إرسال للاعتماد",
  approve: "اعتماد",
  approve_publish: "اعتماد ونشر",
  publish: "تفعيل",
  default: "تحديد الافتراضي",
  archive: "إيقاف",
  delete: "حذف الصيغة المخصصة",
  reject: "رفض",
  restore: "استعادة كإصدار جديد",
  schedule: "تعديل الموعد والأولوية",
};
watch(
  () => route.query,
  (q) => {
    if (q.contract_type === "sale" || q.contract_type === "rental")
      tab.value = q.contract_type;
    if (q.tab === "history") tab.value = "history";
    propertyFilter.value =
      typeof q.property_type === "string" ? q.property_type : null;
  },
  { immediate: true },
);
watch([left, right], () => {
  comparison.value = null;
});
async function load() {
  loading.value = true;
  try {
    [rows.value, history.value, options.value] = await Promise.all([
      legal.listLegalContent(),
      legal.legalHistory(),
      legal.options(),
    ]);
    window.dispatchEvent(new Event("dalaly:legal-content-changed"));
  } catch (e) {
    notifyError(getErrorMessage(e));
  } finally {
    loading.value = false;
  }
}
function editor(row: legal.LegalRevision | null = null, kind = "new") {
  selected.value = row;
  mode.value = kind;
  imported.value = null;
  if (kind === "edit" && row) {
    selected.value =
      rows.value.find((r) => r.family_code === row.family_code) ?? row;
  }
  editing.value = true;
}
function showVersions(row?: legal.LegalRevision) {
  family.value = row?.family_code ?? null;
  tab.value = "history";
  const list = rows.value.filter(
    (r) => !row || r.family_code === row.family_code,
  );
  right.value = list[0]?.id ?? null;
  left.value = list[1]?.id ?? list[0]?.id ?? null;
  comparison.value = null;
}
async function compare() {
  if (!left.value || !right.value) return;
  busy.value = true;
  try {
    comparison.value = await legal.compare(left.value, right.value);
  } catch (e) {
    notifyError(getErrorMessage(e));
  } finally {
    busy.value = false;
  }
}
async function restore(row: legal.LegalRevision) {
  busy.value = true;
  try {
    await legal.restore(row.id);
    await load();
    notifySuccess(
      "أنشئ إصدار جديد من النص السابق؛ تحدد المقارنة مسار اعتماده.",
    );
  } catch (e) {
    notifyError(getErrorMessage(e));
  } finally {
    busy.value = false;
  }
}
function decide(row: legal.LegalRevision, value: string) {
  selected.value = row;
  action.value = value;
  comment.value = "";
  decisionOpen.value = true;
}
async function saveDecision() {
  if (!selected.value) return;
  busy.value = true;
  try {
    await legal.decision(selected.value.id, action.value, comment.value);
    decisionOpen.value = false;
    await load();
    notifySuccess("سجل القرار وحدّثت حالة الصيغة.");
  } catch (e) {
    notifyError(getErrorMessage(e));
  } finally {
    busy.value = false;
  }
}
function openSchedule(row: legal.LegalRevision) {
  selected.value = row;
  scheduleTarget.value = row.target_at
    ? new Intl.DateTimeFormat("sv-SE", {
        timeZone: "Asia/Baghdad",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23",
      })
        .format(new Date(row.target_at))
        .replace(" ", "T")
    : "";
  schedulePriority.value = row.priority;
  scheduleOpen.value = true;
}
async function saveSchedule() {
  if (!selected.value) return;
  busy.value = true;
  try {
    await legal.schedule(
      selected.value.id,
      scheduleTarget.value
        ? new Date(`${scheduleTarget.value}:00+03:00`).toISOString()
        : null,
      schedulePriority.value,
    );
    scheduleOpen.value = false;
    await load();
  } catch (e) {
    notifyError(getErrorMessage(e));
  } finally {
    busy.value = false;
  }
}
async function readImport() {
  const file = Array.isArray(importFile.value)
    ? importFile.value[0]
    : importFile.value;
  if (file) {
    if (file.size > 2 * 1024 * 1024) {
      importError.value = "الحد الأقصى للملف ٢ ميغابايت.";
      return;
    }
    importText.value = await file.text();
  }
}
function openImport() {
  try {
    const data = JSON.parse(importText.value);
    const value = data.revision ?? data;
    const clauses = Array.isArray(value.clauses)
      ? value.clauses.map((c: legal.LegalClause) => ({
          clause_code: c.clause_code,
          clause_title: c.clause_title,
          clause_content_ar: c.clause_content_ar,
          clause_order: c.clause_order,
          is_required: c.is_required,
          conditions_json: c.conditions_json ?? { all: [] },
        }))
      : [];
    if (
      !["rental", "sale"].includes(value.contract_type) ||
      typeof value.property_type !== "string" ||
      !value.title
    )
      throw new Error(
        "اختر ملف صيغة دلالي يحتوي الاسم والنوع وجنس العقار والبنود.",
      );
    imported.value = {
      contract_type: value.contract_type,
      property_type: value.property_type,
      jurisdiction: value.jurisdiction ?? "iq_federal",
      transaction_kind:
        value.transaction_kind ??
        (value.contract_type === "rental" ? "lease" : "preliminary_sale"),
      title: value.title,
      legal_basis: value.legal_basis ?? "",
      applicability_notes: value.applicability_notes ?? "",
      clauses,
      priority: 1,
      target_at: null,
      revision_note: "استيراد صيغة للمراجعة",
    };
    selected.value = null;
    mode.value = "import";
    importOpen.value = false;
    editing.value = true;
    importError.value = "";
  } catch (e) {
    importError.value =
      e instanceof SyntaxError ? "ملف JSON غير صالح." : (e as Error).message;
  }
}
function exportSource(row: legal.LegalRevision) {
  const input = legal.payloadOf(row);
  input.clauses.forEach((c) => delete c.source_clause_id);
  const blob = new Blob(
      [
        JSON.stringify(
          { format: "dalaly-legal-revision-v1", revision: input },
          null,
          2,
        ),
      ],
      { type: "application/json" },
    ),
    url = URL.createObjectURL(blob),
    a = document.createElement("a");
  a.href = url;
  a.download = `صيغة_${row.contract_type}_${row.property_type}_v${row.version}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function confirmDelete(row: legal.LegalRevision) {
  selected.value = row;
  deleteError.value = "";
  deleteOpen.value = true;
}
async function removeTemplate() {
  if (!selected.value) return;
  busy.value = true;
  try {
    await legal.deleteTemplate(selected.value.id);
    deleteOpen.value = false;
    await load();
    notifySuccess("أرشفت الصيغة وحفظت نسخ العقود السابقة.");
  } catch (e) {
    deleteError.value = getErrorMessage(e);
  } finally {
    busy.value = false;
  }
}
onMounted(load);
</script>
<template>
  <AppLayout
    title="الصيغ القانونية"
    subtitle="صيغ اتفاقات المكتب للبيع والإيجار، والبنود الاختيارية وسجل الإصدارات."
  >
    <template #header-actions
      ><v-btn
        v-if="canEdit"
        color="primary"
        prepend-icon="mdi-plus"
        @click="editor()"
        >إضافة صيغة</v-btn
      ><v-btn
        v-if="canEdit"
        variant="tonal"
        prepend-icon="mdi-import"
        @click="importOpen = true"
        >استيراد صيغة</v-btn
      ><v-btn variant="text" prepend-icon="mdi-history" @click="showVersions()"
        >سجل الإصدارات</v-btn
      ></template
    >
    <v-btn
      v-if="returnContractId"
      :to="{ path: '/contracts', query: { view: returnContractId } }"
      variant="text"
      prepend-icon="mdi-arrow-right"
      class="mb-3"
      >العودة إلى العقد</v-btn
    >
    <v-row class="mb-3" dense
      ><v-col v-for="stat in statistics" :key="stat.label" cols="6" md="3"
        ><v-card variant="flat" border rounded="lg" class="stat-card"
          ><v-card-text class="d-flex align-center ga-3"
            ><v-avatar variant="tonal" color="primary"
              ><v-icon :icon="stat.icon"
            /></v-avatar>
            <div>
              <p class="text-caption text-medium-emphasis">{{ stat.label }}</p>
              <strong class="text-h5">{{ stat.value }}</strong>
            </div></v-card-text
          ></v-card
        ></v-col
      ></v-row
    >
    <v-sheet
      v-if="taskGroups.length"
      class="task-board mb-4 pa-4"
      border
      rounded="lg"
      ><div class="d-flex align-center ga-2 mb-3">
        <v-icon icon="mdi-clock-outline" />
        <h2 class="text-subtitle-1">متابعة طلبات الاعتماد</h2>
        <v-spacer /><span class="text-caption text-medium-emphasis"
          >المواعيد أهداف تشغيلية</span
        >
      </div>
      <div class="d-flex flex-wrap ga-2">
        <v-btn
          v-for="group in taskGroups"
          :key="group.title"
          :color="group.overdue ? 'warning' : 'primary'"
          variant="tonal"
          @click="
            tab = group.kind;
            propertyFilter = group.property;
            statusFilter = group.status;
          "
          >{{ group.title }} · {{ group.count }} طلب
          <span v-if="group.overdue"> · {{ group.overdue }} متأخر</span></v-btn
        >
      </div></v-sheet
    >
    <v-card variant="flat" border rounded="lg" class="legal-panel">
      <v-tabs v-model="tab" color="primary" aria-label="أقسام إدارة الصيغ"
        ><v-tab value="rental">عقود الإيجار</v-tab
        ><v-tab value="sale">عقود البيع</v-tab
        ><v-tab value="clauses">البنود القانونية</v-tab
        ><v-tab value="history">سجل الإصدارات</v-tab></v-tabs
      ><v-divider />
      <template v-if="tab === 'rental' || tab === 'sale'">
        <v-card-text class="pb-0"
          ><v-row dense
            ><v-col cols="12" md="5"
              ><v-text-field
                v-model="search"
                prepend-inner-icon="mdi-magnify"
                label="البحث في الصيغ"
                clearable
                hide-details /></v-col
            ><v-col cols="6" md="4"
              ><v-select
                v-model="propertyFilter"
                :items="scopes"
                label="جنس العقار"
                clearable
                hide-details /></v-col
            ><v-col cols="6" md="3"
              ><v-select
                v-model="statusFilter"
                :items="
                  Object.entries(legal.statusLabels).map(([value, title]) => ({
                    value,
                    title,
                  }))
                "
                label="الحالة"
                clearable
                hide-details /></v-col
          ></v-row>
          <p class="text-caption text-medium-emphasis my-3">
            العقود الاعتيادية تستخدم الصيغة النشطة دون مراجعة مستقلة. الصيغ
            الجديدة والتعديلات تمر بالتحقق والاعتماد من المستخدم المخول قبل
            التفعيل.
          </p></v-card-text
        >
        <v-data-table
          :headers="headers"
          :items="visible"
          :search="search"
          :loading="loading"
          :items-per-page="10"
          no-data-text="لا توجد صيغ تطابق البحث"
          loading-text="جار تحميل الصيغ…"
          density="comfortable"
        >
          <template #item.title="{ item }"
            ><div class="py-3">
              <strong>{{ item.title }}</strong>
              <p class="text-caption text-medium-emphasis">
                {{
                  legal.transactionKinds.find(
                    (k) => k.value === item.transaction_kind,
                  )?.title
                }}
                ·
                {{
                  legal.jurisdictions.find((j) => j.value === item.jurisdiction)
                    ?.title
                }}
              </p>
              <p
                v-if="item.approval_status === 'pending'"
                class="text-caption"
                :class="
                  item.target_at &&
                  new Date(item.target_at).getTime() < Date.now()
                    ? 'text-warning'
                    : ''
                "
              >
                {{ deadline(item) }} ·
                {{
                  legal.priorities.find((p) => p.value === item.priority)?.title
                }}
              </p>
            </div></template
          >
          <template #item.contract_type="{ item }">{{
            item.contract_type === "rental" ? "إيجار" : "بيع"
          }}</template
          ><template #item.property_type="{ item }">{{
            scopeLabel(item.property_type)
          }}</template>
          <template #item.category="{ item }"
            ><v-chip
              size="small"
              :color="item.is_system ? 'primary' : 'default'"
              variant="tonal"
              >{{ item.is_system ? "أساسية محمية" : "مخصصة" }}</v-chip
            ><v-chip
              v-if="item.is_default"
              color="warning"
              size="small"
              class="ms-1"
              >افتراضية</v-chip
            ></template
          >
          <template #item.workflow_status="{ item }"
            ><v-chip
              :color="color(item.workflow_status)"
              size="small"
              variant="tonal"
              >{{
                item.publication_status === "active" ? "مفعلة" : "غير مفعلة"
              }}</v-chip
            >
            <p class="text-caption text-medium-emphasis mt-1">
              {{ legal.statusLabels[item.workflow_status] }}
            </p>
            <v-icon
              v-if="item.is_default"
              icon="mdi-star-outline"
              size="16"
              class="ms-1"
              title="الصيغة الافتراضية لنوع العقد"
          /></template>
          <template #item.updated_at="{ item }"
            ><span class="text-caption">{{
              date(item.updated_at)
            }}</span></template
          >
          <template #item.actions="{ item }">
            <div class="row-actions">
              <v-btn
                icon="mdi-eye-outline"
                variant="text"
                size="small"
                aria-label="معاينة الصيغة"
                title="معاينة الصيغة"
                @click="editor(item, 'preview')"
              />
              <v-btn
                v-if="canEdit && !item.is_system"
                icon="mdi-pencil-outline"
                variant="text"
                size="small"
                aria-label="تعديل الصيغة"
                title="تعديل بإصدار جديد"
                @click="editor(item, 'edit')"
              />
              <v-menu>
                <template #activator="{ props }"
                  ><v-btn
                    v-bind="props"
                    icon="mdi-dots-horizontal"
                    variant="text"
                    size="small"
                    aria-label="إجراءات الصيغة"
                /></template>
                <v-list density="compact">
                  <v-list-item
                    v-if="canEdit"
                    title="نسخ الصيغة"
                    prepend-icon="mdi-content-copy"
                    @click="editor(item, 'copy')"
                  />
                  <v-list-item
                    v-if="
                      ['draft', 'pending'].includes(item.approval_status) &&
                      can('legal_content.publish')
                    "
                    title="اعتماد وتفعيل"
                    prepend-icon="mdi-check-circle-outline"
                    @click="decide(item, 'approve_publish')"
                  />
                  <v-list-item
                    v-if="item.approval_status === 'draft' && canEdit"
                    title="إرسال للمراجعة"
                    prepend-icon="mdi-send-outline"
                    @click="decide(item, 'submit')"
                  />
                  <v-list-item
                    v-if="
                      item.approval_status === 'pending' &&
                      can('legal_content.approve')
                    "
                    title="اعتماد المراجعة"
                    prepend-icon="mdi-check-outline"
                    @click="decide(item, 'approve')"
                  />
                  <v-list-item
                    v-if="
                      item.approval_status === 'approved' &&
                      !rows.some(
                        (row) =>
                          row.family_code === item.family_code &&
                          row.is_default,
                      ) &&
                      can('legal_content.publish')
                    "
                    :title="
                      item.publication_status === 'active'
                        ? 'إيقاف الصيغة'
                        : 'تفعيل الصيغة'
                    "
                    prepend-icon="mdi-power"
                    @click="
                      decide(
                        item,
                        item.publication_status === 'active'
                          ? 'archive'
                          : 'publish',
                      )
                    "
                  />
                  <v-list-item
                    v-if="
                      item.approval_status === 'approved' &&
                      !item.is_default &&
                      can('legal_content.publish')
                    "
                    title="تعيين كافتراضية لنوع العقد"
                    prepend-icon="mdi-star-outline"
                    @click="decide(item, 'default')"
                  />
                  <v-list-item
                    title="طباعة تجريبية ومعاينة PDF"
                    prepend-icon="mdi-printer-outline"
                    @click="editor(item, 'preview')"
                  />
                  <v-list-item
                    title="عرض الإصدارات"
                    prepend-icon="mdi-history"
                    @click="showVersions(item)"
                  />
                  <v-list-item
                    title="تصدير الصيغة"
                    prepend-icon="mdi-export"
                    @click="exportSource(item)"
                  />
                  <v-list-item
                    v-if="can('legal_content.manage')"
                    title="الموعد والأولوية"
                    prepend-icon="mdi-calendar-clock-outline"
                    @click="openSchedule(item)"
                  />
                  <v-list-item
                    v-if="
                      item.approval_status === 'pending' &&
                      can('legal_content.approve')
                    "
                    title="رفض الطلب"
                    prepend-icon="mdi-close-circle-outline"
                    @click="decide(item, 'reject')"
                  />
                  <v-list-item
                    v-if="
                      can('legal_content.delete') &&
                      !item.is_system &&
                      !rows.some(
                        (row) =>
                          row.family_code === item.family_code &&
                          row.is_default,
                      )
                    "
                    title="حذف الصيغة"
                    prepend-icon="mdi-delete-outline"
                    base-color="error"
                    @click="confirmDelete(item)"
                  />
                </v-list>
              </v-menu>
            </div>
          </template>
        </v-data-table>
      </template>
      <v-card-text v-else-if="tab === 'clauses'"
        ><h2 class="text-subtitle-1 mb-2">مكتبة البنود المراجعة</h2>
        <p class="text-body-2 text-medium-emphasis mb-4">
          يجمع النظام النصوص المتطابقة في بند مشترك قابل لإعادة الاستخدام. تبقى
          نسخ الإصدارات محفوظة لحماية العقود السابقة.
        </p>
        <v-data-table
          :items="options.clause_library"
          :headers="[
            { title: 'عنوان البند', key: 'clause_title' },
            { title: 'النوع', key: 'is_required' },
            { title: 'النطاق', key: 'scopes' },
            { title: 'مرات الاستخدام', key: 'usage_count' },
          ]"
          no-data-text="تظهر البنود هنا بعد مراجعة أول صيغة واعتمادها"
          ><template #item.is_required="{ item }">{{
            item.is_required ? "أساسي" : "اختياري"
          }}</template
          ><template #item.scopes="{ item }">{{
            item.scopes.map(scopeLabel).join("،")
          }}</template
          ><template #expanded-row="{ columns, item }"
            ><tr>
              <td :colspan="columns.length" class="legal-text pa-4">
                {{ item.clause_content_ar }}
              </td>
            </tr></template
          ><template #item.clause_title="{ item }"
            ><v-menu :close-on-content-click="false"
              ><template #activator="{ props }"
                ><v-btn v-bind="props" variant="text">{{
                  item.clause_title
                }}</v-btn></template
              ><v-card max-width="600"
                ><v-card-text class="legal-text">{{
                  item.clause_content_ar
                }}</v-card-text></v-card
              ></v-menu
            ></template
          ></v-data-table
        ></v-card-text
      >
      <v-card-text v-else>
        <v-autocomplete
          v-model="family"
          :items="families"
          label="سلسلة الصيغة"
          clearable
        />
        <v-row dense
          ><v-col cols="12" md="5"
            ><v-select
              v-model="left"
              :items="versions"
              :item-title="versionLabel"
              item-value="id"
              label="الإصدار السابق" /></v-col
          ><v-col cols="12" md="5"
            ><v-select
              v-model="right"
              :items="versions"
              :item-title="versionLabel"
              item-value="id"
              label="الإصدار المقارن" /></v-col
          ><v-col cols="12" md="2"
            ><v-btn
              :disabled="!left || !right"
              :loading="busy"
              variant="tonal"
              @click="compare"
              >مقارنة الإصدارات</v-btn
            ></v-col
          ></v-row
        >
        <v-alert
          v-if="comparison"
          :type="comparison.legal_changed ? 'warning' : 'info'"
          variant="tonal"
          class="mb-3"
          >{{
            comparison.legal_changed
              ? "توجد تغييرات في الأحكام أو نطاقها."
              : "الأحكام القانونية متطابقة؛ الاختلافات إدارية فقط."
          }}</v-alert
        >
        <v-table
          v-if="comparison?.differences.length"
          class="comparison-table mb-4"
          ><thead>
            <tr>
              <th>التغيير</th>
              <th>الإصدار السابق</th>
              <th>الإصدار المقارن</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="change in comparison.differences" :key="change.field">
              <td>{{ change.field }}</td>
              <td class="legal-text before">{{ change.before }}</td>
              <td class="legal-text after">{{ change.after }}</td>
            </tr>
          </tbody></v-table
        >
        <v-data-table
          :items="versions"
          :headers="[
            { title: 'الصيغة', key: 'title' },
            { title: 'الإصدار', key: 'version' },
            { title: 'الحالة', key: 'workflow_status' },
            { title: 'نوع التغيير', key: 'change_kind' },
            { title: 'التاريخ', key: 'updated_at' },
            { title: 'الإجراءات', key: 'actions', sortable: false },
          ]"
          :items-per-page="10"
          ><template #item.workflow_status="{ item }">{{
            legal.statusLabels[item.workflow_status]
          }}</template
          ><template #item.change_kind="{ item }">{{
            legal.changeLabels[item.change_kind]
          }}</template
          ><template #item.updated_at="{ item }">{{
            date(item.updated_at)
          }}</template
          ><template #item.actions="{ item }"
            ><v-btn variant="text" size="small" @click="editor(item, 'preview')"
              >معاينة</v-btn
            ><v-btn
              v-if="canEdit && item.property_type !== '*'"
              :disabled="busy"
              variant="text"
              size="small"
              @click="restore(item)"
              >استعادة كإصدار جديد</v-btn
            ></template
          ></v-data-table
        >
        <v-expansion-panels class="mt-4" variant="accordion"
          ><v-expansion-panel title="سجل القرارات والتغييرات"
            ><v-expansion-panel-text
              ><v-data-table
                :items="
                  history.filter(
                    (e) =>
                      !family ||
                      versions.some((r) => r.id === e.legal_template_id),
                  )
                "
                :headers="[
                  { title: 'الإصدار', key: 'legal_template_id' },
                  { title: 'الإجراء', key: 'action' },
                  { title: 'الملاحظة', key: 'comment' },
                  { title: 'التاريخ', key: 'created_at' },
                ]"
                :items-per-page="10"
                ><template #item.action="{ item }">{{
                  eventNames[item.action] ?? item.action
                }}</template
                ><template #item.created_at="{ item }">{{
                  date(item.created_at)
                }}</template></v-data-table
              ></v-expansion-panel-text
            ></v-expansion-panel
          ></v-expansion-panels
        >
      </v-card-text>
    </v-card>
    <v-dialog v-model="editing" max-width="1500" persistent scrollable
      ><LegalRevisionEditor
        v-if="editing"
        :revision="selected"
        :imported="imported"
        :mode="mode"
        :options="options"
        :rows="rows"
        :contract-id="returnContractId"
        @close="editing = false"
        @saved="load"
    /></v-dialog>
    <v-dialog v-model="decisionOpen" max-width="600"
      ><v-card
        ><v-card-title>{{ eventNames[action] }}</v-card-title
        ><v-card-text
          ><p class="mb-3">
            {{ selected?.title }} · الإصدار {{ selected?.version }}
          </p>
          <v-alert
            v-if="
              selected?.review_required &&
              ['approve', 'approve_publish', 'submit'].includes(action)
            "
            type="warning"
            variant="tonal"
            >راجع النص والبنود قبل تفعيلها للعقود الجديدة. اتفاق المكتب لا يغني
            عن إجراءات التصديق أو التسجيل الرسمية المطلوبة.</v-alert
          ><v-alert
            v-else-if="action === 'approve_publish'"
            type="info"
            variant="tonal"
            >سيصبح هذا الإصدار فعالاً للعقود الجديدة. تبقى الصيغ المستخدمة في
            العقود السابقة محفوظة.</v-alert
          ><v-textarea
            v-model="comment"
            label="ملاحظة القرار"
            class="mt-4"
            rows="3" /></v-card-text
        ><v-card-actions
          ><v-btn @click="decisionOpen = false">إلغاء</v-btn><v-spacer /><v-btn
            color="primary"
            :loading="busy"
            :disabled="!comment.trim()"
            @click="saveDecision"
            >تسجيل القرار</v-btn
          ></v-card-actions
        ></v-card
      ></v-dialog
    >
    <v-dialog v-model="importOpen" max-width="650"
      ><v-card
        ><v-card-title>استيراد صيغة</v-card-title
        ><v-card-text
          ><p class="mb-4">
            استورد ملف صيغة دلالي أو الصق JSON. تحفظ الصيغة كمسودة ويحدد التحقق
            مسار اعتمادها.
          </p>
          <v-file-input
            v-model="importFile"
            accept=".json,application/json"
            label="ملف الصيغة"
            @update:model-value="readImport"
          /><v-textarea
            v-model="importText"
            label="محتوى الصيغة JSON"
            rows="7"
            dir="ltr"
          /><v-alert v-if="importError" type="error" variant="tonal">{{
            importError
          }}</v-alert></v-card-text
        ><v-card-actions
          ><v-btn @click="importOpen = false">إلغاء</v-btn><v-spacer /><v-btn
            color="primary"
            :disabled="!importText.trim()"
            @click="openImport"
            >فتح في المحرر</v-btn
          ></v-card-actions
        ></v-card
      ></v-dialog
    >
    <v-dialog v-model="scheduleOpen" max-width="520"
      ><v-card
        ><v-card-title>الموعد والأولوية</v-card-title
        ><v-card-text
          ><p class="mb-4">{{ selected?.title }}</p>
          <v-text-field
            v-model="scheduleTarget"
            type="datetime-local"
            label="الموعد المستهدف — توقيت بغداد"
          /><v-select
            v-model="schedulePriority"
            :items="legal.priorities"
            label="الأولوية"
          />
          <p class="text-caption">
            رفع الأولوية لا يغيّر شروط الاعتماد.
          </p></v-card-text
        ><v-card-actions
          ><v-btn @click="scheduleOpen = false">إلغاء</v-btn><v-spacer /><v-btn
            :loading="busy"
            color="primary"
            @click="saveSchedule"
            >حفظ الموعد</v-btn
          ></v-card-actions
        ></v-card
      ></v-dialog
    >
    <v-dialog v-model="deleteOpen" max-width="560">
      <v-card rounded="lg">
        <v-card-title>حذف الصيغة</v-card-title>
        <v-card-text>
          <p class="mb-3">{{ selected?.title }}</p>
          <v-alert type="warning" variant="tonal"
            >ستؤرشف هذه الصيغة المخصصة وجميع إصداراتها ولن تظهر للعقود الجديدة.
            تبقى النسخ القانونية المستخدمة في العقود السابقة محفوظة دون
            تغيير.</v-alert
          >
          <v-alert
            v-if="deleteError"
            type="error"
            variant="tonal"
            class="mt-3"
            >{{ deleteError }}</v-alert
          >
        </v-card-text>
        <v-card-actions
          ><v-btn :disabled="busy" @click="deleteOpen = false">رجوع</v-btn
          ><v-spacer /><v-btn
            color="error"
            :loading="busy"
            @click="removeTemplate"
            >تأكيد الأرشفة</v-btn
          ></v-card-actions
        >
      </v-card>
    </v-dialog>
  </AppLayout>
</template>
<style scoped>
.legal-panel {
  overflow: hidden;
}
.stat-card {
  height: 100%;
}
.task-board {
  background: var(--dal-surface);
}
.row-actions {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-wrap: wrap;
  min-width: 180px;
}
.legal-text {
  white-space: pre-wrap;
  line-height: 1.9;
  overflow-wrap: anywhere;
}
.comparison-table :deep(td) {
  width: 40%;
  vertical-align: top;
  padding: 16px;
}
.comparison-table :deep(td:first-child) {
  width: 20%;
}
.before {
  background: rgba(var(--v-theme-error), 0.04);
}
.after {
  background: rgba(var(--v-theme-success), 0.04);
}
</style>
