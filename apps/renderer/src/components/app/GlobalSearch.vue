<script setup lang="ts">
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  watch,
} from "vue";
import { useRouter, type RouteLocationRaw } from "vue-router";
import * as propertiesService from "../../services/properties.service";
import * as rentalsService from "../../services/rentals.service";
import * as peopleService from "../../services/people.service";
import * as requestsService from "../../services/requests.service";
import { getErrorMessage } from "../../services/api.service";
import { usePermissions } from "../../composables/usePermissions";
import { useProperties } from "../../composables/useProperties";
import {
  PROPERTY_SORT_OPTIONS,
  RENTAL_SORT_OPTIONS,
  RENT_PERIOD_LABELS,
  RENTAL_PROPERTY_LABELS,
  statusLabel,
} from "../../constants/domain";
import {
  PEOPLE_DEFAULT_SORT,
  REQUESTS_DEFAULT_SORT,
} from "../../constants/crm";
import { formatMoney, formatPlot } from "../../utils/format";
import type { ListSortOption } from "../../types";

/**
 * بحث شامل (Ctrl+K): عروض البيع والإيجار والزبائن والطلبات معاً، عبر صفحات
 * القوائم الموجودة في الخادم (أول 5 من كل نوع). Enter يفتح السجل، و«عرض كل
 * النتائج» يفتح قائمة عروض البيع على البحث نفسه.
 */
type GroupKey = "sale" | "rental" | "people" | "purchase" | "rentalRequest";
type Result = {
  key: string;
  group: GroupKey;
  title: string;
  meta: string[];
  to: RouteLocationRaw;
};

const GROUPS: Array<{ key: GroupKey; title: string; permission: string }> = [
  { key: "sale", title: "عروض البيع", permission: "properties.read" },
  { key: "rental", title: "عروض الإيجار", permission: "rentals.read" },
  { key: "people", title: "الزبائن", permission: "people.read" },
  { key: "purchase", title: "طلبات الشراء", permission: "requests.read" },
  { key: "rentalRequest", title: "طلبات الإيجار", permission: "requests.read" },
];
const PER_GROUP = 5;
const MIN_QUERY = 2;

const router = useRouter();
const { can } = usePermissions();
const { filters, startFromFirstPage } = useProperties();

const open = ref(false);
const query = ref("");
const results = ref<Result[]>([]);
const loading = ref(false);
const failed = ref<string | null>(null);
const active = ref(0);
const searched = ref("");
const inputRef = ref<{ focus: () => void } | null>(null);

const groups = computed(() => GROUPS.filter((group) => can(group.permission)));
const grouped = computed(() =>
  groups.value
    .map((group) => ({
      ...group,
      items: results.value.filter((item) => item.group === group.key),
    }))
    .filter((group) => group.items.length),
);
const activeResult = computed(() => results.value[active.value] ?? null);
const optionId = (index: number) => `dal-search-option-${index}`;

function firstPage<K extends string>(sort: ListSortOption<K>) {
  return {
    page: 1,
    page_size: PER_GROUP,
    sort_by: sort.key,
    sort_order: sort.order,
  };
}
// أنواع الإيجار مفاتيح (apartment)، وأنواع البيع نصوص عربية محفوظة كما هي.
const rentalType = (value: string) => RENTAL_PROPERTY_LABELS[value] ?? value;
const place = (...parts: Array<string | null | undefined>) =>
  parts.filter(Boolean).join(" · ");

async function searchGroup(
  key: GroupKey,
  q: string,
  signal: AbortSignal,
): Promise<Result[]> {
  if (key === "sale") {
    const page = await propertiesService.listPropertiesPage(
      { q },
      firstPage(PROPERTY_SORT_OPTIONS[0]!),
      signal,
    );
    return page.items.map((item) => ({
      key: `sale:${item.id}`,
      group: key,
      title: item.name || `عقار ${item.code}`,
      meta: [
        item.code,
        formatPlot(item.plot_number, item.plot_letter)
          ? `قطعة ${formatPlot(item.plot_number, item.plot_letter)}`
          : "",
        place(item.district, item.neighborhood),
        `${formatMoney(item.total_price)} د.ع`,
        statusLabel(item.status),
      ].filter(Boolean),
      to: `/properties/${item.id}`,
    }));
  }
  if (key === "rental") {
    const page = await rentalsService.listRentalsPage(
      { q },
      firstPage(RENTAL_SORT_OPTIONS[0]!),
      signal,
    );
    return page.items.map((item) => ({
      key: `rental:${item.id}`,
      group: key,
      title: item.name || `إيجار ${item.code}`,
      meta: [
        item.code,
        rentalType(item.property_type),
        place(item.district, item.neighborhood),
        `${formatMoney(item.rent_price)} د.ع / ${RENT_PERIOD_LABELS[item.rent_period] ?? item.rent_period}`,
      ].filter(Boolean),
      to: { path: "/rentals", query: { open: String(item.id) } },
    }));
  }
  if (key === "people") {
    const page = await peopleService.listPeoplePage(
      { q },
      firstPage(PEOPLE_DEFAULT_SORT),
      signal,
    );
    return page.items.map((item) => ({
      key: `people:${item.id}`,
      group: key,
      title: item.full_name,
      meta: [item.code, item.phone_primary ?? ""].filter(Boolean),
      to: `/clients/${item.id}`,
    }));
  }
  const rental = key === "rentalRequest";
  const page = rental
    ? await requestsService.listRentalRequestsPage(
        { q },
        firstPage(REQUESTS_DEFAULT_SORT),
        signal,
      )
    : await requestsService.listPurchaseRequestsPage(
        { q },
        firstPage(REQUESTS_DEFAULT_SORT),
        signal,
      );
  return page.items.map((item) => ({
    key: `${key}:${item.id}`,
    group: key,
    title: [item.code, item.person_name].filter(Boolean).join(" · "),
    meta: [
      rental ? rentalType(item.property_type) : item.property_type,
      place(item.governorate, item.district, item.neighborhood),
    ].filter(Boolean),
    to: {
      path: rental ? "/rental-requests" : "/purchase-requests",
      query: { open: String(item.id) },
    },
  }));
}

let controller: AbortController | null = null;
let timer: ReturnType<typeof setTimeout> | undefined;

async function runSearch(q: string) {
  controller?.abort();
  const current = new AbortController();
  controller = current;
  loading.value = true;
  failed.value = null;
  const settled = await Promise.allSettled(
    groups.value.map((group) => searchGroup(group.key, q, current.signal)),
  );
  if (current.signal.aborted) return;
  results.value = settled.flatMap((item) =>
    item.status === "fulfilled" ? item.value : [],
  );
  const rejected = settled.find((item) => item.status === "rejected");
  // نتائج الأنواع التي نجحت تُعرض؛ الفشل يُذكر بدل أن يبدو «لا نتائج».
  failed.value =
    rejected && rejected.status === "rejected"
      ? getErrorMessage(rejected.reason)
      : null;
  searched.value = q;
  active.value = 0;
  loading.value = false;
}

watch(query, (value) => {
  clearTimeout(timer);
  const q = value.trim();
  if (q.length < MIN_QUERY) {
    controller?.abort();
    results.value = [];
    searched.value = "";
    loading.value = false;
    failed.value = null;
    return;
  }
  timer = setTimeout(() => void runSearch(q), 250);
});

function show() {
  open.value = true;
  void nextTick(() => inputRef.value?.focus());
}

function go(result: Result | null) {
  if (!result) return;
  open.value = false;
  void router.push(result.to);
}

function showAllSales() {
  filters.value.q = query.value.trim();
  startFromFirstPage();
  open.value = false;
  void router.push("/properties");
}

function onInputKeydown(event: KeyboardEvent) {
  const count = results.value.length;
  if (event.key === "ArrowDown" && count) {
    event.preventDefault();
    active.value = (active.value + 1) % count;
  } else if (event.key === "ArrowUp" && count) {
    event.preventDefault();
    active.value = (active.value - 1 + count) % count;
  } else if (event.key === "Enter") {
    event.preventDefault();
    go(activeResult.value);
  }
}

// الخيار النشط يبقى ظاهراً عند التنقّل بالأسهم في قائمة طويلة.
watch(active, (index) => {
  void nextTick(() =>
    document
      .getElementById(optionId(index))
      ?.scrollIntoView({ block: "nearest" }),
  );
});

// Ctrl+K من أي مكان. KeyK رمز المفتاح لا الحرف، فيعمل مع لوحة المفاتيح
// العربية أيضاً؛ ولا يُعترض داخل حوار آخر مفتوح.
function onShortcut(event: KeyboardEvent) {
  if (!(event.ctrlKey || event.metaKey) || event.code !== "KeyK") return;
  if (event.altKey || event.shiftKey) return;
  if (!open.value && document.querySelector(".v-overlay--active .v-dialog"))
    return;
  event.preventDefault();
  show();
}
onMounted(() => window.addEventListener("keydown", onShortcut));
onBeforeUnmount(() => {
  window.removeEventListener("keydown", onShortcut);
  clearTimeout(timer);
  controller?.abort();
});
</script>

<template>
  <button
    type="button"
    class="dal-omnibox"
    aria-label="بحث شامل في العروض والزبائن والطلبات"
    aria-keyshortcuts="Control+K"
    aria-haspopup="dialog"
    @click="show"
  >
    <v-icon icon="mdi-magnify" size="18" aria-hidden="true" />
    <span class="dal-omnibox__label">بحث شامل…</span>
    <kbd class="dal-omnibox__kbd">Ctrl+K</kbd>
  </button>

  <v-dialog
    v-model="open"
    max-width="680"
    content-class="dal-palette"
    aria-label="بحث شامل"
  >
    <div class="dal-palette__card">
      <v-text-field
        ref="inputRef"
        v-model="query"
        class="dal-palette__input"
        prepend-inner-icon="mdi-magnify"
        placeholder="اسم، رمز، رقم قطعة، أو هاتف"
        aria-label="بحث شامل"
        role="combobox"
        aria-autocomplete="list"
        aria-controls="dal-search-results"
        :aria-expanded="results.length > 0"
        :aria-activedescendant="activeResult ? optionId(active) : undefined"
        hide-details
        clearable
        autofocus
        :loading="loading"
        @keydown="onInputKeydown"
      />

      <div
        id="dal-search-results"
        class="dal-palette__results"
        role="listbox"
        aria-label="نتائج البحث"
      >
        <p v-if="query.trim().length < MIN_QUERY" class="dal-palette__hint">
          اكتب حرفين على الأقل. يبحث في
          {{ groups.map((group) => group.title).join("، ") }}.
        </p>
        <p
          v-else-if="failed && !results.length"
          class="dal-palette__hint"
          role="alert"
        >
          تعذر البحث الآن: {{ failed }}
        </p>
        <p
          v-else-if="searched && !loading && !results.length"
          class="dal-palette__hint"
        >
          لا نتائج لـ «{{ searched }}».
        </p>
        <template v-for="group in grouped" :key="group.key">
          <div class="dal-palette__group" role="presentation">
            {{ group.title }}
          </div>
          <div
            v-for="item in group.items"
            :id="optionId(results.indexOf(item))"
            :key="item.key"
            role="option"
            class="dal-palette__option"
            :class="{
              'dal-palette__option--active': activeResult?.key === item.key,
            }"
            :aria-selected="activeResult?.key === item.key"
            @click="go(item)"
            @mousemove="active = results.indexOf(item)"
          >
            <span class="dal-palette__title">{{ item.title }}</span>
            <span class="dal-palette__meta">
              <span
                v-for="part in item.meta"
                :key="part"
                dir="auto"
                class="dal-palette__part"
                >{{ part }}</span
              >
            </span>
          </div>
        </template>
        <p
          v-if="failed && results.length"
          class="dal-palette__hint"
          role="status"
        >
          بعض الأنواع لم تُبحث: {{ failed }}
        </p>
      </div>

      <div class="dal-palette__footer">
        <span class="dal-palette__keys"
          ><kbd>↑</kbd><kbd>↓</kbd> للتنقّل · <kbd>Enter</kbd> للفتح ·
          <kbd>Esc</kbd> للإغلاق</span
        >
        <v-spacer />
        <v-btn
          v-if="can('properties.read') && query.trim().length >= MIN_QUERY"
          variant="text"
          size="small"
          @click="showAllSales"
          >كل نتائج عروض البيع</v-btn
        >
      </div>
    </div>
  </v-dialog>
</template>

<style scoped>
.dal-omnibox {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 260px;
  height: 32px;
  padding-inline: 10px 6px;
  border: 1px solid var(--dal-stroke);
  border-radius: var(--dal-radius-control);
  background: var(--dal-surface);
  color: var(--dal-muted);
  font: inherit;
  font-size: calc(13px * var(--dal-font-scale));
  cursor: pointer;
}
.dal-omnibox:hover {
  border-color: rgba(var(--v-theme-on-surface), 0.5);
}
.dal-omnibox__label {
  flex: 1 1 auto;
  text-align: start;
}
.dal-omnibox__kbd,
.dal-palette__keys kbd {
  padding: 0 5px;
  border: 1px solid var(--dal-stroke);
  border-radius: var(--dal-radius-control);
  font-family: inherit;
  font-size: calc(12px * var(--dal-font-scale));
  direction: ltr;
  unicode-bidi: isolate;
}
@media (max-width: 1279px) {
  .dal-omnibox {
    width: 32px;
    padding: 0;
    justify-content: center;
  }
  .dal-omnibox__label,
  .dal-omnibox__kbd {
    display: none;
  }
}
:global(.dal-palette) {
  align-self: flex-start;
  margin-top: 10vh;
}
.dal-palette__card {
  display: flex;
  flex-direction: column;
  max-height: 70vh;
  background: rgb(var(--v-theme-surface));
  border: 1px solid var(--dal-stroke);
  border-radius: var(--dal-radius-card);
  box-shadow: var(--dal-shadow-pop);
  overflow: hidden;
}
.dal-palette__input {
  padding: 8px;
  flex: 0 0 auto;
}
.dal-palette__results {
  flex: 1 1 auto;
  overflow: auto;
  padding: 4px 0;
  border-block: 1px solid var(--dal-stroke);
}
.dal-palette__hint {
  margin: 0;
  padding: 12px 16px;
  color: var(--dal-muted);
  font-size: calc(13px * var(--dal-font-scale));
}
.dal-palette__group {
  padding: 8px 16px 4px;
  color: var(--dal-muted);
  font-size: calc(12px * var(--dal-font-scale));
  font-weight: 700;
}
.dal-palette__option {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 6px 16px;
  cursor: pointer;
}
.dal-palette__option--active {
  background: var(--dal-selection);
  box-shadow: inset 2px 0 0 rgb(var(--v-theme-primary));
}
.dal-palette__title {
  font-weight: 600;
  font-size: calc(13px * var(--dal-font-scale));
}
.dal-palette__meta {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 12px;
  color: var(--dal-muted);
  font-size: calc(12px * var(--dal-font-scale));
}
.dal-palette__part {
  unicode-bidi: isolate;
}
.dal-palette__footer {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 40px;
  padding: 4px 12px;
  color: var(--dal-muted);
  font-size: calc(12px * var(--dal-font-scale));
}
</style>
