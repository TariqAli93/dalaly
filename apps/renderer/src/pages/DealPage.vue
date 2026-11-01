<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import {
  TEMPLATES,
  TEMPLATE_KEYS,
  type TemplateKey,
} from "@contract-document/index";
import AppPage from "../components/app/AppPage.vue";
import RecordFacts from "../components/shared/RecordFacts.vue";
import NumberField from "../components/app/NumberField.vue";
import TaskDialog from "../components/tasks/TaskDialog.vue";
import DealDialog from "../components/deals/DealDialog.vue";
import DealStageDialog from "../components/deals/DealStageDialog.vue";
import DealCommissions from "../components/deals/DealCommissions.vue";
import DealMoney from "../components/deals/DealMoney.vue";
import type { RecordFact } from "../components/shared/record";
import * as dealsService from "../services/deals.service";
import * as activitiesService from "../services/activities.service";
import { getErrorMessage } from "../services/api.service";
import { usePermissions } from "../composables/usePermissions";
import { useSnackbar } from "../composables/useSnackbar";
import { useRefresh } from "../composables/useRefresh";
import {
  OPEN_DEAL_STAGES,
  dealPartyLabels,
  dealStageColor,
  dealStageLabel,
  dealTypeLabel,
  isClosedDealStage,
} from "../constants/deals";
import {
  followupTypeIcon,
  followupTypeLabel,
  taskStatusColor,
  taskStatusLabel,
} from "../constants/crm";
import { formatAmount, formatDate, formatDateTime } from "../utils/format";
import type {
  DealDetail,
  DealOfferRecord,
  DealRecord,
  DealStage,
  TaskFieldsPayload,
} from "../types";

/**
 * مساحة الصفقة: مرحلتها وأطرافها وعرضها وأسعارها في الأعلى، ومسار مراحلها،
 * ثم العروض والعروض المضادة (قبول عرض يجعل مبلغه السعر المتفق عليه)،
 * ونشاطاتها (معاينات واتصالات مسجلة على الزبون مع الصفقة)، وسجل مراحلها.
 */
const route = useRoute();
const router = useRouter();
const { can } = usePermissions();
const { notifyError, notifySuccess } = useSnackbar();
const { setRefreshHandler } = useRefresh();

const deal = ref<DealDetail | null>(null);
const money = ref<InstanceType<typeof DealMoney> | null>(null);
const loading = ref(false);
const error = ref("");
let requestId = 0;

async function load() {
  const current = ++requestId;
  const id = Number(route.params.id);
  loading.value = true;
  error.value = "";
  try {
    if (!Number.isSafeInteger(id) || id <= 0)
      throw new Error("رقم الصفقة غير صالح.");
    const record = await dealsService.getDeal(id);
    if (current === requestId) deal.value = record;
  } catch (cause) {
    if (current === requestId) {
      deal.value = null;
      error.value = getErrorMessage(cause);
    }
  } finally {
    if (current === requestId) loading.value = false;
  }
}
watch(() => route.params.id, load, { immediate: true });
onMounted(() => setRefreshHandler(load));

const parties = computed(() =>
  dealPartyLabels(deal.value?.deal_type ?? "sale"),
);
const closed = computed(() =>
  deal.value ? isClosedDealStage(deal.value.stage) : false,
);
const title = computed(() =>
  deal.value ? deal.value.title || `صفقة ${deal.value.code}` : "الصفقة",
);
const listingLink = computed(() => {
  const d = deal.value;
  if (!d) return null;
  if (d.property_id) return `/properties/${d.property_id}`;
  if (d.rental_id) return `/rentals/${d.rental_id}`;
  return null;
});

const facts = computed<RecordFact[]>(() => {
  const d = deal.value;
  if (!d) return [];
  return [
    {
      key: "price",
      label: d.agreed_price ? "السعر المتفق عليه" : "السعر المطلوب",
      value: formatAmount(d.agreed_price ?? d.asking_price, d.currency),
      hint: d.agreed_price
        ? `المطلوب: ${formatAmount(d.asking_price, d.currency)}`
        : null,
      emphasis: true,
    },
    { key: "client", label: parties.value.client, value: d.client_name },
    { key: "owner", label: parties.value.owner, value: d.owner_name ?? "—" },
    { key: "listing", label: "العرض", value: d.listing_name ?? "—" },
    {
      key: "commission",
      label: "العمولة المتوقعة",
      value: formatAmount(d.expected_commission, d.currency),
    },
    {
      key: "assigned",
      label: "المسؤول",
      value: d.assigned_user_name ?? "—",
      hint: d.expected_close_date
        ? `الإغلاق المتوقع ${formatDate(d.expected_close_date)}`
        : null,
    },
  ];
});

// ─── المراحل ────────────────────────────────────────────────────────────
const stageIndex = computed(() =>
  OPEN_DEAL_STAGES.findIndex((stage) => stage.value === deal.value?.stage),
);
const stageDialog = ref(false);
const stageTarget = ref<DealStage | null>(null);
function openMove(to: DealStage | null = null) {
  stageTarget.value = to;
  stageDialog.value = true;
}
function onMoved(moved: DealDetail) {
  deal.value = moved;
  notifySuccess(`الصفقة الآن في «${dealStageLabel(moved.stage)}».`);
}

// ─── التعديل ────────────────────────────────────────────────────────────
const editDialog = ref(false);

// ─── العقد ──────────────────────────────────────────────────────────────
// مسودة من قالب نوع الصفقة بأطرافها وعرضها وسعرها وعمولتها، تُفتح للإكمال.
const contractDialog = ref(false);
const contractTemplate = ref<TemplateKey | null>(null);
const preparing = ref(false);
const contractTemplates = computed(() =>
  TEMPLATE_KEYS.filter((key) => TEMPLATES[key].kind === deal.value?.deal_type),
);
const canPrepare = computed(
  () =>
    Boolean(deal.value) &&
    can("deals.update") &&
    can("agreements.manage") &&
    !closed.value &&
    (!deal.value!.agreement_id || deal.value!.agreement_status === "cancelled"),
);
function openContract() {
  contractTemplate.value = contractTemplates.value[0] ?? null;
  contractDialog.value = true;
}
async function prepareContract() {
  const d = deal.value;
  if (!d || !contractTemplate.value || preparing.value) return;
  preparing.value = true;
  try {
    const prepared = await dealsService.prepareDealAgreement(
      d.id,
      contractTemplate.value,
    );
    deal.value = prepared.deal;
    contractDialog.value = false;
    notifySuccess("أُعدّت مسودة العقد؛ أكمل بياناتها ثم أصدرها.");
    // الأطراف والعقار من الصفقة: يبدأ العقد بما بقي، «التفاصيل».
    void router.push(`/contracts/${prepared.agreement_id}?step=details`);
  } catch (cause) {
    notifyError(getErrorMessage(cause));
  } finally {
    preparing.value = false;
  }
}
function onEdited(saved: DealRecord) {
  notifySuccess(`حُفظت الصفقة ${saved.code}.`);
  void load();
}

// ─── العروض ─────────────────────────────────────────────────────────────
const offerParty = ref<"client" | "owner">("client");
const offerAmount = ref<string | number | null>("");
const offerNotes = ref("");
const offerSaving = ref(false);
const OFFER_STATUS: Record<
  DealOfferRecord["status"],
  { title: string; color: string }
> = {
  proposed: { title: "مقترح", color: "info" },
  countered: { title: "قوبل بعرض مضاد", color: "warning" },
  accepted: { title: "مقبول", color: "success" },
  rejected: { title: "مرفوض", color: "error" },
  withdrawn: { title: "مسحوب", color: "default" },
};
async function addOffer() {
  const d = deal.value;
  if (
    !d ||
    offerSaving.value ||
    offerAmount.value === "" ||
    offerAmount.value === null
  )
    return;
  offerSaving.value = true;
  try {
    await dealsService.addDealOffer(d.id, {
      party: offerParty.value,
      amount: String(offerAmount.value),
      notes: offerNotes.value.trim() || null,
    });
    offerAmount.value = "";
    offerNotes.value = "";
    notifySuccess("سُجّل العرض.");
    await load();
  } catch (cause) {
    notifyError(getErrorMessage(cause));
  } finally {
    offerSaving.value = false;
  }
}
async function settleOffer(
  offer: DealOfferRecord,
  status: "countered" | "accepted" | "rejected" | "withdrawn",
) {
  const d = deal.value;
  if (!d) return;
  try {
    deal.value = await dealsService.setDealOfferStatus(d.id, offer.id, status);
    if (status === "accepted")
      notifySuccess(
        `قُبل العرض؛ السعر المتفق عليه ${formatAmount(offer.amount, d.currency)}.`,
      );
  } catch (cause) {
    notifyError(getErrorMessage(cause));
  }
}

// ─── النشاطات ───────────────────────────────────────────────────────────
const activityDialog = ref(false);
async function addActivity(value: TaskFieldsPayload) {
  const d = deal.value;
  if (!d) return;
  await activitiesService.createActivity({
    ...value,
    person_id: d.client_person_id,
    deal_id: d.id,
  });
  notifySuccess("سُجّل النشاط على الصفقة.");
  await load();
}
</script>

<template>
  <AppPage :title="title" :parent="{ to: '/deals', label: 'الصفقات' }">
    <template v-if="deal" #status>
      <bdi class="text-medium-emphasis"
        >{{ deal.code }} · {{ dealTypeLabel(deal.deal_type) }}</bdi
      >
      <v-chip
        size="small"
        variant="tonal"
        label
        :color="dealStageColor(deal.stage)"
        >{{ dealStageLabel(deal.stage) }}</v-chip
      >
    </template>
    <template v-if="deal" #header-actions>
      <v-btn
        v-if="can('deals.update')"
        variant="text"
        prepend-icon="mdi-pencil-outline"
        @click="editDialog = true"
        >تعديل</v-btn
      >
      <v-btn
        v-if="canPrepare"
        variant="tonal"
        prepend-icon="mdi-file-sign"
        @click="openContract"
        >إعداد العقد</v-btn
      >
      <v-btn
        v-else-if="deal.agreement_id && can('agreements.read')"
        variant="text"
        prepend-icon="mdi-file-document-outline"
        :to="`/contracts/${deal.agreement_id}`"
        >العقد</v-btn
      >
      <v-btn
        v-if="can('deals.update')"
        color="primary"
        prepend-icon="mdi-arrow-left-bold-box-outline"
        @click="openMove()"
        >{{ closed ? "إعادة فتح" : "نقل المرحلة" }}</v-btn
      >
      <v-btn
        v-if="can('deals.close') && !closed"
        variant="tonal"
        color="success"
        prepend-icon="mdi-trophy-outline"
        @click="openMove('won')"
        >إغلاق كمكسوبة</v-btn
      >
      <v-btn
        v-if="can('deals.close') && !closed"
        variant="text"
        color="error"
        @click="openMove('lost')"
        >خاسرة</v-btn
      >
    </template>

    <v-skeleton-loader v-if="loading && !deal" type="table-heading, table" />
    <v-alert v-else-if="error" type="error" variant="tonal">
      {{ error }}
      <template #append>
        <v-btn variant="text" @click="load">إعادة المحاولة</v-btn>
      </template>
    </v-alert>
    <template v-else-if="deal">
      <RecordFacts :facts="facts" label="بيانات الصفقة" />

      <section class="dal-panel deal-stages" aria-label="مسار الصفقة">
        <ol class="deal-stages__list">
          <li
            v-for="(stage, index) in OPEN_DEAL_STAGES"
            :key="stage.value"
            :class="{
              'is-done': !closed && index < stageIndex,
              'is-current': stage.value === deal.stage,
            }"
            :aria-current="stage.value === deal.stage ? 'step' : undefined"
          >
            {{ stage.title }}
          </li>
        </ol>
        <p v-if="closed" class="deal-stages__closed">
          أُغلقت الصفقة «{{ dealStageLabel(deal.stage) }}»
          <span v-if="deal.closed_at"
            >في <bdi dir="rtl">{{ formatDateTime(deal.closed_at) }}</bdi></span
          >
          <span v-if="deal.lost_reason">: {{ deal.lost_reason }}</span>
        </p>
      </section>

      <div class="deal-grid">
        <section
          class="dal-panel deal-panel"
          aria-label="العروض والعروض المضادة"
        >
          <h2 class="deal-panel__title">العروض</h2>
          <form
            v-if="can('deals.update') && !closed"
            class="deal-offer-form"
            @submit.prevent="addOffer"
          >
            <v-btn-toggle
              v-model="offerParty"
              mandatory
              density="compact"
              variant="outlined"
              divided
              aria-label="صاحب العرض"
            >
              <v-btn value="client">{{ parties.client }}</v-btn>
              <v-btn value="owner">{{ parties.owner }}</v-btn>
            </v-btn-toggle>
            <NumberField
              v-model="offerAmount"
              :label="`المبلغ (${deal.currency === 'USD' ? 'دولار' : 'دينار'})`"
              density="compact"
              hide-details
            />
            <v-text-field
              v-model="offerNotes"
              label="ملاحظة"
              density="compact"
              hide-details
            />
            <v-btn
              type="submit"
              color="primary"
              variant="tonal"
              :loading="offerSaving"
              >تسجيل العرض</v-btn
            >
          </form>
          <p v-if="!deal.offers.length" class="deal-panel__empty">
            لم يُسجَّل عرض بعد.
          </p>
          <ul v-else class="deal-list">
            <li v-for="offer in deal.offers" :key="offer.id">
              <div class="deal-list__main">
                <strong
                  ><bdi>{{
                    formatAmount(offer.amount, deal.currency)
                  }}</bdi></strong
                >
                <span
                  >من
                  {{
                    offer.party === "client" ? parties.client : parties.owner
                  }}</span
                >
                <v-chip
                  size="x-small"
                  variant="tonal"
                  label
                  :color="OFFER_STATUS[offer.status].color"
                  >{{ OFFER_STATUS[offer.status].title }}</v-chip
                >
                <span v-if="offer.notes" class="deal-list__meta">{{
                  offer.notes
                }}</span>
                <span class="deal-list__meta"
                  ><bdi dir="rtl">{{ formatDateTime(offer.created_at) }}</bdi>
                  <template v-if="offer.created_by_name">
                    · {{ offer.created_by_name }}</template
                  ></span
                >
              </div>
              <div
                v-if="
                  can('deals.update') &&
                  !closed &&
                  ['proposed', 'countered'].includes(offer.status)
                "
                class="deal-list__actions"
              >
                <v-btn
                  size="small"
                  variant="tonal"
                  color="success"
                  @click="settleOffer(offer, 'accepted')"
                  >قبول</v-btn
                >
                <v-btn
                  v-if="offer.status === 'proposed'"
                  size="small"
                  variant="text"
                  @click="settleOffer(offer, 'countered')"
                  >عرض مضاد</v-btn
                >
                <v-btn
                  size="small"
                  variant="text"
                  color="error"
                  @click="settleOffer(offer, 'rejected')"
                  >رفض</v-btn
                >
              </div>
            </li>
          </ul>
        </section>

        <DealCommissions
          v-if="can('commissions.read')"
          :deal="deal"
          @changed="money?.reload()"
        />
        <DealMoney v-if="can('vouchers.read')" ref="money" :deal="deal" />

        <section class="dal-panel deal-panel" aria-label="نشاطات الصفقة">
          <div class="deal-panel__bar">
            <h2 class="deal-panel__title">النشاطات</h2>
            <v-spacer />
            <v-btn
              v-if="can('followups.create') && can('people.read')"
              size="small"
              variant="tonal"
              prepend-icon="mdi-plus"
              @click="activityDialog = true"
              >معاينة أو اتصال</v-btn
            >
          </div>
          <p v-if="!deal.activities.length" class="deal-panel__empty">
            سجّل المعاينات والاتصالات وجولات التفاوض هنا.
          </p>
          <ul v-else class="deal-list">
            <li v-for="activity in deal.activities" :key="activity.id">
              <v-icon
                :icon="followupTypeIcon(activity.type)"
                size="18"
                aria-hidden="true"
              />
              <div class="deal-list__main">
                <strong>{{ followupTypeLabel(activity.type) }}</strong>
                <v-chip
                  size="x-small"
                  variant="tonal"
                  label
                  :color="taskStatusColor(activity.status)"
                  >{{ taskStatusLabel(activity.status) }}</v-chip
                >
                <span v-if="activity.notes">{{ activity.notes }}</span>
                <span v-if="activity.outcome"
                  ><strong>النتيجة:</strong> {{ activity.outcome }}</span
                >
                <span class="deal-list__meta"
                  ><bdi dir="rtl">{{
                    formatDateTime(activity.scheduled_at ?? activity.created_at)
                  }}</bdi>
                  · {{ activity.person_name }}</span
                >
              </div>
            </li>
          </ul>
        </section>

        <section class="dal-panel deal-panel" aria-label="سجل المراحل">
          <h2 class="deal-panel__title">سجل المراحل</h2>
          <ul class="deal-list">
            <li v-for="row in deal.history" :key="row.id">
              <div class="deal-list__main">
                <span
                  ><template v-if="row.from_stage"
                    >{{ dealStageLabel(row.from_stage) }} ← </template
                  ><strong>{{ dealStageLabel(row.to_stage) }}</strong></span
                >
                <span v-if="row.reason">{{ row.reason }}</span>
                <span class="deal-list__meta"
                  ><bdi dir="rtl">{{ formatDateTime(row.created_at) }}</bdi>
                  <template v-if="row.user_name">
                    · {{ row.user_name }}</template
                  ></span
                >
              </div>
            </li>
          </ul>
        </section>

        <section
          v-if="deal.notes || deal.request_code || deal.agreement_code"
          class="dal-panel deal-panel"
          aria-label="روابط وملاحظات"
        >
          <h2 class="deal-panel__title">روابط وملاحظات</h2>
          <p v-if="listingLink">
            العرض:
            <router-link :to="listingLink" class="record-link">{{
              deal.listing_name
            }}</router-link>
          </p>
          <p v-if="deal.request_code">
            الطلب: <bdi>{{ deal.request_code }}</bdi>
          </p>
          <p v-if="deal.agreement_code">
            العقد:
            <router-link
              :to="`/contracts/${deal.agreement_id}`"
              class="record-link"
              ><bdi>{{ deal.agreement_code }}</bdi></router-link
            >
          </p>
          <p v-if="deal.notes" class="deal-notes">{{ deal.notes }}</p>
        </section>
      </div>
    </template>

    <DealDialog v-model="editDialog" :deal="deal" @saved="onEdited" />
    <v-dialog v-model="contractDialog" max-width="480" :persistent="preparing">
      <v-card>
        <v-card-title class="text-subtitle-1 font-weight-bold"
          >إعداد عقد للصفقة {{ deal?.code }}</v-card-title
        >
        <v-card-text>
          <p class="mb-2">
            تُنشأ مسودة بأطراف الصفقة وعرضها وسعرها وعمولتها، تكملها في محرر
            العقد ثم تصدرها؛ صدورها ينقل الصفقة إلى «صدر العقد».
          </p>
          <v-radio-group v-model="contractTemplate" hide-details>
            <v-radio
              v-for="key in contractTemplates"
              :key="key"
              :value="key"
              :label="TEMPLATES[key].title"
            />
          </v-radio-group>
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn
            variant="text"
            :disabled="preparing"
            @click="contractDialog = false"
            >إلغاء</v-btn
          >
          <v-btn
            color="primary"
            variant="flat"
            :loading="preparing"
            :disabled="!contractTemplate"
            @click="prepareContract"
            >إعداد المسودة</v-btn
          >
        </v-card-actions>
      </v-card>
    </v-dialog>
    <DealStageDialog
      v-model="stageDialog"
      :deal="deal"
      :target="stageTarget"
      @moved="onMoved"
    />
    <TaskDialog
      v-if="deal"
      v-model="activityDialog"
      title="نشاط على الصفقة"
      :subtitle="`${deal.code} · ${deal.client_name}`"
      :initial="{ type: 'visit' }"
      person="hidden"
      :save="addActivity"
    />
  </AppPage>
</template>

<style scoped>
.deal-stages {
  padding: 12px 16px;
}
.deal-stages__list {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  list-style: none;
  margin: 0;
  padding: 0;
}
.deal-stages__list li {
  padding: 4px 10px;
  border-radius: 999px;
  font-size: 0.8rem;
  border: 1px solid rgb(var(--v-border-color), var(--v-border-opacity));
  color: rgb(var(--v-theme-on-surface-variant));
}
.deal-stages__list li.is-done {
  background: rgb(var(--v-theme-success), 0.12);
  color: rgb(var(--v-theme-on-surface));
}
.deal-stages__list li.is-current {
  background: rgb(var(--v-theme-primary));
  border-color: rgb(var(--v-theme-primary));
  color: rgb(var(--v-theme-on-primary));
  font-weight: 700;
}
.deal-stages__closed {
  margin: 8px 0 0;
}
.deal-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(340px, 1fr));
  gap: 12px;
}
.deal-panel {
  padding: 12px 16px;
}
.deal-panel__bar {
  display: flex;
  align-items: center;
}
.deal-panel__title {
  margin: 0 0 8px;
  font-size: 0.95rem;
  font-weight: 700;
}
.deal-panel__empty {
  margin: 0;
  color: rgb(var(--v-theme-on-surface-variant));
}
.deal-offer-form {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 8px;
  margin-bottom: 12px;
  align-items: center;
}
.deal-list {
  list-style: none;
  margin: 0;
  padding: 0;
}
.deal-list li {
  display: flex;
  gap: 8px;
  align-items: flex-start;
  padding: 8px 0;
  border-bottom: 1px solid rgb(var(--v-border-color), var(--v-border-opacity));
}
.deal-list__main {
  flex: 1;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px 8px;
  min-width: 0;
}
.deal-list__meta {
  width: 100%;
  font-size: 0.75rem;
  color: rgb(var(--v-theme-on-surface-variant));
}
.deal-list__actions {
  display: flex;
  gap: 4px;
}
.deal-notes {
  white-space: pre-wrap;
}
</style>
