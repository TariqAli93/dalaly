<script setup lang="ts">
import { onMounted, ref } from "vue";
import AppLayout from "../layouts/AppLayout.vue";
import PersonEditor from "../components/people/PersonEditor.vue";
import * as peopleService from "../services/people.service";
import { getErrorMessage } from "../services/api.service";
import { usePermissions } from "../composables/usePermissions";
import { useSnackbar } from "../composables/useSnackbar";
import type { PersonRecord } from "../types";

const { can } = usePermissions();
const { notifyError } = useSnackbar();
const rows = ref<PersonRecord[]>([]);
const search = ref("");
const dialog = ref(false);

const editing = ref<PersonRecord | null>(null);
const headers = [
  { title: "الاسم", key: "full_name" },
  { title: "الرمز", key: "code" },
  { title: "الهاتف", key: "phone_primary" },
  { title: "النوع", key: "person_type" },
  { title: "الحالة", key: "status" },
  { title: "", key: "actions", sortable: false },
];
async function load() {
  try {
    rows.value = await peopleService.listPeople({ q: search.value });
  } catch (cause) {
    notifyError(getErrorMessage(cause));
  }
}
function openCreate() {
  editing.value = null;
  dialog.value = true;
}
function openEdit(person: PersonRecord) {
  editing.value = person;
  dialog.value = true;
}
async function archive(person: PersonRecord) {
  try {
    await peopleService.archivePerson(person.id);
    await load();
  } catch (cause) {
    notifyError(getErrorMessage(cause));
  }
}
async function restore(person: PersonRecord) {
  try {
    await peopleService.restorePerson(person.id);
    await load();
  } catch (cause) {
    notifyError(getErrorMessage(cause));
  }
}
onMounted(load);
</script>
<template>
  <AppLayout
    title="العملاء والأشخاص"
    subtitle="دليل العملاء وجهات الاتصال في المكتب."
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
      /><v-btn variant="tonal" @click="load">بحث</v-btn>
    </div>
    <v-card variant="flat" border
      ><v-data-table
        :headers="headers"
        :items="rows"
        item-value="id"
        density="compact"
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
            @click="restore(item)" /></template></v-data-table
    ></v-card>
    <PersonEditor v-model="dialog" :person="editing" @saved="load" />
  </AppLayout>
</template>
<style scoped>
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
