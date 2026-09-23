<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import AppLayout from "../layouts/AppLayout.vue";
import StatusChip from "../components/shared/StatusChip.vue";
import EmptyState from "../components/shared/EmptyState.vue";
import RankedBarList from "../components/shared/RankedBarList.vue";
import { fetchDashboard } from "../services/dashboard.service";
import { createBackup } from "../services/backup.service";
import { getErrorMessage } from "../services/api.service";
import { usePermissions } from "../composables/usePermissions";
import { useProperties } from "../composables/useProperties";
import { useSnackbar } from "../composables/useSnackbar";
import { useRefresh } from "../composables/useRefresh";
import { formatMoney, formatNumber, pluralizeDays } from "../utils/format";
import type { DashboardSummary } from "../types";

const router = useRouter();
const { can } = usePermissions();
const { notifySuccess, notifyError } = useSnackbar();
const { setRefreshHandler } = useRefresh();
const { filters, loadProperties } = useProperties();

const REVIEW_LIMIT = 8;
const EMPTY_RENTALS: DashboardSummary["rentals"] = {
  counts: {
    total: 0,
    active: 0,
    available: 0,
    reserved: 0,
    negotiating: 0,
    rented: 0,
    archived: 0,
  },
  financial: {
    monthly_value: 0,
    avg_monthly_price: 0,
    available_monthly_value: 0,
    rented_monthly_value: 0,
  },
  by_type: [],
  monthly_activity: [],
};
const EMPTY_SALES: DashboardSummary["sales"] = {
  by_type: [],
  monthly_activity: [],
};

function openProperty(code?: string | null) {
  filters.value.q = code ?? "";
  void router.push("/properties").then(() => loadProperties());
}

const discoverQuery = ref("");
function searchProperties() {
  filters.value.q = discoverQuery.value.trim();
  void router.push("/properties").then(() => loadProperties());
}
function goAvailable() {
  filters.value.status = "available";
  filters.value.q = "";
  void router.push("/properties").then(() => loadProperties());
}

const todayLabel = computed(() =>
  new Date().toLocaleDateString("ar-IQ", {
    numberingSystem: "latn",
    weekday: "long",
    day: "2-digit",
    month: "long",
  }),
);

const data = ref<DashboardSummary | null>(null);
const loading = ref(false);
const loadError = ref<string | null>(null);
const lastLoadedAt = ref<Date | null>(null);
const backupRunning = ref(false);

const statusCards = [
  { key: "total", label: "إجمالي العروض", icon: "mdi-home-city-outline" },
  { key: "available", label: "متاح", icon: "mdi-check-circle-outline" },
  { key: "reserved", label: "محجوز", icon: "mdi-bookmark-outline" },
  { key: "sold", label: "مباع", icon: "mdi-cash-check" },
  { key: "rented", label: "مؤجر", icon: "mdi-key-outline" },
] as const;

const rentalStatusCards = [
  { key: "available", label: "متاح", tone: "available" },
  { key: "reserved", label: "محجوز", tone: "reserved" },
  { key: "negotiating", label: "تفاوض", tone: "negotiating" },
  { key: "rented", label: "مؤجر", tone: "rented" },
] as const;

const salesStatusCards = [
  { key: "available", label: "متاح", tone: "available" },
  { key: "reserved", label: "محجوز", tone: "reserved" },
  { key: "negotiating", label: "تفاوض", tone: "negotiating" },
  { key: "sold", label: "مباع", tone: "sold" },
] as const;

const rentalTypeLabels: Record<string, string> = {
  house: "دار",
  apartment: "شقة",
  shop: "محل",
  warehouse: "مخزن",
  other: "أخرى",
};

const loadedSubtitle = computed(() => {
  if (loading.value) return "جارٍ تحديث مؤشرات المكتب…";
  if (!lastLoadedAt.value) return "قراءة تشغيلية مختصرة للمكتب.";
  const time = lastLoadedAt.value.toLocaleTimeString("ar-IQ", {
    numberingSystem: "latn",
    hour: "2-digit",
    minute: "2-digit",
  });
  return `آخر تحديث ${time}`;
});

const ACTION_LABELS: Record<string, string> = {
  created: "إنشاء",
  updated: "تعديل",
  price_changed: "تغيير سعر",
  status_changed: "تغيير حالة",
  archived: "أرشفة",
  restored: "إرجاع",
  deleted: "حذف",
  image_added: "إضافة صورة",
  image_removed: "حذف صورة",
};

const ACTION_ICONS: Record<string, string> = {
  created: "mdi-plus-circle-outline",
  updated: "mdi-pencil-outline",
  price_changed: "mdi-cash-edit",
  status_changed: "mdi-swap-horizontal",
  archived: "mdi-archive-outline",
  restored: "mdi-restore-alert",
  deleted: "mdi-trash-can-outline",
  image_added: "mdi-image-plus-outline",
  image_removed: "mdi-image-remove-outline",
};

function actionLabel(action: string) {
  return ACTION_LABELS[action] ?? "تغيير";
}
function actionIcon(action: string) {
  return ACTION_ICONS[action] ?? "mdi-history";
}

async function load() {
  loading.value = true;
  try {
    const dashboard = await fetchDashboard();
    // Keep the page compatible with an already-running older local API during updates.
    data.value = {
      ...dashboard,
      sales: dashboard.sales ?? EMPTY_SALES,
      rentals: dashboard.rentals ?? EMPTY_RENTALS,
    };
    lastLoadedAt.value = new Date();
    loadError.value = null;
    console.info("[Dalaly][Dashboard] summary loaded", {
      properties: dashboard.counts.total,
      rentals: dashboard.rentals?.counts.total ?? 0,
      reminders: dashboard.reminders.length,
    });
  } catch (error) {
    const message = getErrorMessage(error);
    loadError.value = message;
    console.error("[Dalaly][Dashboard] summary load failed", {
      message,
      error,
    });
    notifyError(message);
  } finally {
    loading.value = false;
  }
}

async function runBackup() {
  backupRunning.value = true;
  try {
    await createBackup();
    notifySuccess("تم إنشاء نسخة احتياطية.");
  } catch (error) {
    notifyError(getErrorMessage(error));
  } finally {
    backupRunning.value = false;
  }
}

function when(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("ar-IQ", { numberingSystem: "latn" });
}
function daysSince(value: string) {
  const time = new Date(value).getTime();
  if (Number.isNaN(time)) return 0;
  return Math.max(0, Math.floor((Date.now() - time) / 86400000));
}
function isOverdue(value: string) {
  const time = new Date(value).getTime();
  return !Number.isNaN(time) && time < Date.now();
}

const sortedReminders = computed(() => {
  const list = data.value?.reminders ?? [];
  return [...list].sort((a, b) => {
    const ta = new Date(a.scheduled_at).getTime();
    const tb = new Date(b.scheduled_at).getTime();
    return (
      (Number.isNaN(ta) ? Infinity : ta) - (Number.isNaN(tb) ? Infinity : tb)
    );
  });
});

const overdueCount = computed(
  () =>
    (data.value?.reminders ?? []).filter((reminder) =>
      isOverdue(reminder.scheduled_at),
    ).length,
);

function monthKey(date: Date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

const rentalTrend = computed(() => {
  const rows = new Map(
    (data.value?.rentals.monthly_activity ?? []).map((row) => [
      row.month,
      row.created,
    ]),
  );
  const now = new Date();
  const points = Array.from({ length: 6 }, (_, index) => {
    const date = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (5 - index), 1),
    );
    const key = monthKey(date);
    return {
      month: key,
      label: date.toLocaleDateString("ar-IQ", {
        month: "short",
        timeZone: "UTC",
      }),
      created: rows.get(key) ?? 0,
    };
  });
  const max = Math.max(1, ...points.map((point) => point.created));
  const plotted = points.map((point, index) => ({
    ...point,
    x: 24 + index * 94.4,
    y: 142 - (point.created / max) * 108,
  }));
  return {
    points: plotted,
    path: plotted
      .map((point, index) => `${index ? "L" : "M"} ${point.x} ${point.y}`)
      .join(" "),
    max,
    hasData: points.some((point) => point.created > 0),
  };
});

const salesTrend = computed(() => {
  const rows = new Map(
    (data.value?.sales.monthly_activity ?? []).map((row) => [
      row.month,
      row.created,
    ]),
  );
  const now = new Date();
  const points = Array.from({ length: 6 }, (_, index) => {
    const date = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (5 - index), 1),
    );
    const key = monthKey(date);
    return {
      month: key,
      label: date.toLocaleDateString("ar-IQ", {
        month: "short",
        timeZone: "UTC",
      }),
      created: rows.get(key) || 0,
    };
  });
  const max = Math.max(1, ...points.map((point) => point.created));
  const plotted = points.map((point, index) => ({
    ...point,
    x: 24 + index * 94.4,
    y: 142 - (point.created / max) * 108,
  }));
  return {
    points: plotted,
    path: plotted
      .map((point, index) => {
        const command = index ? "L " : "M ";
        return command + point.x + " " + point.y;
      })
      .join(" "),
    hasData: points.some((point) => point.created > 0),
  };
});

function rentalTypeLabel(name: string) {
  return rentalTypeLabels[name] ?? name;
}
function typeBarWidth(count: number) {
  const max = Math.max(
    1,
    ...(data.value?.rentals.by_type ?? []).map((item) => item.count),
  );
  return Math.max(8, Math.round((count / max) * 100));
}
function salesTypeBarWidth(count: number) {
  const max = Math.max(
    1,
    ...(data.value?.sales.by_type ?? []).map((item) => item.count),
  );
  return Math.max(8, Math.round((count / max) * 100));
}

function statusPercent(key: keyof DashboardSummary["rentals"]["counts"]) {
  const active = data.value?.rentals.counts.active ?? 0;
  return active
    ? Math.round(((data.value?.rentals.counts[key] ?? 0) / active) * 100)
    : 0;
}

function salesStatusPercent(
  key: "available" | "reserved" | "negotiating" | "sold",
) {
  const active =
    (data.value?.counts.total ?? 0) - (data.value?.counts.archived ?? 0);
  return active
    ? Math.round(((data.value?.counts[key] ?? 0) / active) * 100)
    : 0;
}

onMounted(() => {
  setRefreshHandler(load);
  void load();
});
</script>

<template>
  <AppLayout title="لوحة التحكم" :subtitle="loadedSubtitle">
    <template #header-actions>
      <v-btn
        v-if="can('properties.create')"
        color="primary"
        prepend-icon="mdi-plus"
        @click="router.push('/properties/new')"
      >
        إضافة عرض
      </v-btn>
      <v-btn
        v-if="can('locations.manage')"
        variant="text"
        prepend-icon="mdi-map-marker-plus"
        @click="router.push('/locations')"
      >
        المحافظات
      </v-btn>
      <v-btn
        v-if="can('backups.create')"
        variant="text"
        prepend-icon="mdi-database-export"
        :loading="backupRunning"
        @click="runBackup"
      >
        نسخة احتياطية
      </v-btn>
      <v-btn
        v-if="can('users.create')"
        variant="text"
        prepend-icon="mdi-account-plus"
        @click="router.push('/users')"
      >
        مستخدم
      </v-btn>
    </template>

    <v-card
      v-if="loadError && !data"
      variant="flat"
      border
      class="dashboard-state pa-6 text-center"
    >
      <v-icon
        icon="mdi-lan-disconnect"
        size="40"
        class="text-medium-emphasis"
      />
      <div class="text-h6 mt-3">تعذّر تحميل لوحة التحكم</div>
      <div class="text-body-2 text-medium-emphasis mt-1">{{ loadError }}</div>
      <div class="text-body-2 text-medium-emphasis mt-1">
        تأكد من تشغيل قاعدة البيانات ثم أعد المحاولة.
      </div>
      <v-btn
        color="primary"
        class="mt-4"
        prepend-icon="mdi-refresh"
        :loading="loading"
        @click="load"
      >
        إعادة المحاولة
      </v-btn>
    </v-card>

    <template v-else-if="loading && !data">
      <div class="dashboard-loading">
        <v-skeleton-loader type="list-item-two-line" />
        <v-skeleton-loader type="list-item-two-line" />
        <v-skeleton-loader type="image" class="dashboard-loading__chart" />
        <v-skeleton-loader type="list-item-two-line, list-item, list-item" />
      </div>
    </template>

    <template v-else-if="data">
      <v-alert
        v-if="loadError"
        type="warning"
        variant="tonal"
        class="mb-3"
        role="status"
      >
        تعذّر تحديث البيانات؛ المعروض هو آخر تحميل ناجح.
        <template #append>
          <v-btn variant="text" :loading="loading" @click="load"
            >إعادة المحاولة</v-btn
          >
        </template>
      </v-alert>

      <section
        class="dashboard-intro mb-3"
        aria-labelledby="dashboard-brief-title"
      >
        <div>
          <div class="dashboard-intro__eyebrow">ملخص المكتب</div>
          <h1 id="dashboard-brief-title">العروض والمتابعات</h1>
          <p>العروض والإيجارات والمتابعات الحالية.</p>
        </div>
        <div class="dashboard-intro__date">
          <v-icon icon="mdi-calendar-today" size="18" />
          <span>{{ todayLabel }}</span>
        </div>
      </section>

      <section
        class="dal-panel dal-attention mb-3"
        :class="{ 'dal-attention--urgent': overdueCount }"
      >
        <div class="dal-panel__header">
          <v-icon
            :icon="
              overdueCount
                ? 'mdi-alert-decagram-outline'
                : 'mdi-bell-check-outline'
            "
            size="18"
            :color="overdueCount ? 'error' : undefined"
          />
          <span class="dal-section-title">ما يحتاج انتباهك</span>
          <v-chip
            v-if="overdueCount"
            size="x-small"
            color="error"
            variant="tonal"
            label
          >
            <span class="money">{{ overdueCount }}</span> متأخرة
          </v-chip>
          <v-spacer />
          <span class="dal-summary__label">متابعة اليوم</span>
        </div>
        <div class="dal-panel__body">
          <EmptyState
            v-if="!sortedReminders.length"
            class="dal-empty"
            icon="mdi-check-circle-outline"
            title="لا توجد متابعة مستحقة"
            text="أضف متابعة من صفحة أي عرض لتظهر هنا في موعدها."
          />
          <v-list v-else density="compact">
            <v-list-item
              v-for="reminder in sortedReminders.slice(0, 5)"
              :key="reminder.id"
              :title="`${reminder.property_code} — ${reminder.notes || 'متابعة'}`"
              :prepend-icon="
                isOverdue(reminder.scheduled_at)
                  ? 'mdi-bell-alert-outline'
                  : 'mdi-bell-ring-outline'
              "
              :base-color="
                isOverdue(reminder.scheduled_at) ? 'error' : undefined
              "
              @click="openProperty(reminder.property_code)"
            >
              <template #subtitle>
                <span
                  v-if="isOverdue(reminder.scheduled_at)"
                  class="text-error font-weight-bold"
                  >متأخر ·
                </span>
                <span class="money">{{ when(reminder.scheduled_at) }}</span>
              </template>
            </v-list-item>
          </v-list>
        </div>
      </section>

      <div class="dal-discover bg-surface pa-3 mb-3">
        <v-text-field
          v-model="discoverQuery"
          class="dal-discover__search"
          density="compact"
          hide-details
          clearable
          prepend-inner-icon="mdi-magnify"
          placeholder="ابحث بالكود، المالك، الهاتف أو المنطقة…"
          aria-label="بحث سريع في العروض"
          @keyup.enter="searchProperties"
        />
        <v-btn
          variant="tonal"
          prepend-icon="mdi-check-circle-outline"
          @click="goAvailable"
          >العروض المتاحة</v-btn
        >
        <v-btn
          variant="text"
          prepend-icon="mdi-format-list-bulleted"
          @click="router.push('/properties')"
          >كل العروض</v-btn
        >
      </div>

      <section class="portfolio-strip mb-3" aria-label="حالة العروض">
        <div
          v-for="card in statusCards"
          :key="card.key"
          class="portfolio-strip__item"
        >
          <v-icon :icon="card.icon" size="18" />
          <div>
            <div class="portfolio-strip__label">{{ card.label }}</div>
            <div class="portfolio-strip__value money">
              {{ formatNumber(data.counts[card.key], 0) }}
            </div>
          </div>
        </div>
        <div class="portfolio-strip__item portfolio-strip__item--value">
          <v-icon icon="mdi-cash-multiple" size="18" />
          <div>
            <div class="portfolio-strip__label">قيمة العروض النشطة</div>
            <div class="portfolio-strip__value money">
              {{ formatMoney(data.financial.total_value) }} د.ع
            </div>
          </div>
        </div>
      </section>

      <div class="dashboard-layout">
        <main class="dashboard-main">
          <div class="summary-boards mb-3">
            <section
              class="dal-panel rental-board"
              aria-labelledby="rental-summary-title"
            >
              <div class="dal-panel__header rental-board__header">
                <div>
                  <div class="dashboard-intro__eyebrow">الإيجارات</div>
                  <h2 id="rental-summary-title" class="dal-section-title">
                    ملخص الإيجارات
                  </h2>
                  <p class="panel-note">
                    القيم موحّدة إلى تقدير شهري للمقارنة بين الفترات.
                  </p>
                </div>
                <v-btn
                  size="small"
                  variant="text"
                  append-icon="mdi-arrow-left"
                  @click="router.push('/rentals')"
                  >إدارة الإيجارات</v-btn
                >
              </div>
              <div class="dal-panel__body">
                <div class="rental-kpis">
                  <div class="rental-kpi rental-kpi--accent">
                    <span class="rental-kpi__label">إيجارات نشطة</span>
                    <strong class="money">{{
                      formatNumber(data.rentals.counts.active, 0)
                    }}</strong>
                  </div>
                  <div class="rental-kpi">
                    <span class="rental-kpi__label">القيمة الشهرية</span>
                    <strong class="money">{{
                      formatMoney(data.rentals.financial.monthly_value)
                    }}</strong>
                  </div>
                  <div class="rental-kpi">
                    <span class="rental-kpi__label">متوسط الإيجار</span>
                    <strong class="money">{{
                      formatMoney(data.rentals.financial.avg_monthly_price)
                    }}</strong>
                  </div>
                  <div class="rental-kpi">
                    <span class="rental-kpi__label">المؤجر حالياً</span>
                    <strong class="money">{{
                      formatMoney(data.rentals.financial.rented_monthly_value)
                    }}</strong>
                  </div>
                </div>

                <div class="rental-chart-grid">
                  <div class="chart-panel">
                    <div class="chart-panel__heading">
                      <div>
                        <h3>تسجيل الإيجارات</h3>
                        <span>آخر 6 أشهر</span>
                      </div>
                      <span class="chart-key"
                        ><i class="chart-key__dot" /> سجل جديد</span
                      >
                    </div>
                    <div v-if="rentalTrend.hasData" class="trend-chart">
                      <svg
                        viewBox="0 0 520 170"
                        role="img"
                        aria-labelledby="trend-chart-title trend-chart-desc"
                      >
                        <title id="trend-chart-title">
                          تسجيل الإيجارات خلال آخر ستة أشهر
                        </title>
                        <desc id="trend-chart-desc">
                          خط يوضح عدد سجلات الإيجار الجديدة شهرياً.
                        </desc>
                        <line
                          v-for="y in [34, 88, 142]"
                          :key="y"
                          x1="24"
                          :y1="y"
                          x2="496"
                          :y2="y"
                          class="trend-chart__grid"
                        />
                        <path :d="rentalTrend.path" class="trend-chart__line" />
                        <g
                          v-for="point in rentalTrend.points"
                          :key="point.month"
                        >
                          <circle
                            :cx="point.x"
                            :cy="point.y"
                            r="5"
                            class="trend-chart__point"
                          >
                            <title>
                              {{ point.label }}: {{ point.created }} سجل
                            </title>
                          </circle>
                        </g>
                      </svg>
                      <div class="trend-chart__labels" aria-hidden="true">
                        <span
                          v-for="point in rentalTrend.points"
                          :key="point.month"
                        >
                          <b class="money">{{ point.created }}</b
                          ><small>{{ point.label }}</small>
                        </span>
                      </div>
                    </div>
                    <EmptyState
                      v-else
                      class="chart-empty"
                      icon="mdi-chart-line-variant"
                      title="لا توجد سجلات جديدة بعد"
                      text="ستظهر حركة التسجيل هنا مع إضافة الإيجارات."
                    />
                  </div>

                  <div class="chart-panel">
                    <div class="chart-panel__heading">
                      <div>
                        <h3>توزيع النوع</h3>
                        <span>الإيجارات النشطة</span>
                      </div>
                    </div>
                    <div v-if="data.rentals.by_type.length" class="type-bars">
                      <div
                        v-for="item in data.rentals.by_type"
                        :key="item.name"
                        class="type-bar"
                      >
                        <div class="type-bar__meta">
                          <span>{{ rentalTypeLabel(item.name) }}</span
                          ><b class="money">{{ item.count }}</b>
                        </div>
                        <div class="type-bar__track">
                          <span
                            :style="{
                              inlineSize: `${typeBarWidth(item.count)}%`,
                            }"
                          />
                        </div>
                      </div>
                    </div>
                    <EmptyState
                      v-else
                      class="chart-empty"
                      icon="mdi-home-search-outline"
                      title="لا توجد بيانات للتوزيع"
                      text="أضف أول عرض إيجاري لعرض المقارنة."
                    />
                  </div>
                </div>

                <div class="rental-status" aria-label="حالة الإيجارات">
                  <div class="rental-status__head">
                    <span>حالة الإيجارات النشطة</span
                    ><span class="money"
                      >{{
                        formatNumber(data.rentals.counts.active, 0)
                      }}
                      إجمالي</span
                    >
                  </div>
                  <div
                    class="rental-status__track"
                    role="img"
                    aria-label="نسب حالات الإيجارات النشطة"
                  >
                    <span
                      v-for="status in rentalStatusCards"
                      :key="status.key"
                      :class="`rental-status__segment rental-status__segment--${status.tone}`"
                      :style="{ inlineSize: `${statusPercent(status.key)}%` }"
                    />
                  </div>
                  <div class="rental-status__legend">
                    <span v-for="status in rentalStatusCards" :key="status.key"
                      ><i :class="`legend-dot legend-dot--${status.tone}`" />{{
                        status.label
                      }}
                      <b class="money">{{
                        data.rentals.counts[status.key]
                      }}</b></span
                    >
                  </div>
                </div>
              </div>
            </section>

            <section
              class="dal-panel rental-board"
              aria-labelledby="sales-summary-title"
            >
              <div class="dal-panel__header rental-board__header">
                <div>
                  <div class="dashboard-intro__eyebrow">عقارات للبيع</div>
                  <h2 id="sales-summary-title" class="dal-section-title">
                    ملخص البيع
                  </h2>
                  <p class="panel-note">
                    أسعار العروض الحالية بالدينار العراقي.
                  </p>
                </div>
                <v-btn
                  size="small"
                  variant="text"
                  append-icon="mdi-arrow-left"
                  @click="router.push('/properties')"
                  >إدارة العروض</v-btn
                >
              </div>
              <div class="dal-panel__body">
                <template v-if="data.counts.total - data.counts.archived > 0">
                  <div class="rental-kpis">
                    <div class="rental-kpi rental-kpi--accent">
                      <span class="rental-kpi__label">عروض نشطة</span>
                      <strong class="money">{{
                        formatNumber(
                          data.counts.total - data.counts.archived,
                          0,
                        )
                      }}</strong>
                    </div>
                    <div class="rental-kpi">
                      <span class="rental-kpi__label">متاح للبيع</span>
                      <strong class="money">{{
                        formatNumber(data.counts.available, 0)
                      }}</strong>
                    </div>
                    <div class="rental-kpi">
                      <span class="rental-kpi__label">مباع</span>
                      <strong class="money">{{
                        formatNumber(data.counts.sold, 0)
                      }}</strong>
                    </div>
                    <div class="rental-kpi">
                      <span class="rental-kpi__label">متوسط السعر</span>
                      <strong class="money">{{
                        formatMoney(data.financial.avg_price)
                      }}</strong>
                    </div>
                  </div>

                  <div class="rental-chart-grid">
                    <div class="chart-panel">
                      <div class="chart-panel__heading">
                        <div>
                          <h3>تسجيل عروض البيع</h3>
                          <span>آخر 6 أشهر</span>
                        </div>
                        <span class="chart-key"
                          ><i class="chart-key__dot chart-key__dot--sales" />عرض
                          جديد</span
                        >
                      </div>
                      <div
                        v-if="salesTrend.hasData"
                        class="trend-chart trend-chart--sales"
                      >
                        <svg
                          viewBox="0 0 520 170"
                          role="img"
                          aria-labelledby="sales-trend-title sales-trend-desc"
                        >
                          <title id="sales-trend-title">
                            تسجيل عروض البيع خلال آخر ستة أشهر
                          </title>
                          <desc id="sales-trend-desc">
                            عدد العروض العقارية الجديدة المسجلة شهرياً.
                          </desc>
                          <line
                            v-for="y in [34, 88, 142]"
                            :key="y"
                            x1="24"
                            :y1="y"
                            x2="496"
                            :y2="y"
                            class="trend-chart__grid"
                          />
                          <path
                            :d="salesTrend.path"
                            class="trend-chart__line trend-chart__line--sales"
                          />
                          <g
                            v-for="point in salesTrend.points"
                            :key="point.month"
                          >
                            <circle
                              :cx="point.x"
                              :cy="point.y"
                              r="5"
                              class="trend-chart__point trend-chart__point--sales"
                            >
                              <title>
                                {{ point.label }}: {{ point.created }} عرض
                              </title>
                            </circle>
                          </g>
                        </svg>
                        <div class="trend-chart__labels" aria-hidden="true">
                          <span
                            v-for="point in salesTrend.points"
                            :key="point.month"
                          >
                            <b class="money">{{ point.created }}</b
                            ><small>{{ point.label }}</small>
                          </span>
                        </div>
                      </div>
                      <EmptyState
                        v-else
                        class="chart-empty"
                        icon="mdi-chart-line-variant"
                        title="لا توجد عروض جديدة بعد"
                        text="ستظهر حركة تسجيل العروض هنا."
                      />
                    </div>

                    <div class="chart-panel">
                      <div class="chart-panel__heading">
                        <div>
                          <h3>توزيع نوع العقار</h3>
                          <span>العروض النشطة</span>
                        </div>
                      </div>
                      <div v-if="data.sales.by_type.length" class="type-bars">
                        <div
                          v-for="item in data.sales.by_type"
                          :key="item.name"
                          class="type-bar"
                        >
                          <div class="type-bar__meta">
                            <span>{{ rentalTypeLabel(item.name) }}</span
                            ><b class="money">{{ item.count }}</b>
                          </div>
                          <div class="type-bar__track">
                            <span
                              :style="{
                                inlineSize: `${salesTypeBarWidth(item.count)}%`,
                              }"
                            />
                          </div>
                        </div>
                      </div>
                      <EmptyState
                        v-else
                        class="chart-empty"
                        icon="mdi-home-search-outline"
                        title="لا توجد بيانات للتوزيع"
                        text="أضف عروضاً نشطة لعرض المقارنة."
                      />
                    </div>
                  </div>

                  <div
                    class="rental-status sales-status"
                    aria-label="حالة عروض البيع"
                  >
                    <div class="rental-status__head">
                      <span>حالة عروض البيع النشطة</span>
                      <span class="money"
                        >{{
                          formatNumber(
                            data.counts.total - data.counts.archived,
                            0,
                          )
                        }}
                        إجمالي</span
                      >
                    </div>
                    <div
                      class="rental-status__track"
                      role="img"
                      aria-label="نسب حالات عروض البيع النشطة"
                    >
                      <span
                        v-for="status in salesStatusCards"
                        :key="status.key"
                        :class="`rental-status__segment rental-status__segment--${status.tone}`"
                        :style="{
                          inlineSize: `${salesStatusPercent(status.key)}%`,
                        }"
                      />
                    </div>
                    <div class="rental-status__legend">
                      <span
                        v-for="status in salesStatusCards"
                        :key="status.key"
                      >
                        <i :class="`legend-dot legend-dot--${status.tone}`" />
                        {{ status.label }}
                        <b class="money">{{ data.counts[status.key] }}</b>
                      </span>
                    </div>
                  </div>
                </template>
                <EmptyState
                  v-else
                  class="sales-empty"
                  icon="mdi-home-off-outline"
                  title="لا توجد عروض بيع"
                  text="أضف أول عرض عقاري ليظهر ملخص البيع هنا."
                >
                  <template #actions>
                    <v-btn
                      color="primary"
                      prepend-icon="mdi-plus"
                      @click="router.push('/properties/new')"
                      >إضافة عرض</v-btn
                    >
                  </template>
                </EmptyState>
              </div>
            </section>
          </div>

          <div class="dashboard-columns">
            <section class="dal-panel">
              <div class="dal-panel__header">
                <span class="dal-section-title">آخر العروض</span
                ><v-spacer /><v-btn
                  size="x-small"
                  variant="text"
                  @click="router.push('/properties')"
                  >عرض الكل</v-btn
                >
              </div>
              <div class="dal-panel__body">
                <EmptyState
                  v-if="!data.latest.length"
                  class="dal-empty"
                  icon="mdi-home-plus-outline"
                  title="لا توجد عروض بعد"
                  text="أضف أول عرض ليظهر هنا."
                />
                <v-list v-else density="compact">
                  <v-list-item
                    v-for="property in data.latest.slice(0, 6)"
                    :key="property.id"
                    :title="`${property.code} — ${property.property_type}`"
                    @click="openProperty(property.code)"
                  >
                    <template #subtitle
                      >{{ property.governorate || "" }}
                      {{ property.district || "" }} ·
                      <span class="money">{{
                        formatMoney(property.total_price)
                      }}</span>
                      د.ع · أضيف
                      {{
                        pluralizeDays(daysSince(String(property.created_at)))
                      }}</template
                    >
                    <template #append
                      ><StatusChip :status="property.status" size="x-small"
                    /></template>
                  </v-list-item>
                </v-list>
              </div>
            </section>

            <section class="dal-panel">
              <div class="dal-panel__header">
                <span class="dal-section-title">النشاط الأخير</span
                ><span class="panel-note">آخر العمليات</span>
              </div>
              <div class="dal-panel__body">
                <EmptyState
                  v-if="!data.recent_activity.length"
                  class="dal-empty"
                  icon="mdi-history"
                  title="لا يوجد نشاط بعد"
                  text="ستظهر تعديلات المكتب هنا."
                />
                <v-list v-else density="compact">
                  <v-list-item
                    v-for="activity in data.recent_activity.slice(0, 6)"
                    :key="activity.id"
                    :title="`${actionLabel(activity.action)} ${activity.property_code || ''}`"
                  >
                    <template #prepend
                      ><v-icon
                        :icon="actionIcon(activity.action)"
                        size="18"
                        class="activity-icon"
                    /></template>
                    <template #subtitle
                      >{{ activity.user_name || "النظام" }} ·
                      <span class="money">{{
                        when(activity.created_at)
                      }}</span></template
                    >
                  </v-list-item>
                </v-list>
              </div>
            </section>
          </div>
        </main>

        <aside class="dashboard-side">
          <section class="dal-panel mb-3">
            <div class="dal-panel__header">
              <span class="dal-section-title">تحتاج مراجعة</span
              ><span v-if="data.needs_review.length" class="panel-note"
                >{{ data.needs_review.length }} عرض</span
              >
            </div>
            <div class="dal-panel__body">
              <EmptyState
                v-if="!data.needs_review.length"
                class="dal-empty"
                icon="mdi-check-all"
                title="كل العروض محدثة"
                text="لا توجد عروض مضى على تحديثها أكثر من 30 يوماً."
              />
              <v-list v-else density="compact">
                <v-list-item
                  v-for="property in data.needs_review.slice(0, REVIEW_LIMIT)"
                  :key="property.id"
                  :title="`${property.code} — ${property.governorate || ''}`"
                  :subtitle="`آخر تحديث ${pluralizeDays(daysSince(String(property.updated_at)))}`"
                  prepend-icon="mdi-clock-alert-outline"
                  @click="openProperty(property.code)"
                />
              </v-list>
            </div>
          </section>

          <section class="dal-panel mb-3">
            <div class="dal-panel__header">
              <span class="dal-section-title">أكثر المحافظات نشاطاً</span>
            </div>
            <div class="dal-panel__body">
              <RankedBarList
                v-if="data.top_governorates.length"
                :items="data.top_governorates"
                @select="openProperty"
              />
              <EmptyState
                v-else
                class="dal-empty"
                icon="mdi-map-marker-off"
                title="لا توجد بيانات مكانية"
              />
            </div>
          </section>

          <section class="dal-panel">
            <div class="dal-panel__header">
              <span class="dal-section-title">أكثر المناطق نشاطاً</span>
            </div>
            <div class="dal-panel__body">
              <RankedBarList
                v-if="data.top_districts.length"
                :items="data.top_districts"
                @select="openProperty"
              />
              <EmptyState
                v-else
                class="dal-empty"
                icon="mdi-map-marker-off"
                title="لا توجد بيانات مكانية"
              />
            </div>
          </section>
        </aside>
      </div>
    </template>
  </AppLayout>
</template>

<style scoped>
.dashboard-state {
  min-block-size: 280px;
}
.dashboard-loading {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}
.dashboard-loading__chart {
  grid-column: 1 / -1;
  min-block-size: 260px;
}
.dashboard-intro {
  display: flex;
  align-items: end;
  justify-content: space-between;
  gap: 20px;
  padding: 4px 2px 2px;
}
.dashboard-intro h1 {
  margin: 3px 0 0;
  font-size: clamp(20px, 2vw, 28px);
  line-height: 1.3;
  letter-spacing: -0.02em;
}
.dashboard-intro p {
  margin: 5px 0 0;
  color: rgba(var(--v-theme-on-surface), 0.62);
  font-size: 13px;
}
.dashboard-intro__eyebrow {
  color: rgb(var(--v-theme-primary));
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.08em;
}
.dashboard-intro__date {
  display: flex;
  align-items: center;
  gap: 7px;
  color: rgba(var(--v-theme-on-surface), 0.7);
  font-size: 12px;
  white-space: nowrap;
}
.dal-attention--urgent {
  border-inline-start: 3px solid rgb(var(--v-theme-error));
}
.dal-discover {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  border: 1px solid rgb(var(--v-theme-border));
}
.dal-discover__search {
  flex: 1 1 340px;
  min-width: 240px;
  max-width: 650px;
}
.portfolio-strip {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr)) minmax(170px, 1.35fr);
  border: 1px solid rgb(var(--v-theme-border));
  background: rgb(var(--v-theme-surface));
}
.portfolio-strip__item {
  display: flex;
  align-items: center;
  gap: 9px;
  min-width: 0;
  padding: 12px 14px;
  border-inline-end: 1px solid rgb(var(--v-theme-border));
}
.portfolio-strip__item:last-child {
  border-inline-end: 0;
}
.portfolio-strip__item > .v-icon {
  color: rgb(var(--v-theme-primary));
}
.portfolio-strip__label,
.rental-kpi__label {
  color: rgba(var(--v-theme-on-surface), 0.58);
  font-size: 11px;
  white-space: nowrap;
}
.portfolio-strip__value {
  margin-top: 2px;
  font-size: 17px;
  font-weight: 800;
}
.dashboard-layout {
  display: grid;
  grid-template-columns: minmax(0, 1.75fr) minmax(290px, 0.85fr);
  gap: 12px;
  align-items: start;
}
.dashboard-main,
.dashboard-side {
  min-width: 0;
}
.summary-boards {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
  align-items: start;
}
.rental-board {
  border-block-start: 3px solid rgb(var(--v-theme-primary));
}
.sales-board {
  border-block-start: 3px solid rgb(var(--v-theme-secondary));
}
.rental-board__header {
  align-items: start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 8px;
}
.rental-board__header h2 {
  margin-top: 3px;
}
.sales-board__header {
  align-items: start;
  justify-content: space-between;
  gap: 12px;
}
.sales-board__header h2 {
  margin-top: 3px;
}
.panel-note {
  color: rgba(var(--v-theme-on-surface), 0.56);
  font-size: 11px;
}
.rental-kpis {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}
.rental-kpi {
  min-width: 0;
  padding: 10px 12px;
  border: 1px solid rgb(var(--v-theme-border));
  background: rgba(var(--v-theme-on-surface), 0.02);
}
.rental-kpi--accent {
  border-inline-start: 3px solid rgb(var(--v-theme-primary));
}
.rental-kpi strong {
  display: block;
  margin-top: 5px;
  font-size: 18px;
  line-height: 1.2;
}
.rental-kpi small {
  display: block;
  margin-top: 4px;
  color: rgba(var(--v-theme-on-surface), 0.54);
  font-size: 11px;
}
.sales-kpis {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}
.sales-kpi {
  min-width: 0;
  padding: 10px 12px;
  border: 1px solid rgb(var(--v-theme-border));
  background: rgba(var(--v-theme-on-surface), 0.02);
}
.sales-kpi--accent {
  border-inline-start: 3px solid rgb(var(--v-theme-secondary));
}
.sales-kpi span,
.sales-value span {
  display: block;
  color: rgba(var(--v-theme-on-surface), 0.58);
  font-size: 11px;
}
.sales-kpi strong {
  display: block;
  margin-top: 6px;
  font-size: 18px;
  line-height: 1.2;
}
.sales-kpi small {
  display: block;
  margin-top: 3px;
  color: rgba(var(--v-theme-on-surface), 0.54);
  font-size: 11px;
}
.sales-value {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-top: 12px;
  padding: 12px 0;
  border-block: 1px solid rgb(var(--v-theme-border));
}
.sales-value strong {
  display: block;
  margin-top: 4px;
  color: rgb(var(--v-theme-secondary));
  font-size: 20px;
}
.sales-value > .v-icon {
  color: rgb(var(--v-theme-secondary));
}
.rental-chart-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.35fr) minmax(230px, 0.85fr);
  gap: 12px;
  margin-top: 16px;
}
.sales-chart-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.35fr) minmax(230px, 0.85fr);
  gap: 12px;
  margin-top: 16px;
}
.chart-key__dot--sales {
  background: rgb(var(--v-theme-secondary));
}
.trend-chart__line--sales {
  stroke: rgb(var(--v-theme-secondary));
}
.trend-chart__point--sales {
  stroke: rgb(var(--v-theme-secondary));
}
.sales-chart-grid .type-bar__track span {
  background: rgb(var(--v-theme-secondary));
}
.sales-empty {
  min-block-size: 280px;
}
.chart-panel {
  min-width: 0;
  padding: 12px;
  border: 1px solid rgb(var(--v-theme-border));
}
.chart-panel__heading {
  display: flex;
  justify-content: space-between;
  align-items: start;
  gap: 12px;
  margin-bottom: 8px;
}
.chart-panel h3 {
  margin: 0;
  font-size: 13px;
}
.chart-panel__heading span {
  color: rgba(var(--v-theme-on-surface), 0.55);
  font-size: 11px;
}
.chart-key {
  white-space: nowrap;
}
.chart-key__dot {
  display: inline-block;
  inline-size: 7px;
  block-size: 7px;
  margin-inline-end: 5px;
  border-radius: 50%;
  background: rgb(var(--v-theme-primary));
}
.trend-chart svg {
  display: block;
  inline-size: 100%;
  block-size: 170px;
  overflow: visible;
}
.trend-chart__grid {
  stroke: rgba(var(--v-theme-on-surface), 0.1);
  stroke-width: 1;
  stroke-dasharray: 3 4;
}
.trend-chart__line {
  fill: none;
  stroke: rgb(var(--v-theme-primary));
  stroke-width: 3;
  stroke-linecap: round;
  stroke-linejoin: round;
}
.trend-chart__point {
  fill: rgb(var(--v-theme-surface));
  stroke: rgb(var(--v-theme-primary));
  stroke-width: 3;
}
.trend-chart__labels {
  display: grid;
  grid-template-columns: repeat(6, 1fr);
  gap: 3px;
  text-align: center;
}
.trend-chart__labels span {
  display: grid;
  gap: 2px;
  color: rgba(var(--v-theme-on-surface), 0.56);
  font-size: 10px;
}
.trend-chart__labels b {
  color: rgba(var(--v-theme-on-surface), 0.82);
  font-size: 12px;
}
.chart-empty {
  min-block-size: 180px;
}
.type-bars {
  display: grid;
  gap: 13px;
  padding: 13px 0 3px;
}
.type-bar__meta {
  display: flex;
  justify-content: space-between;
  margin-bottom: 5px;
  font-size: 12px;
}
.type-bar__meta b {
  color: rgba(var(--v-theme-on-surface), 0.7);
}
.type-bar__track {
  block-size: 7px;
  overflow: hidden;
  background: var(--dal-hover);
}
.type-bar__track span {
  display: block;
  block-size: 100%;
  background: rgb(var(--v-theme-primary));
  opacity: 0.74;
}
.rental-status {
  margin-top: 16px;
  padding-top: 13px;
  border-top: 1px solid rgb(var(--v-theme-border));
}
.rental-status__head,
.rental-status__legend {
  display: flex;
  justify-content: space-between;
  gap: 10px;
  color: rgba(var(--v-theme-on-surface), 0.62);
  font-size: 11px;
}
.rental-status__track {
  display: flex;
  block-size: 9px;
  margin: 8px 0;
  overflow: hidden;
  background: var(--dal-hover);
}
.rental-status__segment {
  min-inline-size: 0;
}
.rental-status__segment--available,
.legend-dot--available {
  background: #238b6e;
}
.rental-status__segment--reserved,
.legend-dot--reserved {
  background: #c58a28;
}
.rental-status__segment--negotiating,
.legend-dot--negotiating {
  background: #6574a8;
}
.rental-status__segment--rented,
.legend-dot--rented {
  background: #9a5d83;
}
.rental-status__segment--sold,
.legend-dot--sold {
  background: #9a5d83;
}
.rental-status__legend {
  justify-content: start;
  flex-wrap: wrap;
}
.rental-status__legend span {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}
.legend-dot {
  inline-size: 7px;
  block-size: 7px;
  border-radius: 50%;
}
.dashboard-columns {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}
.activity-icon {
  color: rgb(var(--v-theme-primary));
}
@media (max-width: 1250px) {
  .portfolio-strip {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
  .portfolio-strip__item:nth-child(3) {
    border-inline-end: 0;
  }
  .portfolio-strip__item--value {
    grid-column: span 3;
  }
}
@media (max-width: 1050px) {
  .dashboard-layout,
  .summary-boards,
  .rental-chart-grid,
  .sales-chart-grid {
    grid-template-columns: 1fr;
  }
}
@media (max-width: 760px) {
  .dashboard-intro,
  .rental-board__header,
  .sales-board__header {
    align-items: start;
    flex-direction: column;
  }
  .portfolio-strip,
  .rental-kpis,
  .dashboard-columns {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .portfolio-strip__item:nth-child(2n) {
    border-inline-end: 0;
  }
  .portfolio-strip__item--value {
    grid-column: span 2;
  }
}
@media (prefers-reduced-motion: reduce) {
  .trend-chart__line {
    transition: none;
  }
}
</style>
