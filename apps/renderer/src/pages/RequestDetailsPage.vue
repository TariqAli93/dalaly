<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import AppPage from "../components/app/AppPage.vue";
import RecordFacts from "../components/shared/RecordFacts.vue";
import DetailList from "../components/shared/DetailList.vue";
import PhoneLink from "../components/shared/PhoneLink.vue";
import MatchList from "../components/requests/MatchList.vue";
import RequestFormDialog from "../components/requests/RequestFormDialog.vue";
import type { DetailSection, RecordFact } from "../components/shared/record";
import * as requests from "../services/requests.service";
import * as peopleService from "../services/people.service";
import { getErrorMessage } from "../services/api.service";
import { usePermissions } from "../composables/usePermissions";
import { useRefresh } from "../composables/useRefresh";
import { useSnackbar } from "../composables/useSnackbar";
import { useConfirm } from "../composables/useConfirm";
import { RENT_PERIOD_LABELS } from "../constants/domain";
import {
  REQUEST_STATUSES,
  requestStatusColor,
  requestStatusLabel,
} from "../constants/crm";
import { formatDateTime, formatMoney, formatNumber } from "../utils/format";
import { amenitiesText } from "../utils/amenities";
import {
  requestLabel,
  requestListPath,
  requestPayload,
  requestPropertyTypeLabel,
  requestToForm,
  type RequestMode,
  type RequestRecord,
} from "../utils/requestForm";
import type { MatchResult, PersonRecord } from "../types";

/**
 * صفحة طلب شراء أو إيجار: من الزبون وكيف يُتّصل به، وماذا يريد، والعروض التي
 * تطابقه الآن. التعديل في حوار النموذج، وتغيير الحالة (تمت المطابقة، مغلق،
 * أرشفة) من قائمة الأوامر دون فتح النموذج كله.
 */
const props = defineProps<{ mode: RequestMode }>();
const route = useRoute();
const router = useRouter();
const { can } = usePermissions();
const { setRefreshHandler } = useRefresh();
const { notifyError, notifySuccess } = useSnackbar();
const { openConfirm } = useConfirm();

const record = ref<RequestRecord | null>(null);
const person = ref<PersonRecord | null>(null);
const loading = ref(false);
const error = ref("");
const matches = ref<MatchResult[]>([]);
const matchesLoading = ref(false);
const matchesError = ref("");
const editOpen = ref(false);
let requestId = 0;

const label = computed(() => requestLabel(props.mode));
const listLabel = computed(() =>
  props.mode === "rental" ? "طلبات الإيجار" : "طلبات الشراء",
);

async function loadMatches(id: number) {
  matchesLoading.value = true;
  matchesError.value = "";
  try {
    const result =
      props.mode === "rental"
        ? await requests.rentalOfferMatches(id)
        : await requests.purchaseOfferMatches(id);
    matches.value = result.matches;
  } catch (cause) {
    matches.value = [];
    matchesError.value = getErrorMessage(cause);
  } finally {
    matchesLoading.value = false;
  }
}

async function load() {
  const current = ++requestId;
  loading.value = true;
  error.value = "";
  try {
    const id = Number(route.params.id);
    if (!Number.isSafeInteger(id) || id <= 0)
      throw new Error("رقم الطلب غير صالح.");
    const item =
      props.mode === "rental"
        ? await requests.getRentalRequest(id)
        : await requests.getPurchaseRequest(id);
    if (current !== requestId) return;
    record.value = item;
    void loadMatches(id);
    person.value = null;
    if (can("people.read"))
      void peopleService
        .getPerson(item.person_id)
        .then((found) => {
          if (current === requestId) person.value = found;
        })
        .catch(() => undefined);
  } catch (cause) {
    if (current === requestId) {
      record.value = null;
      error.value = getErrorMessage(cause);
    }
  } finally {
    if (current === requestId) loading.value = false;
  }
}
watch(
  () => route.params.id,
  () => void load(),
  { immediate: true },
);
onMounted(() => setRefreshHandler(load));

const title = computed(() =>
  record.value ? `${label.value} ${record.value.code}` : label.value,
);
const customerName = computed(
  () => record.value?.person_name || record.value?.person_code || "—",
);

function range(
  min: string | number | null,
  max: string | number | null,
  format: (value: unknown) => string,
  unit = "",
) {
  const low = min !== null && min !== "" ? format(min) : null;
  const high = max !== null && max !== "" ? format(max) : null;
  const suffix = unit ? ` ${unit}` : "";
  if (low && high) return `${low} – ${high}${suffix}`;
  if (high) return `حتى ${high}${suffix}`;
  if (low) return `من ${low}${suffix}`;
  return null;
}

const facts = computed<RecordFact[]>(() => {
  const r = record.value;
  if (!r) return [];
  const period =
    "rent_period" in r && r.rent_period
      ? (RENT_PERIOD_LABELS[r.rent_period] ?? r.rent_period)
      : null;
  return [
    {
      key: "budget",
      label: "الميزانية (د.ع)",
      value:
        range(r.budget_min, r.budget_max, (v) => formatMoney(v)) ?? "بلا حد",
      emphasis: true,
    },
    { key: "person", label: "الزبون", value: customerName.value },
    {
      key: "type",
      label: "المطلوب",
      value: requestPropertyTypeLabel(props.mode, r.property_type),
      hint: period,
    },
    {
      key: "location",
      label: "الموقع",
      value:
        [r.governorate, r.district, r.neighborhood]
          .filter(Boolean)
          .join(" · ") || "أي موقع",
    },
    {
      key: "area",
      label: "المساحة",
      value:
        range(
          r.area_min,
          r.area_max,
          (v) => formatNumber(v),
          r.area_unit ?? "",
        ) ?? "غير محددة",
    },
  ];
});

const sections = computed<DetailSection[]>(() => {
  const r = record.value;
  if (!r) return [];
  return [
    {
      title: "المواصفات",
      items: [
        { label: "الغرف", value: r.rooms_count },
        { label: "الحمامات", value: r.bathrooms_count },
        { label: "الطوابق", value: r.floors_count },
        { label: "المميزات المطلوبة", value: amenitiesText(r.amenities) },
      ],
    },
    {
      title: "الملاحظات",
      items: [
        { label: "متطلبات إضافية", value: r.other_requirements },
        { label: "ملاحظات", value: r.notes },
      ],
    },
    {
      title: "التواريخ",
      items: [
        { label: "تاريخ الطلب", value: formatDateTime(r.created_at) },
        { label: "آخر تحديث", value: formatDateTime(r.updated_at) },
        {
          label: "تاريخ الأرشفة",
          value: r.archived_at ? formatDateTime(r.archived_at) : null,
        },
      ],
    },
  ];
});

const fullMatches = computed(
  () => matches.value.filter((match) => match.required_met).length,
);

// ─── تغيير الحالة بلا فتح النموذج: الطلب كما هو بحالة أخرى ─────────────────
async function setStatus(status: string) {
  const r = record.value;
  if (!r || r.status === status) return;
  const payload = { ...requestPayload(requestToForm(r), props.mode), status };
  try {
    record.value =
      props.mode === "rental"
        ? await requests.updateRentalRequest(r.id, payload)
        : await requests.updatePurchaseRequest(r.id, payload);
    notifySuccess(
      `حالة ${label.value} ${r.code}: ${requestStatusLabel(status)}.`,
    );
  } catch (cause) {
    notifyError(getErrorMessage(cause));
  }
}
function askArchive() {
  const r = record.value;
  if (!r) return;
  openConfirm({
    title: `أرشفة ${r.code}`,
    body: "سيبقى الطلب محفوظاً، لكنه يخرج من القائمة ومن المطابقة. تجده بتصفية الحالة «مؤرشف».",
    confirmText: "أرشفة",
    color: "warning",
    onConfirm: () => setStatus("archived"),
  });
}

function openMatch(match: MatchResult) {
  const id = Number((match.record as { id?: number }).id);
  if (!id) return;
  void router.push(
    props.mode === "rental" ? `/rentals/${id}` : `/properties/${id}`,
  );
}
function onSaved(saved: RequestRecord) {
  record.value = saved;
  void loadMatches(saved.id);
  notifySuccess(`تم حفظ ${label.value} ${saved.code}.`);
}
</script>

<template>
  <AppPage
    :title="title"
    :parent="{ to: requestListPath(mode), label: listLabel }"
  >
    <template v-if="record" #status>
      <v-chip
        size="small"
        variant="tonal"
        label
        :color="requestStatusColor(record.status)"
        >{{ requestStatusLabel(record.status) }}</v-chip
      >
    </template>
    <template v-if="record" #header-actions>
      <v-btn
        v-if="can('requests.update')"
        color="primary"
        prepend-icon="mdi-pencil-outline"
        @click="editOpen = true"
        >تعديل</v-btn
      >
      <v-btn
        v-if="can('people.read')"
        variant="text"
        prepend-icon="mdi-account-outline"
        :to="`/clients/${record.person_id}`"
        >ملف الزبون</v-btn
      >
      <v-menu v-if="can('requests.update')" location="bottom end">
        <template #activator="{ props: menu }">
          <v-btn
            v-bind="menu"
            icon="mdi-dots-horizontal"
            variant="text"
            aria-label="أوامر أخرى للطلب"
            title="أوامر أخرى"
          />
        </template>
        <v-list density="compact" min-width="220">
          <v-list-subheader>تغيير الحالة</v-list-subheader>
          <v-list-item
            v-for="status in REQUEST_STATUSES"
            :key="status.value"
            :title="status.title"
            :active="record.status === status.value"
            :prepend-icon="
              record.status === status.value ? 'mdi-check' : 'mdi-circle-small'
            "
            @click="setStatus(status.value)"
          />
          <v-divider />
          <v-list-item
            v-if="record.status !== 'archived'"
            prepend-icon="mdi-archive-arrow-down-outline"
            title="أرشفة"
            @click="askArchive"
          />
        </v-list>
      </v-menu>
    </template>

    <v-skeleton-loader
      v-if="loading && !record"
      type="table-heading, list-item@4"
    />
    <v-alert v-else-if="error" type="error" variant="tonal"
      >{{ error
      }}<template #append
        ><v-btn variant="text" @click="load">إعادة المحاولة</v-btn></template
      ></v-alert
    >
    <template v-else-if="record">
      <RecordFacts :facts="facts" :label="`ملخّص ${label}`">
        <template #person>
          <router-link
            v-if="can('people.read')"
            :to="`/clients/${record.person_id}`"
            class="record-link"
            >{{ customerName }}</router-link
          >
          <span v-else>{{ customerName }}</span>
          <PhoneLink
            v-if="person?.phone_primary"
            :phone="person.phone_primary"
            :name="customerName"
          />
        </template>
      </RecordFacts>

      <div class="request-record">
        <section class="dal-panel" aria-labelledby="request-matches-title">
          <div class="dal-panel__header">
            <h2 id="request-matches-title" class="dal-section-title">
              العروض المطابقة
            </h2>
            <span
              v-if="!matchesLoading && !matchesError"
              class="dal-count"
              :aria-label="`مطابقة كاملة: ${fullMatches} من ${matches.length}`"
              >{{ fullMatches }} / {{ matches.length }}</span
            >
            <v-spacer />
            <v-btn
              size="small"
              variant="text"
              prepend-icon="mdi-refresh"
              :loading="matchesLoading"
              @click="loadMatches(record.id)"
              >إعادة المطابقة</v-btn
            >
          </div>
          <div class="request-record__body">
            <v-alert
              v-if="matchesError"
              type="error"
              variant="tonal"
              density="compact"
              >تعذر تحميل المطابقات: {{ matchesError
              }}<template #append
                ><v-btn
                  variant="text"
                  size="small"
                  @click="loadMatches(record.id)"
                  >إعادة المحاولة</v-btn
                ></template
              ></v-alert
            >
            <v-skeleton-loader
              v-else-if="matchesLoading && !matches.length"
              type="list-item-three-line@3"
            />
            <MatchList
              v-else
              :matches="matches"
              :empty-text="
                record.status === 'open'
                  ? 'لا يوجد عرض متاح يحقق الشروط الأساسية الآن. راجع الشروط أو ابحث عن عرض جديد.'
                  : 'المطابقة تشمل الطلبات المفتوحة. أعد فتح الطلب ليُطابَق.'
              "
              @open="openMatch"
            />
          </div>
        </section>

        <aside class="dal-panel" aria-labelledby="request-details-title">
          <div class="dal-panel__header">
            <h2 id="request-details-title" class="dal-section-title">
              تفاصيل الطلب
            </h2>
          </div>
          <div class="request-record__body">
            <DetailList :sections="sections" />
          </div>
        </aside>
      </div>
    </template>

    <RequestFormDialog
      v-model="editOpen"
      :mode="mode"
      :request="record"
      @saved="onSaved"
    />
  </AppPage>
</template>

<style scoped>
.request-record {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(280px, 380px);
  gap: var(--dal-gutter);
  align-items: start;
  margin-top: var(--dal-gutter);
}
.request-record__body {
  padding: 8px 16px 16px;
}
@media (max-width: 1100px) {
  .request-record {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
