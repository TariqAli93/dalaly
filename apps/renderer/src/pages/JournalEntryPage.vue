<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import AppPage from "../components/app/AppPage.vue";
import JournalEntryDialog from "../components/accounting/JournalEntryDialog.vue";
import * as accountingService from "../services/accounting.service";
import { getErrorMessage } from "../services/api.service";
import { usePermissions } from "../composables/usePermissions";
import { useConfirm } from "../composables/useConfirm";
import { useRefresh } from "../composables/useRefresh";
import { useSnackbar } from "../composables/useSnackbar";
import {
  journalSourceLabel,
  journalStatusColor,
  journalStatusLabel,
} from "../constants/accounting";
import {
  formatAmount,
  formatDate,
  formatDateTime,
  todayIso,
} from "../utils/format";
import { minorToAmount, sumAmounts } from "../utils/money";
import type { JournalEntryDetail } from "../types";

/**
 * صفحة القيد: سطوره بمدينها ودائنها ومجموعيهما. المسودة تُعدَّل وتُرحَّل
 * وتُحذف؛ القيد المرحَّل ثابت، ويُصحَّح بقيد عكسي يُرحَّل بتاريخ اليوم
 * أو بتاريخ يُختار، مرة واحدة.
 */
const route = useRoute();
const router = useRouter();
const { can } = usePermissions();
const { openConfirm } = useConfirm();
const { setRefreshHandler } = useRefresh();
const { notifySuccess, notifyError } = useSnackbar();

const entry = ref<JournalEntryDetail | null>(null);
const loading = ref(false);
const error = ref<string | null>(null);
const id = computed(() => Number(route.params.id));

async function load() {
  loading.value = true;
  error.value = null;
  try {
    entry.value = await accountingService.getJournalEntry(id.value);
  } catch (cause) {
    error.value = getErrorMessage(cause);
  } finally {
    loading.value = false;
  }
}
watch(id, () => void load());
onMounted(() => {
  setRefreshHandler(load);
  void load();
});

const isDraft = computed(() => entry.value?.status === "draft");
const totals = computed(() => {
  const lines = entry.value?.lines ?? [];
  return {
    debit: minorToAmount(sumAmounts(lines.map((line) => line.debit)) ?? 0n),
    credit: minorToAmount(sumAmounts(lines.map((line) => line.credit)) ?? 0n),
  };
});
const canReverse = computed(
  () =>
    entry.value?.status === "posted" &&
    // Receipts and payments are undone by voiding the voucher itself.
    entry.value.source_type === "manual" &&
    !entry.value.reversed_by_id &&
    can("accounting.journal.reverse"),
);
const amount = (value: string) =>
  value === "0.00" ? "" : formatAmount(value, entry.value?.currency);

// ─── الأوامر ───────────────────────────────────────────────────────────
const editDialog = ref(false);
const busy = ref(false);
function onEdited(saved: JournalEntryDetail) {
  entry.value = saved;
  notifySuccess(
    saved.status === "posted"
      ? `رُحِّل القيد ${saved.code}.`
      : `حُفظت المسودة ${saved.code}.`,
  );
}

async function post() {
  const current = entry.value;
  if (!current || busy.value) return;
  busy.value = true;
  try {
    entry.value = await accountingService.postJournalEntry(current.id);
    notifySuccess(`رُحِّل القيد ${current.code}.`);
  } catch (cause) {
    notifyError(getErrorMessage(cause));
  } finally {
    busy.value = false;
  }
}

function remove() {
  const current = entry.value;
  if (!current) return;
  openConfirm({
    title: `حذف المسودة ${current.code}`,
    body: "تُحذف المسودة وسطورها. القيود المرحَّلة لا تُحذف أبداً.",
    confirmText: "حذف",
    color: "error",
    onConfirm: async () => {
      await accountingService.deleteJournalEntry(current.id);
      notifySuccess(`حُذفت المسودة ${current.code}.`);
      void router.push("/accounting/journal");
    },
  });
}

const reverseDialog = ref(false);
const reverseDate = ref(todayIso());
const reverseReason = ref("");
const reverseError = ref("");
function openReverse() {
  reverseDate.value = todayIso();
  reverseReason.value = "";
  reverseError.value = "";
  reverseDialog.value = true;
}
async function reverse() {
  const current = entry.value;
  if (!current || busy.value) return;
  if (!reverseReason.value.trim()) {
    reverseError.value = "اذكر سبب عكس القيد.";
    return;
  }
  busy.value = true;
  reverseError.value = "";
  try {
    const reversal = await accountingService.reverseJournalEntry(current.id, {
      entry_date: reverseDate.value,
      reason: reverseReason.value.trim(),
    });
    reverseDialog.value = false;
    notifySuccess(`عُكس القيد ${current.code} بالقيد ${reversal.code}.`);
    void router.push(`/accounting/journal/${reversal.id}`);
  } catch (cause) {
    reverseError.value = getErrorMessage(cause);
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <AppPage
    :title="entry ? `القيد ${entry.code}` : 'القيد'"
    :parent="{ to: '/accounting/journal', label: 'القيود' }"
  >
    <template v-if="entry" #header-actions>
      <template v-if="isDraft">
        <v-btn
          v-if="can('accounting.journal.create')"
          variant="text"
          prepend-icon="mdi-pencil-outline"
          @click="editDialog = true"
          >تعديل</v-btn
        >
        <v-btn
          v-if="can('accounting.journal.create')"
          variant="text"
          color="error"
          prepend-icon="mdi-delete-outline"
          @click="remove"
          >حذف</v-btn
        >
        <v-btn
          v-if="can('accounting.journal.post')"
          color="primary"
          variant="flat"
          prepend-icon="mdi-check-decagram-outline"
          :loading="busy"
          @click="post"
          >ترحيل</v-btn
        >
      </template>
      <v-btn
        v-else-if="canReverse"
        variant="tonal"
        prepend-icon="mdi-swap-horizontal"
        @click="openReverse"
        >قيد عكسي</v-btn
      >
    </template>

    <v-progress-linear v-if="loading && !entry" indeterminate />
    <v-alert v-else-if="error" type="error" variant="tonal">
      {{ error }}
      <template #append>
        <v-btn variant="text" size="small" @click="load">إعادة المحاولة</v-btn>
      </template>
    </v-alert>

    <template v-else-if="entry">
      <section class="dal-panel entry-summary" aria-label="بيانات القيد">
        <div class="entry-summary__title">
          <h2 class="text-h6">{{ entry.description }}</h2>
          <v-chip
            size="small"
            variant="tonal"
            label
            :color="journalStatusColor(entry.status)"
            >{{ journalStatusLabel(entry.status) }}</v-chip
          >
        </div>
        <dl class="entry-facts">
          <div>
            <dt>التاريخ</dt>
            <dd>
              <span>{{ formatDate(entry.entry_date) }}</span>
            </dd>
          </div>
          <div>
            <dt>المبلغ</dt>
            <dd>
              <bdi>{{ formatAmount(entry.total, entry.currency) }}</bdi>
            </dd>
          </div>
          <div>
            <dt>المصدر</dt>
            <dd>{{ journalSourceLabel(entry.source_type) }}</dd>
          </div>
          <div v-if="entry.posted_at">
            <dt>رُحِّل</dt>
            <dd>
              <span>{{ formatDateTime(entry.posted_at) }}</span>
              <template v-if="entry.posted_by_name">
                · {{ entry.posted_by_name }}</template
              >
            </dd>
          </div>
          <div v-else-if="entry.created_by_name">
            <dt>أنشأه</dt>
            <dd>{{ entry.created_by_name }}</dd>
          </div>
        </dl>
        <v-alert
          v-if="entry.reversed_by_id"
          type="info"
          variant="tonal"
          density="compact"
          class="mt-3"
        >
          عُكس هذا القيد بالقيد
          <router-link :to="`/accounting/journal/${entry.reversed_by_id}`"
            ><bdi>{{ entry.reversed_by_code }}</bdi></router-link
          >؛ أثرهما معاً صفر.
        </v-alert>
        <v-alert
          v-if="entry.reversal_of_id"
          type="info"
          variant="tonal"
          density="compact"
          class="mt-3"
        >
          قيد عكسي يُلغي أثر القيد
          <router-link :to="`/accounting/journal/${entry.reversal_of_id}`"
            ><bdi>{{ entry.reversal_of_code }}</bdi></router-link
          >.
        </v-alert>
        <v-alert
          v-if="isDraft"
          type="warning"
          variant="tonal"
          density="compact"
          class="mt-3"
        >
          مسودة: لا أثر لها في الأرصدة حتى تُرحَّل.
        </v-alert>
      </section>

      <section class="dal-panel mt-4" aria-label="سطور القيد">
        <v-table density="compact" class="entry-lines">
          <thead>
            <tr>
              <th scope="col">الحساب</th>
              <th scope="col" class="entry-lines__amount">مدين</th>
              <th scope="col" class="entry-lines__amount">دائن</th>
              <th scope="col">التفاصيل</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="line in entry.lines" :key="line.id">
              <td>
                <router-link
                  v-if="can('accounting.read')"
                  :to="`/accounting/accounts/${line.account_id}`"
                  ><bdi>{{ line.account_code }}</bdi>
                  {{ line.account_name }}</router-link
                >
              </td>
              <td class="entry-lines__amount">
                <bdi>{{ amount(line.debit) }}</bdi>
              </td>
              <td class="entry-lines__amount">
                <bdi>{{ amount(line.credit) }}</bdi>
              </td>
              <td>
                <span v-if="line.memo">{{ line.memo }}</span>
                <router-link
                  v-if="line.person_id"
                  :to="`/clients/${line.person_id}`"
                  class="ms-2"
                  >{{ line.person_name }}</router-link
                >
                <router-link
                  v-if="line.deal_id"
                  :to="`/deals/${line.deal_id}`"
                  class="ms-2"
                  ><bdi>{{ line.deal_code }}</bdi></router-link
                >
              </td>
            </tr>
          </tbody>
          <tfoot>
            <tr>
              <th scope="row">المجموع</th>
              <td class="entry-lines__amount">
                <bdi>{{ formatAmount(totals.debit, entry.currency) }}</bdi>
              </td>
              <td class="entry-lines__amount">
                <bdi>{{ formatAmount(totals.credit, entry.currency) }}</bdi>
              </td>
              <td />
            </tr>
          </tfoot>
        </v-table>
      </section>
    </template>

    <JournalEntryDialog v-model="editDialog" :entry="entry" @saved="onEdited" />

    <v-dialog v-model="reverseDialog" max-width="480" :persistent="busy">
      <v-card tag="form" @submit.prevent="reverse">
        <v-card-title>قيد عكسي للقيد {{ entry?.code }}</v-card-title>
        <v-card-text>
          <p class="text-body-2 mb-3">
            يُرحَّل قيد بالسطور نفسها والمدين والدائن متبادلان، فيلغي أثر القيد.
            القيد الأصلي يبقى كما هو في الدفاتر، ولا يُعكس إلا مرة واحدة.
          </p>
          <v-alert
            v-if="reverseError"
            type="error"
            variant="tonal"
            class="mb-3"
            >{{ reverseError }}</v-alert
          >
          <v-text-field
            v-model="reverseDate"
            type="date"
            label="تاريخ القيد العكسي"
            class="mb-3"
            hide-details
          />
          <v-text-field
            v-model="reverseReason"
            label="سبب العكس *"
            placeholder="مثلاً: سُجّل المبلغ مرتين"
            hide-details
          />
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn variant="text" :disabled="busy" @click="reverseDialog = false"
            >إلغاء</v-btn
          >
          <v-btn color="primary" variant="flat" type="submit" :loading="busy"
            >ترحيل القيد العكسي</v-btn
          >
        </v-card-actions>
      </v-card>
    </v-dialog>
  </AppPage>
</template>

<style scoped>
.entry-summary {
  padding: 16px 20px;
}
.entry-summary__title {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}
.entry-facts {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(11rem, 1fr));
  gap: 12px 24px;
  margin-block-start: 12px;
}
.entry-facts dt {
  font-size: 0.8125rem;
  color: rgb(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}
.entry-facts dd {
  font-weight: 500;
}
.entry-lines__amount {
  text-align: end;
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
  width: 18%;
}
.entry-lines tfoot th,
.entry-lines tfoot td {
  font-weight: 600;
}
</style>
