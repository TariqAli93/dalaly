<script setup lang="ts">
import { onBeforeUnmount, ref } from "vue";
import AppPage from "../components/app/AppPage.vue";
import PersonEditor from "../components/people/PersonEditor.vue";
import * as peopleService from "../services/people.service";
import { getErrorMessage } from "../services/api.service";
import { usePermissions } from "../composables/usePermissions";
import { useSnackbar } from "../composables/useSnackbar";
import { useConfirm } from "../composables/useConfirm";
import { createPagedList } from "../composables/usePagedList";
import {
  PEOPLE_DEFAULT_SORT,
  PERSON_STATUS_FILTERS,
  type PersonStatusFilter,
} from "../constants/crm";
import { LIST_PAGE_SIZES } from "../constants/domain";
import type { PersonRecord, PersonSortKey } from "../types";

const { can } = usePermissions();
const { notifyError, notifySuccess } = useSnackbar();
const { openConfirm } = useConfirm();
const search = ref<string | null>("");
const status = ref<PersonStatusFilter>("current");
const dialog = ref(false);

const editing = ref<PersonRecord | null>(null);
// مفاتيح الأعمدة القابلة للترتيب هي مفاتيح الترتيب في الخادم.
const headers = [
  { title: "الاسم", key: "full_name" },
  { title: "الرمز", key: "code" },
  { title: "الهاتف", key: "phone_primary" },
  { title: "النوع", key: "person_type" },
  { title: "الحالة", key: "status" },
  { title: "", key: "actions", sortable: false },
];
// صفحة واحدة من الخادم؛ البحث والترتيب هناك.
const list = createPagedList<PersonRecord, PersonSortKey>(
  (page, signal) =>
    peopleService.listPeoplePage(
      {
        q: search.value ?? "",
        status: status.value === "current" ? undefined : status.value,
      },
      page,
      signal,
    ),
  PEOPLE_DEFAULT_SORT,
);
const { items, total, loading, page, pageSize, sortBy, onTableOptions } = list;
/** بحث جديد: من الصفحة الأولى. */
function load() {
  return list.loadFirstPage();
}
function openCreate() {
  editing.value = null;
  dialog.value = true;
}
function openEdit(person: PersonRecord) {
  editing.value = person;
  dialog.value = true;
}
// الأرشفة تُخفي الزبون من القائمة الافتراضية، فتُؤكَّد ويُقال أين يجده المستخدم.
function archive(person: PersonRecord) {
  openConfirm({
    title: `أرشفة ${person.full_name}`,
    body: "سيبقى الزبون وسجلّه محفوظين، لكنه لن يظهر في القائمة الافتراضية. تجده تحت «المؤرشفون» في تصفية الحالة.",
    confirmText: "أرشفة",
    color: "warning",
    onConfirm: async () => {
      await peopleService.archivePerson(person.id);
      await list.reload();
      notifySuccess(`أُرشف ${person.full_name}. تجده تحت «المؤرشفون».`);
    },
  });
}
async function restore(person: PersonRecord) {
  try {
    await peopleService.restorePerson(person.id);
    await list.reload();
  } catch (cause) {
    notifyError(getErrorMessage(cause));
  }
}
// قبل أن يُظهر الجدول خياراته الأولى، فلا يطلب الصفحة نفسها مرتين.
void list.reload();
onBeforeUnmount(() => list.cancel());
</script>
<template>
  <AppPage
    title="الزبائن"
    subtitle="دليل الزبائن وجهات الاتصال في المكتب، ومنهم المالكون."
  >
    <template #header-actions
      ><v-btn
        v-if="can('people.create')"
        color="primary"
        prepend-icon="mdi-account-plus-outline"
        @click="openCreate"
        >إضافة شخص</v-btn
      ></template
    >
    <div class="d-flex ga-2 mb-3">
      <v-text-field
        v-model="search"
        label="بحث بالاسم أو الهاتف أو الرمز"
        hide-details
        clearable
        @keyup.enter="load"
      /><v-select
        v-model="status"
        :items="PERSON_STATUS_FILTERS"
        label="الحالة"
        hide-details
        class="people-status"
        @update:model-value="load"
      /><v-btn variant="tonal" @click="load">بحث</v-btn>
    </div>
    <v-card variant="flat" border
      ><v-data-table-server
        v-model:page="page"
        v-model:items-per-page="pageSize"
        v-model:sort-by="sortBy"
        :headers="headers"
        :items="items"
        :items-length="total"
        :items-per-page-options="LIST_PAGE_SIZES"
        :loading="loading"
        item-value="id"
        density="compact"
        @update:options="onTableOptions"
        ><template #item.full_name="{ item }">
          <router-link
            class="person-cell record-link"
            :to="`/clients/${item.id}`"
          >
            <v-avatar color="primary" variant="tonal" size="36">{{
              item.full_name.slice(0, 2)
            }}</v-avatar>
            <span
              ><strong>{{ item.full_name }}</strong
              ><small>{{
                item.email || item.address || "عرض الملف الشخصي"
              }}</small></span
            >
          </router-link> </template
        ><template #item.phone_primary="{ item }"
          ><bdi>{{ item.phone_primary || "—" }}</bdi></template
        ><template #item.code="{ item }"
          ><bdi class="text-medium-emphasis">{{ item.code }}</bdi></template
        ><template #item.person_type="{ item }">{{
          item.person_type === "company"
            ? "شركة"
            : item.person_type === "individual"
              ? "فرد"
              : "أخرى"
        }}</template
        ><template #item.status="{ item }"
          ><v-chip
            size="small"
            variant="tonal"
            :color="item.status === 'active' ? 'success' : undefined"
            >{{
              item.status === "archived"
                ? "مؤرشف"
                : item.status === "active"
                  ? "نشط"
                  : "غير نشط"
            }}</v-chip
          ></template
        ><template #item.actions="{ item }"
          ><v-btn
            v-if="can('people.update')"
            icon="mdi-pencil"
            aria-label="تعديل بيانات الشخص"
            variant="text"
            @click="openEdit(item)" /><v-btn
            v-if="item.status !== 'archived' && can('people.update')"
            icon="mdi-archive-arrow-down-outline"
            aria-label="أرشفة الشخص"
            variant="text"
            color="warning"
            @click="archive(item)" /><v-btn
            v-if="item.status === 'archived' && can('people.update')"
            icon="mdi-archive-arrow-up-outline"
            aria-label="استعادة الشخص"
            variant="text"
            color="success"
            @click="restore(item)" /></template></v-data-table-server
    ></v-card>
    <PersonEditor v-model="dialog" :person="editing" @saved="list.reload" />
  </AppPage>
</template>
<style scoped>
.people-status {
  flex: 0 0 180px;
}
.person-cell {
  display: flex;
  gap: 12px;
  align-items: center;
  padding-block: 8px;
  text-align: start;
}
.person-cell strong {
  display: block;
  font-size: calc(13px * var(--dal-font-scale));
  font-weight: 600;
}
.person-cell small {
  display: block;
  font-size: calc(11px * var(--dal-font-scale));
  color: var(--dal-muted);
  max-width: 240px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.profile-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}
.profile-notes {
  padding: 16px;
  border: 1px solid var(--dal-stroke);
  border-radius: 8px;
  margin-top: 16px;
}
.form-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}
.grid-span {
  grid-column: 1 / -1;
}
</style>
