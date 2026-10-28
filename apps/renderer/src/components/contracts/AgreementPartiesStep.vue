<script setup lang="ts">
import { computed, ref, shallowRef } from "vue";
import {
  PARTY_ROLE_LABELS,
  pickParty,
  rolesOf,
  type AgreementContext,
  type AgreementTerms,
  type ContractIssue,
  type PartyRecord,
  type PartyRole,
  type TemplateKey,
} from "@contract-document/index";
import PersonPicker from "../people/PersonPicker.vue";
import PersonEditor from "../people/PersonEditor.vue";
import * as peopleService from "../../services/people.service";
import { getErrorMessage } from "../../services/api.service";
import { usePermissions } from "../../composables/usePermissions";
import { useSnackbar } from "../../composables/useSnackbar";
import type { PersonRecord } from "../../types";

/**
 * The two parties, picked from the customers or added on the spot in a
 * dialog (saved to the customers like anywhere else). Each shows the
 * details the contract will print, and which are missing; a missing
 * detail is fixed in the customer's own record from here.
 */
const parties = defineModel<Partial<Record<PartyRole, number | null>>>(
  "parties",
  { required: true },
);
const terms = defineModel<AgreementTerms>("terms", { required: true });
const props = defineProps<{
  template: TemplateKey;
  context: AgreementContext;
  readonly?: boolean;
  issues: ContractIssue[];
}>();
const emit = defineEmits<{ party: [PartyRole, PartyRecord | null] }>();
const { can } = usePermissions();
const { notifyError } = useSnackbar();

const roles = computed(() => rolesOf(props.template));
const editorOpen = ref(false);
const editorRole = ref<PartyRole | null>(null);
const editorPerson = shallowRef<PersonRecord | null>(null);

function setParty(role: PartyRole, person: PersonRecord | null) {
  const other = roles.value.find((item) => item !== role)!;
  if (person && parties.value[other] === person.id) {
    notifyError("لا يكون الزبون نفسه طرفي العقد.");
    return;
  }
  parties.value = { ...parties.value, [role]: person?.id ?? null };
  emit("party", role, person ? pickParty(person) : null);
}

function onPicked(role: PartyRole, person: PersonRecord | null) {
  setParty(role, person);
}

function create(role: PartyRole) {
  editorRole.value = role;
  editorPerson.value = null;
  editorOpen.value = true;
}

async function edit(role: PartyRole) {
  const id = parties.value[role];
  if (!id) return;
  try {
    editorPerson.value = await peopleService.getPerson(id);
    editorRole.value = role;
    editorOpen.value = true;
  } catch (error) {
    notifyError(getErrorMessage(error));
  }
}

function onSaved(person: PersonRecord) {
  if (editorRole.value) setParty(editorRole.value, person);
}

function representative(role: PartyRole) {
  return terms.value.representatives?.[role] ?? { name: null, capacity: null };
}
function setRepresentative(
  role: PartyRole,
  field: "name" | "capacity",
  value: string | null,
) {
  const current = representative(role);
  terms.value = {
    ...terms.value,
    representatives: {
      ...terms.value.representatives,
      [role]: { ...current, [field]: value?.trim() ? value : null },
    },
  };
}

function facts(party: PartyRecord) {
  const address =
    party.address ??
    ([party.governorate, party.district, party.neighborhood]
      .filter(Boolean)
      .join("، ") ||
      null);
  return [
    { label: "رقم البطاقة الوطنية", value: party.national_id },
    { label: "الهاتف", value: party.phone_primary },
    { label: "العنوان", value: address },
    {
      label: "بطاقة السكن",
      value: party.residence_card_number,
      optional: true,
    },
  ];
}
const issueFor = (role: PartyRole) =>
  props.issues.find(
    (issue) => issue.code === "PARTY_MISSING" && issue.field === role,
  )?.message;
</script>

<template>
  <div class="parties">
    <section
      v-for="(role, index) in roles"
      :key="role"
      class="dal-panel parties__card"
      :aria-label="PARTY_ROLE_LABELS[role]"
    >
      <header class="dal-panel__header">
        <span class="dal-section-title"
          >الطرف {{ index === 0 ? "الأول" : "الثاني" }}:
          {{ PARTY_ROLE_LABELS[role] }}</span
        >
      </header>
      <div class="parties__body">
        <div class="parties__pick">
          <PersonPicker
            :model-value="parties[role] ?? null"
            :label="`اختر ${PARTY_ROLE_LABELS[role]}`"
            placeholder="ابحث بالاسم أو الهاتف أو رقم البطاقة"
            :disabled="readonly"
            :error-messages="issueFor(role) ? [issueFor(role)!] : []"
            clearable
            hide-details="auto"
            @update:model-value="!$event && setParty(role, null)"
            @picked="onPicked(role, $event)"
          />
          <v-btn
            v-if="!readonly && can('people.create')"
            variant="tonal"
            prepend-icon="mdi-account-plus-outline"
            @click="create(role)"
            >زبون جديد</v-btn
          >
        </div>

        <template v-if="context.parties[role]">
          <dl class="parties__facts">
            <div
              v-for="fact in facts(context.parties[role]!)"
              :key="fact.label"
            >
              <dt>{{ fact.label }}</dt>
              <dd :class="{ parties__missing: !fact.value && !fact.optional }">
                <bdi>{{
                  fact.value ?? (fact.optional ? "—" : "غير مسجل")
                }}</bdi>
              </dd>
            </div>
          </dl>
          <v-btn
            v-if="!readonly && can('people.update')"
            size="small"
            variant="text"
            prepend-icon="mdi-account-edit-outline"
            @click="edit(role)"
            >تعديل بيانات الزبون</v-btn
          >
        </template>

        <div class="parties__rep">
          <div class="parties__sub">وكيل أو ممثل (اختياري)</div>
          <div class="parties__grid">
            <v-text-field
              :model-value="representative(role).name ?? ''"
              label="اسم الوكيل أو الممثل"
              :disabled="readonly"
              hide-details
              @update:model-value="setRepresentative(role, 'name', $event)"
            />
            <v-text-field
              :model-value="representative(role).capacity ?? ''"
              label="صفته وسنده (وكالة رقم…)"
              :disabled="readonly"
              hide-details
              @update:model-value="setRepresentative(role, 'capacity', $event)"
            />
          </div>
        </div>
      </div>
    </section>

    <PersonEditor
      v-model="editorOpen"
      :person="editorPerson"
      @saved="onSaved"
    />
  </div>
</template>

<style scoped>
.parties {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(340px, 1fr));
  gap: var(--dal-gutter);
}
.parties__body {
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.parties__pick {
  display: flex;
  align-items: flex-start;
  gap: 8px;
}
.parties__pick > :first-child {
  flex: 1 1 auto;
}
.parties__facts {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 6px 16px;
  margin: 0;
}
.parties__facts dt {
  font-size: 12px;
  color: var(--dal-muted);
}
.parties__facts dd {
  margin: 0;
  font-size: 14px;
}
.parties__missing {
  color: rgb(var(--v-theme-warning));
}
.parties__sub {
  font-size: 12px;
  font-weight: 700;
  color: var(--dal-muted);
  margin-bottom: 6px;
}
.parties__grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}
</style>
