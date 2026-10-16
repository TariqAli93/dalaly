<script setup lang="ts">
import { computed, onMounted, onBeforeUnmount, ref } from "vue";
import { onBeforeRouteLeave, useRoute } from "vue-router";
import AppLayout from "../layouts/AppLayout.vue";
import { usePermissions } from "../composables/usePermissions";
import { useSnackbar } from "../composables/useSnackbar";
import { getErrorMessage } from "../services/api.service";
import * as service from "../services/formulations.service";
const { can } = usePermissions();
const { notifyError, notifySuccess } = useSnackbar();
const route = useRoute();
const rows = ref<service.Formulation[]>([]),
  variableList = ref<string[]>([]);
const loading = ref(false),
  busy = ref(false),
  search = ref(""),
  tab = ref("all");
const selected = ref<service.Formulation | null>(null),
  editorOpen = ref(false);
const draft = ref<service.FormulationInput>({
  title: "",
  content: "",
  contract_type: "sale",
});
const saved = ref(""),
  saveState = ref(""),
  deleteTarget = ref<service.Formulation | null>(null);
const importInput = ref<HTMLInputElement | null>(null),
  variable = ref<string | null>(null);
const typeItems = [
  { title: "بيع", value: "sale" },
  { title: "إيجار", value: "rental" },
  { title: "عامة", value: "general" },
];
const canEdit = computed(
  () => can("legal_content.manage") || can("legal_content.propose"),
);
const canDefault = computed(
  () => can("legal_content.manage") || can("legal_content.publish"),
);
const dirty = computed(
  () => editorOpen.value && JSON.stringify(draft.value) !== saved.value,
);
const visible = computed(() =>
  rows.value.filter(
    (row) =>
      (tab.value === "all" || row.contract_type === tab.value) &&
      `${row.title} ${row.content} ${typeName(row.contract_type)}`
        .toLocaleLowerCase()
        .includes((search.value ?? "").trim().toLocaleLowerCase()),
  ),
);
const typeName = (kind: string) =>
  typeItems.find((item) => item.value === kind)?.title ?? kind;
const date = (value: string) =>
  new Date(value).toLocaleDateString("ar-IQ", { timeZone: "Asia/Baghdad" });
function discard() {
  return !dirty.value || window.confirm("تجاهل التغييرات غير المحفوظة؟");
}
function select(row: service.Formulation) {
  if (busy.value || !discard()) return;
  selected.value = row;
  draft.value = {
    title: row.title,
    content: row.content,
    contract_type: row.contract_type,
    version: row.version,
  };
  saved.value = JSON.stringify(draft.value);
  editorOpen.value = true;
  saveState.value = "محفوظة";
}
function add() {
  if (busy.value || !discard()) return;
  selected.value = null;
  draft.value = {
    title: "",
    content: "",
    contract_type:
      tab.value === "rental"
        ? "rental"
        : tab.value === "general"
          ? "general"
          : "sale",
  };
  saved.value = JSON.stringify(draft.value);
  editorOpen.value = true;
  saveState.value = "صيغة جديدة";
}
async function load() {
  loading.value = true;
  try {
    [rows.value, variableList.value] = await Promise.all([
      service.list(),
      service.variables(),
    ]);
  } catch (error) {
    notifyError(getErrorMessage(error));
  } finally {
    loading.value = false;
  }
}
async function save() {
  if (
    busy.value ||
    !canEdit.value ||
    !draft.value.title.trim() ||
    !draft.value.content.trim()
  )
    return;
  busy.value = true;
  saveState.value = "جارٍ الحفظ…";
  try {
    const row = await service.save(draft.value, selected.value?.id);
    const index = rows.value.findIndex((item) => item.id === row.id);
    if (index < 0) rows.value.push(row);
    else rows.value[index] = row;
    selected.value = row;
    draft.value.version = row.version;
    saved.value = JSON.stringify(draft.value);
    saveState.value = "تم الحفظ";
    notifySuccess("تم حفظ الصيغة.");
  } catch (error) {
    saveState.value = "تعذر الحفظ — التغييرات محفوظة في المحرر";
    notifyError(getErrorMessage(error));
  } finally {
    busy.value = false;
  }
}
async function action(
  kind: "copy" | "default" | "delete",
  row: service.Formulation,
) {
  if (busy.value) return;
  if ((kind === "copy" || kind === "delete") && !discard()) return;
  busy.value = true;
  try {
    if (kind === "copy") {
      const copy = await service.copy(row.id);
      rows.value.push(copy);
      saved.value = JSON.stringify(draft.value);
      busy.value = false;
      select(copy);
    } else if (kind === "default") {
      await service.makeDefault(row.id);
      rows.value.forEach((item) => {
        if (item.contract_type === row.contract_type)
          item.is_default = item.id === row.id;
      });
      notifySuccess("تم تعيين الصيغة الافتراضية.");
    } else {
      await service.remove(row.id);
      rows.value = rows.value.filter((item) => item.id !== row.id);
      if (selected.value?.id === row.id) {
        editorOpen.value = false;
        selected.value = null;
      }
      deleteTarget.value = null;
      notifySuccess("تم حذف الصيغة.");
    }
  } catch (error) {
    notifyError(getErrorMessage(error));
  } finally {
    busy.value = false;
  }
}
async function importFile(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0];
  (event.target as HTMLInputElement).value = "";
  if (!file || !discard()) return;
  if (file.size > 12 * 1024 * 1024) {
    notifyError("الملف يتجاوز ١٢ ميغابايت.");
    return;
  }
  busy.value = true;
  try {
    const imported = await service.importFile(
      file.name,
      await service.fileData(file),
    );
    selected.value = null;
    draft.value = {
      ...imported,
      contract_type:
        tab.value === "rental"
          ? "rental"
          : tab.value === "general"
            ? "general"
            : "sale",
    };
    saved.value = "";
    editorOpen.value = true;
    saveState.value = "تم الاستيراد — احفظ الصيغة";
  } catch (error) {
    notifyError(getErrorMessage(error));
  } finally {
    busy.value = false;
  }
}
function insertVariable() {
  if (variable.value) draft.value.content += `{{${variable.value}}}`;
  variable.value = null;
}
function shortcut(event: KeyboardEvent) {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
    event.preventDefault();
    if (editorOpen.value) void save();
  }
}
function beforeUnload(event: BeforeUnloadEvent) {
  if (dirty.value) {
    event.preventDefault();
    event.returnValue = "";
  }
}
onBeforeRouteLeave(discard);
onMounted(() => {
  void load();
  window.addEventListener("keydown", shortcut);
  window.addEventListener("beforeunload", beforeUnload);
});
onBeforeUnmount(() => {
  window.removeEventListener("keydown", shortcut);
  window.removeEventListener("beforeunload", beforeUnload);
});
</script>
<template>
  <AppLayout
    title="الصيغ القانونية"
    subtitle="نصوص البيع والإيجار والصيغ المشتركة، مع تحرير ومعاينة مباشرة."
  >
    <template #header-actions>
      <v-btn
        v-if="canEdit"
        color="primary"
        prepend-icon="mdi-plus"
        :disabled="busy"
        @click="add"
        >إضافة صيغة</v-btn
      >
      <v-btn
        v-if="canEdit"
        variant="outlined"
        prepend-icon="mdi-import"
        :disabled="busy"
        @click="importInput?.click()"
        >استيراد</v-btn
      >
      <v-btn
        v-if="route.query.contract_id"
        variant="text"
        :to="`/contracts/${Number(route.query.contract_id)}/edit`"
        >العودة إلى العقد</v-btn
      >
    </template>
    <input
      ref="importInput"
      type="file"
      accept=".docx,.txt"
      hidden
      @change="importFile"
    />
    <v-sheet border rounded class="formulation-workspace">
      <v-toolbar color="transparent" density="compact" class="px-3">
        <v-text-field
          v-model="search"
          aria-label="البحث في الصيغ"
          placeholder="ابحث بالاسم أو المحتوى أو نوع العقد"
          prepend-inner-icon="mdi-magnify"
          variant="outlined"
          density="compact"
          hide-details
          clearable
        />
      </v-toolbar>
      <v-tabs v-model="tab" density="compact" color="primary">
        <v-tab value="all">الكل</v-tab><v-tab value="sale">البيع</v-tab
        ><v-tab value="rental">الإيجار</v-tab
        ><v-tab value="general">العامة</v-tab>
      </v-tabs>
      <v-divider />
      <v-progress-linear v-if="loading" indeterminate />
      <div class="formulation-columns" :class="{ 'has-editor': editorOpen }">
        <v-sheet class="formulation-list">
          <v-list density="compact" lines="two" aria-label="الصيغ القانونية">
            <v-list-item
              v-for="row in visible"
              :key="row.id"
              :active="selected?.id === row.id"
              :title="row.title"
              :subtitle="`${typeName(row.contract_type)} · ${date(row.updated_at)}`"
              @click="select(row)"
            >
              <template #prepend
                ><v-icon icon="mdi-text-box-outline" size="22"
              /></template>
              <template #append>
                <v-tooltip
                  :text="
                    row.is_default ? 'الصيغة الافتراضية' : 'تعيين افتراضية'
                  "
                >
                  <template #activator="{ props }"
                    ><v-btn
                      v-bind="props"
                      :icon="row.is_default ? 'mdi-star' : 'mdi-star-outline'"
                      :color="row.is_default ? 'primary' : undefined"
                      variant="text"
                      size="small"
                      :aria-label="
                        row.is_default ? 'الصيغة الافتراضية' : 'تعيين افتراضية'
                      "
                      :disabled="busy || !canDefault || row.is_default"
                      @click.stop="action('default', row)"
                  /></template>
                </v-tooltip>
                <v-menu v-if="canEdit || can('legal_content.delete')">
                  <template #activator="{ props }"
                    ><v-btn
                      v-bind="props"
                      icon="mdi-dots-horizontal"
                      variant="text"
                      size="small"
                      aria-label="إجراءات الصيغة"
                      @click.stop
                  /></template>
                  <v-list density="compact"
                    ><v-list-item
                      title="تعديل"
                      prepend-icon="mdi-pencil-outline"
                      @click="select(row)" /><v-list-item
                      v-if="canEdit"
                      title="نسخ"
                      prepend-icon="mdi-content-copy"
                      @click="action('copy', row)" /><v-list-item
                      v-if="can('legal_content.delete')"
                      title="حذف"
                      prepend-icon="mdi-delete-outline"
                      @click="deleteTarget = row"
                  /></v-list>
                </v-menu>
              </template>
            </v-list-item>
          </v-list>
          <div
            v-if="!visible.length && !loading"
            class="pa-6 text-center text-medium-emphasis"
          >
            لا توجد صيغ مطابقة. أضف صيغة أو استورد ملفاً.
          </div>
        </v-sheet>
        <v-sheet v-if="editorOpen" class="formulation-editor pa-4">
          <div class="d-flex align-center ga-2 mb-3">
            <h2 class="text-subtitle-1">
              {{ selected ? "تحرير الصيغة" : "صيغة جديدة" }}
            </h2>
            <v-spacer /><span role="status" class="text-caption">{{
              dirty ? "تغييرات غير محفوظة" : saveState
            }}</span>
          </div>
          <v-text-field
            v-model="draft.title"
            label="عنوان الصيغة"
            :readonly="!canEdit"
            :disabled="busy"
            variant="outlined"
            density="compact"
            maxlength="200"
          />
          <v-select
            v-model="draft.contract_type"
            :items="typeItems"
            label="نوع العقد"
            :readonly="!canEdit"
            :disabled="busy"
            variant="outlined"
            density="compact"
          />
          <v-autocomplete
            v-if="canEdit"
            v-model="variable"
            :items="variableList"
            label="إدراج متغير من بيانات العقد"
            variant="outlined"
            density="compact"
            :disabled="busy"
            @update:model-value="insertVariable"
          />
          <v-textarea
            v-model="draft.content"
            label="محتوى الصيغة"
            :readonly="!canEdit"
            :disabled="busy"
            variant="outlined"
            rows="13"
            auto-grow
            maxlength="100000"
          />
          <div class="d-flex align-center ga-2">
            <v-btn
              v-if="canEdit"
              color="primary"
              prepend-icon="mdi-content-save-outline"
              :loading="busy"
              :disabled="
                !draft.title.trim() ||
                !draft.content.trim() ||
                (!dirty && Boolean(selected))
              "
              @click="save"
              >حفظ</v-btn
            ><span v-if="canEdit" class="text-caption text-medium-emphasis"
              >Ctrl + S</span
            ><v-spacer /><v-btn
              variant="text"
              @click="discard() && (editorOpen = false)"
              >إغلاق</v-btn
            >
          </div>
          <v-divider class="my-4" />
          <h3 class="text-subtitle-2 mb-2">معاينة النص</h3>
          <v-sheet class="wording-preview">{{
            draft.content || "سيظهر النص هنا أثناء الكتابة."
          }}</v-sheet>
          <div class="text-caption text-medium-emphasis mt-2">
            تُملأ المتغيرات من بيانات العقد عند إنشائه.
          </div>
        </v-sheet>
      </div>
    </v-sheet>
    <v-dialog
      :model-value="Boolean(deleteTarget)"
      max-width="400"
      @update:model-value="!$event && (deleteTarget = null)"
      ><v-card title="حذف الصيغة؟"
        ><v-card-text
          >حذف «{{ deleteTarget?.title }}» من القائمة؟ تبقى نسخ العقود السابقة
          محفوظة.</v-card-text
        ><v-card-actions
          ><v-spacer /><v-btn :disabled="busy" @click="deleteTarget = null"
            >إلغاء</v-btn
          ><v-btn
            color="error"
            :loading="busy"
            @click="deleteTarget && action('delete', deleteTarget)"
            >حذف</v-btn
          ></v-card-actions
        ></v-card
      ></v-dialog
    >
  </AppLayout>
</template>
<style scoped>
.formulation-columns {
  min-height: 480px;
}
.formulation-columns.has-editor {
  display: grid;
  grid-template-columns: minmax(280px, 0.8fr) minmax(360px, 1.4fr);
}
.formulation-list {
  max-height: 78vh;
  overflow: auto;
}
.formulation-editor {
  border-inline-start: 1px solid
    rgba(var(--v-border-color), var(--v-border-opacity));
}
.wording-preview {
  white-space: pre-wrap;
  line-height: 1.9;
  font-size: 14px;
}
@media (max-width: 950px) {
  .formulation-columns.has-editor {
    grid-template-columns: 1fr;
  }
  .formulation-list {
    max-height: 35vh;
  }
  .formulation-editor {
    border-inline-start: 0;
    border-top: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
  }
}
</style>
