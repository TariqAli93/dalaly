<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, useTemplateRef } from "vue";
import { useRouter } from "vue-router";
import AppPage from "../components/app/AppPage.vue";
import PersonEditor from "../components/people/PersonEditor.vue";
import FilterBar from "../components/shared/FilterBar.vue";
import DataGrid from "../components/shared/DataGrid.vue";
import StatusChip from "../components/shared/StatusChip.vue";
import type {
  DataGridApi,
  FilterChip,
  GridHeader,
  RowAction,
} from "../components/shared/grid";
import * as peopleService from "../services/people.service";
import { getErrorMessage } from "../services/api.service";
import { usePermissions } from "../composables/usePermissions";
import { useSnackbar } from "../composables/useSnackbar";
import { useConfirm } from "../composables/useConfirm";
import { useRefresh } from "../composables/useRefresh";
import { usePeople } from "../composables/usePeople";
import {
  PERSON_STATUS_FILTERS,
  personStatusLabel,
  personTypeLabel,
  personStatusColor,
} from "../constants/crm";
import type { PersonRecord } from "../types";

/**
 * دليل الزبائن (ومنهم المالكون) بنمط القوائم الأخرى: بحث حيّ بالاسم أو الهاتف
 * أو الرمز، وتصفية بالحالة (المؤرشفون لا يظهرون إلا بطلبهم)، وEnter يفتح ملف
 * الزبون. الأرشفة تُؤكَّد ويمكن التراجع عنها من الإشعار.
 */
const router = useRouter();
const { can } = usePermissions();
const { notifyError, notifySuccess } = useSnackbar();
const { openConfirm } = useConfirm();
const { setRefreshHandler } = useRefresh();
const { search, status, list, apply, clear } = usePeople();
const { items, total, loading, error, page, pageSize, sortBy, onTableOptions } =
  list;

const grid = useTemplateRef<DataGridApi>("grid");
const dialog = ref(false);
const editing = ref<PersonRecord | null>(null);

const chips = computed<FilterChip[]>(() => {
  const result: FilterChip[] = [];
  if (search.value) result.push({ key: "q", label: `بحث: ${search.value}` });
  if (status.value !== "current")
    result.push({
      key: "status",
      label:
        PERSON_STATUS_FILTERS.find((item) => item.value === status.value)
          ?.title ?? status.value,
    });
  return result;
});
function removeChip(key: string) {
  if (key === "q") search.value = "";
  else status.value = "current";
}

// مفاتيح الأعمدة القابلة للترتيب هي مفاتيح الترتيب في الخادم.
const headers: GridHeader[] = [
  { key: "full_name", title: "الزبون", sortable: true },
  { key: "phone_primary", title: "الهاتف", sortable: true },
  { key: "person_type", title: "النوع", sortable: true, priority: 3 },
  { key: "residence", title: "السكن", priority: 2 },
  { key: "status", title: "الحالة", sortable: true },
  { key: "actions", title: "", align: "end", width: 96 },
];
const residenceOf = (person: PersonRecord) =>
  [person.governorate, person.district, person.neighborhood]
    .filter(Boolean)
    .join(" · ") ||
  person.address ||
  "";
const showCode = (person: PersonRecord) =>
  !person.full_name.includes(person.code);

function openCreate() {
  editing.value = null;
  dialog.value = true;
}
function openEdit(person: PersonRecord) {
  editing.value = person;
  dialog.value = true;
}
function openPerson(person: PersonRecord) {
  grid.value?.remember(person.id);
  void router.push(`/clients/${person.id}`);
}
function newRequest(person: PersonRecord, kind: "purchase" | "rental") {
  void router.push({
    path: kind === "purchase" ? "/purchase-requests" : "/rental-requests",
    query: { new: "1", person: String(person.id) },
  });
}

async function restore(person: PersonRecord) {
  try {
    await peopleService.restorePerson(person.id);
    await list.reload();
    notifySuccess(`أُعيد ${person.full_name} إلى الزبائن الحاليين.`);
  } catch (cause) {
    notifyError(getErrorMessage(cause));
  }
}
// الأرشفة تُخفي الزبون من القائمة الافتراضية: تُؤكَّد، ويُقال أين يجده المستخدم،
// ويمكن التراجع عنها من الإشعار نفسه.
function archive(person: PersonRecord) {
  openConfirm({
    title: `أرشفة ${person.full_name}`,
    body: "سيبقى الزبون وسجلّه محفوظين، لكنه لن يظهر في القائمة الافتراضية. تجده تحت «المؤرشفون» في تصفية الحالة.",
    confirmText: "أرشفة",
    color: "warning",
    onConfirm: async () => {
      await peopleService.archivePerson(person.id);
      await list.reload();
      notifySuccess(`أُرشف ${person.full_name}.`, {
        label: "تراجع",
        run: () => restore(person),
      });
    },
  });
}

function actionsOf(person: PersonRecord): RowAction[] {
  const actions: RowAction[] = [
    {
      key: "open",
      label: "فتح ملف الزبون",
      icon: "mdi-open-in-app",
      run: () => openPerson(person),
    },
  ];
  if (can("people.update"))
    actions.push({
      key: "edit",
      label: "تعديل",
      icon: "mdi-pencil-outline",
      inline: true,
      run: () => openEdit(person),
    });
  if (can("requests.create") && person.status !== "archived")
    actions.push(
      {
        key: "purchase",
        label: "طلب شراء جديد",
        icon: "mdi-home-search-outline",
        run: () => newRequest(person, "purchase"),
      },
      {
        key: "rental",
        label: "طلب إيجار جديد",
        icon: "mdi-text-box-search-outline",
        run: () => newRequest(person, "rental"),
      },
    );
  if (can("people.update"))
    actions.push(
      person.status === "archived"
        ? {
            key: "restore",
            label: "إرجاع من الأرشيف",
            icon: "mdi-archive-arrow-up-outline",
            run: () => void restore(person),
          }
        : {
            key: "archive",
            label: "أرشفة",
            icon: "mdi-archive-arrow-down-outline",
            run: () => archive(person),
          },
    );
  return actions;
}

function onShortcut(event: KeyboardEvent) {
  if (!(event.ctrlKey || event.metaKey) || event.code !== "KeyN") return;
  if (event.altKey || event.shiftKey || !can("people.create")) return;
  if (document.querySelector(".v-overlay--active .v-dialog")) return;
  event.preventDefault();
  openCreate();
}

// قبل أن يُظهر الجدول خياراته الأولى، فلا يطلب الصفحة نفسها مرتين.
void list.reload();
onMounted(() => {
  setRefreshHandler(list.reload);
  window.addEventListener("keydown", onShortcut);
});
onBeforeUnmount(() => {
  window.removeEventListener("keydown", onShortcut);
  list.cancel();
});
</script>

<template>
  <AppPage title="الزبائن" :count="loading && !total ? null : total">
    <template #header-actions>
      <v-btn
        v-if="can('people.create')"
        color="primary"
        prepend-icon="mdi-account-plus-outline"
        title="إضافة زبون (Ctrl+N)"
        aria-keyshortcuts="Control+N"
        @click="openCreate"
        >إضافة زبون</v-btn
      >
    </template>

    <section class="dal-panel dal-listpanel dal-fill" aria-label="الزبائن">
      <FilterBar
        v-model:search="search"
        :filters="status"
        search-label="بحث في الزبائن"
        placeholder="بحث بالاسم أو الهاتف أو الرمز"
        :chips="chips"
        @apply="apply"
        @down="grid?.focusFirstRow()"
        @remove="removeChip"
        @clear="clear"
      >
        <template #filters>
          <v-select
            v-model="status"
            :items="PERSON_STATUS_FILTERS"
            label="الحالة"
            hide-details
            class="dal-toolbar__filter"
          />
        </template>
      </FilterBar>

      <DataGrid
        ref="grid"
        v-model:page="page"
        v-model:items-per-page="pageSize"
        v-model:sort-by="sortBy"
        grid-key="people"
        table-label="جدول الزبائن"
        :items="items"
        :headers="headers"
        :total="total"
        :loading="loading"
        :error="error"
        :has-filters="chips.length > 0"
        :actions="actionsOf"
        :row-label="(person) => person.full_name"
        :empty="{
          icon: 'mdi-account-plus-outline',
          title: 'لا يوجد زبائن بعد',
          text: 'أضف الزبائن والمالكين لتربطهم بالطلبات والعروض.',
        }"
        :no-match="{ title: 'لا يوجد زبون مطابق للبحث والتصفية الحالية' }"
        @open="openPerson"
        @retry="list.reload"
        @clear-filters="clear"
        @options="onTableOptions"
      >
        <template #item.full_name="{ item }">
          <div class="dal-cell-name">
            <router-link
              :to="`/clients/${item.id}`"
              class="record-link"
              tabindex="-1"
              :title="item.full_name"
              @click="grid?.remember(item.id)"
              >{{ item.full_name }}</router-link
            >
            <bdi v-if="showCode(item)">{{ item.code }}</bdi>
          </div>
        </template>
        <template #item.phone_primary="{ item }">
          <bdi>{{ item.phone_primary || "—" }}</bdi>
        </template>
        <template #item.person_type="{ item }">{{
          personTypeLabel(item.person_type)
        }}</template>
        <template #item.residence="{ item }">
          <span class="dal-clip" :title="residenceOf(item)">{{
            residenceOf(item) || "—"
          }}</span>
        </template>
        <template #item.status="{ item }">
          <StatusChip
            :status="item.status"
            :label="personStatusLabel(item.status)"
            :color="personStatusColor(item.status)"
          />
        </template>
        <template #empty-actions>
          <v-btn
            v-if="can('people.create')"
            color="primary"
            prepend-icon="mdi-account-plus-outline"
            @click="openCreate"
            >إضافة زبون</v-btn
          >
        </template>
      </DataGrid>
    </section>
    <PersonEditor v-model="dialog" :person="editing" @saved="list.reload" />
  </AppPage>
</template>
