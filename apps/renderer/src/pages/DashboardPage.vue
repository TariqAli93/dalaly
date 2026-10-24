<script setup lang="ts">
import { RENTAL_PROPERTY_LABELS } from "../constants/domain";
import { computed, onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import AppPage from "../components/app/AppPage.vue";
import MetricCard from "../components/shared/MetricCard.vue";
import OfferTrendChart from "../components/shared/OfferTrendChart.vue";
import DistributionChart from "../components/shared/DistributionChart.vue";
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
import {
  formatDateTime,
  formatMoney,
  formatNumber,
  pluralizeDays,
} from "../utils/format";
import type { DashboardSummary } from "../types";

const router = useRouter();
const { can } = usePermissions();
const { notifySuccess, notifyError } = useSnackbar();
const { setRefreshHandler } = useRefresh();
const { filters, startFromFirstPage, properties, service } = useProperties();

const analysisDomain = ref("sales");
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

async function openProperty(code?: string | null) {
  if (code && can("properties.read")) {
    try {
      const record =
        properties.value.find((property) => property.code === code) ??
        (await service.listProperties({ q: code })).find(
          (property) => property.code === code,
        ) ??
        (await service.listProperties({ q: code, status: "archived" })).find(
          (property) => property.code === code,
        );
      if (record) {
        await router.push(`/properties/${record.id}`);
        return;
      }
    } catch (cause) {
      notifyError(getErrorMessage(cause));
      return;
    }
  }
  filters.value.q = code ?? "";
  startFromFirstPage();
  void router.push("/properties");
}

const discoverQuery = ref("");
function searchProperties() {
  filters.value.q = discoverQuery.value.trim();
  startFromFirstPage();
  void router.push("/properties");
}
function goAvailable() {
  filters.value.status = "available";
  filters.value.q = "";
  startFromFirstPage();
  void router.push("/properties");
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
  ...RENTAL_PROPERTY_LABELS,
  house: "دار",
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
  return Number.isNaN(date.getTime()) ? "—" : formatDateTime(date);
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

function trendPoints(rows: DashboardSummary["sales"]["monthly_activity"]) {
  return rows.map((row) => ({
    ...row,
    label: new Date(`${row.month}-01T00:00:00Z`).toLocaleDateString("ar-IQ", {
      month: "short",
      timeZone: "UTC",
    }),
  }));
}

const rentalTrend = computed(() =>
  trendPoints(data.value?.rentals.monthly_activity ?? []),
);
const salesTrend = computed(() =>
  trendPoints(data.value?.sales.monthly_activity ?? []),
);

function rentalTypeLabel(name: string) {
  return rentalTypeLabels[name] ?? name;
}
onMounted(() => {
  setRefreshHandler(load);
  void load();
});
</script>

<template>
  <AppPage title="لوحة التحكم" :subtitle="loadedSubtitle">
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
      class="pa-6 text-center"
    >
      <v-icon
        icon="mdi-lan-disconnect"
        size="40"
        class="text-medium-emphasis"
      />
      <h2 class="text-h6 mt-3">تعذّر تحميل لوحة التحكم</h2>
      <p class="text-medium-emphasis mt-2">{{ loadError }}</p>
      <v-btn color="primary" class="mt-4" :loading="loading" @click="load"
        >إعادة المحاولة</v-btn
      >
    </v-card>
    <div v-else-if="loading && !data" class="dashboard-loading">
      <v-skeleton-loader v-for="n in 4" :key="n" type="list-item-two-line" />
      <v-skeleton-loader type="image" class="dashboard-loading__chart" />
    </div>
    <template v-else-if="data">
      <v-alert
        v-if="loadError"
        type="warning"
        variant="tonal"
        class="mb-4"
        role="status"
      >
        تعذّر تحديث البيانات؛ المعروض هو آخر تحميل ناجح.
        <template #append
          ><v-btn variant="text" :loading="loading" @click="load"
            >إعادة المحاولة</v-btn
          ></template
        >
      </v-alert>
      <div class="dashboard-context">
        <span
          ><v-icon icon="mdi-calendar-outline" size="16" />
          {{ todayLabel }}</span
        ><span>نظرة عامة على نشاط المكتب</span>
      </div>
      <section class="dashboard-metrics" aria-label="مؤشرات العروض">
        <MetricCard
          v-for="card in statusCards"
          :key="card.key"
          :label="card.label"
          :value="formatNumber(data!.counts[card.key], 0)"
          :icon="card.icon"
          :tone="
            card.key === 'reserved'
              ? 'warning'
              : card.key === 'sold'
                ? 'info'
                : 'primary'
          "
        />
      </section>
      <div class="dashboard-workspace">
        <div class="dashboard-main">
          <v-card variant="flat" border class="analytics-workspace">
            <div class="analytics-heading">
              <div>
                <h2 elementtiming="dashboard-content">التقارير والإحصائيات</h2>
                <p>العروض الجديدة وتوزيع العقارات النشطة</p>
              </div>
              <v-tabs v-model="analysisDomain" color="primary" density="compact"
                ><v-tab value="sales">عروض البيع</v-tab
                ><v-tab v-if="can('rentals.read')" value="rentals"
                  >الإيجارات</v-tab
                ></v-tabs
              >
            </div>
            <v-window v-model="analysisDomain">
              <v-window-item
                v-for="domain in ['sales', 'rentals']"
                :key="domain"
                :value="domain"
              >
                <div class="analytics-grid">
                  <section>
                    <div class="chart-heading">
                      <h3>العروض الجديدة</h3>
                      <span>آخر 6 أشهر</span>
                    </div>
                    <OfferTrendChart
                      :points="domain === 'sales' ? salesTrend : rentalTrend"
                      :label="
                        domain === 'sales'
                          ? 'عروض البيع الجديدة'
                          : 'الإيجارات الجديدة'
                      "
                    />
                  </section>
                  <section>
                    <div class="chart-heading">
                      <h3>توزيع أنواع العقارات</h3>
                      <span>العروض غير المؤرشفة</span>
                    </div>
                    <DistributionChart
                      :items="
                        (domain === 'sales'
                          ? data!.sales.by_type
                          : data!.rentals.by_type
                        ).map((item) => ({
                          ...item,
                          name: rentalTypeLabel(item.name),
                        }))
                      "
                      :label="
                        domain === 'sales'
                          ? 'توزيع أنواع عقارات البيع غير المؤرشفة'
                          : 'توزيع أنواع عقارات الإيجار غير المؤرشفة'
                      "
                    />
                  </section>
                </div>
                <div class="financial-strip" v-if="domain === 'sales'">
                  <div>
                    <span>قيمة عروض البيع النشطة</span
                    ><strong class="money"
                      >{{
                        formatMoney(data!.financial.total_value)
                      }}
                      د.ع</strong
                    >
                  </div>
                  <div>
                    <span>متوسط السعر</span
                    ><strong class="money"
                      >{{ formatMoney(data!.financial.avg_price) }} د.ع</strong
                    >
                  </div>
                  <div>
                    <span>العروض النشطة</span
                    ><strong>{{
                      formatNumber(
                        data!.counts.total - data!.counts.archived,
                        0,
                      )
                    }}</strong>
                  </div>
                </div>
                <div class="financial-strip financial-strip--rentals" v-else>
                  <div>
                    <span>القيمة الشهرية للإيجارات</span
                    ><strong class="money"
                      >{{
                        formatMoney(data!.rentals.financial.monthly_value)
                      }}
                      د.ع</strong
                    >
                  </div>
                  <div>
                    <span>متوسط الإيجار الشهري</span
                    ><strong class="money"
                      >{{
                        formatMoney(data!.rentals.financial.avg_monthly_price)
                      }}
                      د.ع</strong
                    >
                  </div>
                  <div>
                    <span>إيجارات نشطة</span
                    ><strong>{{
                      formatNumber(data!.rentals.counts.active, 0)
                    }}</strong>
                  </div>
                  <div>
                    <span>القيمة الشهرية للمؤجر حالياً</span>
                    <strong class="money"
                      >{{
                        formatMoney(
                          data!.rentals.financial.rented_monthly_value,
                        )
                      }}
                      د.ع</strong
                    >
                  </div>
                </div>
                <div class="status-legend">
                  <span
                    v-for="status in domain === 'sales'
                      ? salesStatusCards
                      : rentalStatusCards"
                    :key="status.key"
                    ><i :class="'status-dot status-dot--' + status.tone" />{{
                      status.label
                    }}
                    <b>{{
                      domain === "sales"
                        ? data!.counts[
                            status.key as
                              | "available"
                              | "reserved"
                              | "negotiating"
                              | "sold"
                              | "rented"
                          ]
                        : data!.rentals.counts[
                            status.key as
                              | "available"
                              | "reserved"
                              | "negotiating"
                              | "rented"
                          ]
                    }}</b></span
                  ><v-spacer /><v-btn
                    size="small"
                    variant="text"
                    append-icon="mdi-arrow-left"
                    @click="
                      router.push(
                        domain === 'sales' ? '/properties' : '/rentals',
                      )
                    "
                    >عرض الكل</v-btn
                  >
                </div>
              </v-window-item>
            </v-window>
          </v-card>
          <v-card variant="flat" border class="recent-offers">
            <div class="section-heading">
              <h2>آخر العروض العقارية</h2>
              <v-btn
                size="small"
                variant="text"
                append-icon="mdi-arrow-left"
                @click="router.push('/properties')"
                >عرض الكل</v-btn
              >
            </div>
            <EmptyState
              v-if="!data!.latest.length"
              icon="mdi-home-plus-outline"
              title="لا توجد عروض بعد"
              text="أضف أول عرض ليظهر هنا."
            />
            <v-table v-else density="compact"
              ><thead>
                <tr>
                  <th>العقار</th>
                  <th>الموقع</th>
                  <th>السعر الإجمالي</th>
                  <th>الحالة</th>
                  <th>تاريخ الإضافة</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="property in data!.latest.slice(0, 6)"
                  :key="property.id"
                >
                  <td>
                    <button
                      class="offer-link"
                      @click="openProperty(property.code)"
                    >
                      <v-avatar
                        color="primary"
                        variant="tonal"
                        rounded="lg"
                        size="32"
                        ><v-icon
                          icon="mdi-home-city-outline"
                          size="18" /></v-avatar
                      ><span
                        ><strong>{{
                          property.name || property.property_type
                        }}</strong
                        ><small
                          ><bdi>{{ property.code }}</bdi> ·
                          {{ property.property_type }}</small
                        ></span
                      >
                    </button>
                  </td>
                  <td>
                    {{ property.governorate || "—"
                    }}<small class="cell-subtitle">{{
                      property.district
                    }}</small>
                  </td>
                  <td>
                    <span class="money">{{
                      formatMoney(property.total_price)
                    }}</span>
                    د.ع
                  </td>
                  <td><StatusChip :status="property.status" /></td>
                  <td>
                    {{ pluralizeDays(daysSince(String(property.created_at))) }}
                  </td>
                  <td>
                    <v-btn
                      icon="mdi-chevron-left"
                      size="x-small"
                      variant="text"
                      aria-label="فتح العرض"
                      @click="openProperty(property.code)"
                    />
                  </td>
                </tr></tbody
            ></v-table>
          </v-card>
          <v-card v-if="can('audit.read')" variant="flat" border>
            <div class="section-heading">
              <h2>النشاط الأخير</h2>
              <span class="muted-caption">آخر العمليات</span>
            </div>
            <EmptyState
              v-if="!data!.recent_activity.length"
              icon="mdi-history"
              title="لا يوجد نشاط بعد"
              text="ستظهر تعديلات المكتب هنا."
            />
            <v-list v-else density="compact" class="activity-list"
              ><v-list-item
                v-for="activity in data!.recent_activity.slice(0, 6)"
                :key="activity.id"
                :title="
                  actionLabel(activity.action) +
                  ' ' +
                  (activity.property_code || '')
                "
                ><template #prepend
                  ><v-avatar
                    variant="tonal"
                    color="primary"
                    size="30"
                    class="me-3"
                    ><v-icon
                      :icon="actionIcon(activity.action)"
                      size="16" /></v-avatar></template
                ><template #subtitle
                  >{{ activity.user_name || "النظام" }} ·
                  <span class="money">{{
                    when(activity.created_at)
                  }}</span></template
                ></v-list-item
              ></v-list
            >
          </v-card>
        </div>
        <aside class="dashboard-side">
          <v-card variant="flat" border class="quick-search-card"
            ><div class="section-heading">
              <h2>الوصول السريع</h2>
              <v-icon
                icon="mdi-lightning-bolt-outline"
                size="20"
                color="primary"
              />
            </div>
            <v-card-text>
              <v-text-field
                v-model="discoverQuery"
                density="compact"
                hide-details
                clearable
                prepend-inner-icon="mdi-magnify"
                placeholder="الكود، المالك، المنطقة…"
                aria-label="بحث سريع في العروض"
                @keyup.enter="searchProperties"
              />
              <v-btn
                variant="tonal"
                color="primary"
                block
                class="mt-3"
                prepend-icon="mdi-check-circle-outline"
                @click="goAvailable"
                >العروض المتاحة</v-btn
              >
              <v-btn
                variant="text"
                block
                class="mt-2"
                prepend-icon="mdi-format-list-bulleted"
                @click="router.push('/properties')"
                >كل العروض</v-btn
              >
            </v-card-text></v-card
          >
          <v-card
            v-if="can('followups.read')"
            variant="flat"
            border
            :class="{ 'attention-card': overdueCount }"
            ><div class="section-heading">
              <h2>المتابعات</h2>
              <v-chip v-if="overdueCount" size="x-small" color="error"
                >{{ overdueCount }} متأخرة</v-chip
              >
            </div>
            <EmptyState
              v-if="!sortedReminders.length"
              icon="mdi-bell-check-outline"
              title="لا توجد متابعة مستحقة"
              text="أضف متابعة من صفحة العرض لتظهر هنا في موعدها."
            />
            <v-list v-else density="compact"
              ><v-list-item
                v-for="reminder in sortedReminders.slice(0, 5)"
                :key="reminder.id"
                :title="
                  reminder.property_code + ' — ' + (reminder.notes || 'متابعة')
                "
                :prepend-icon="
                  isOverdue(reminder.scheduled_at)
                    ? 'mdi-bell-alert-outline'
                    : 'mdi-bell-outline'
                "
                :base-color="
                  isOverdue(reminder.scheduled_at) ? 'error' : undefined
                "
                @click="openProperty(reminder.property_code)"
                ><template #subtitle
                  ><span
                    v-if="isOverdue(reminder.scheduled_at)"
                    class="text-error"
                    >متأخر · </span
                  ><span class="money">{{
                    when(reminder.scheduled_at)
                  }}</span></template
                ></v-list-item
              ></v-list
            >
          </v-card>
          <v-card variant="flat" border
            ><div class="section-heading">
              <h2>تحتاج مراجعة</h2>
              <v-chip v-if="data!.needs_review.length" size="x-small">{{
                data!.needs_review.length
              }}</v-chip>
            </div>
            <EmptyState
              v-if="!data!.needs_review.length"
              icon="mdi-check-all"
              title="كل العروض محدثة"
              text="لا توجد عروض مضى على تحديثها أكثر من 30 يوماً."
            />
            <v-list v-else density="compact"
              ><v-list-item
                v-for="property in data!.needs_review.slice(0, REVIEW_LIMIT)"
                :key="property.id"
                :title="property.code + ' — ' + (property.governorate || '')"
                :subtitle="
                  'آخر تحديث ' +
                  pluralizeDays(daysSince(String(property.updated_at)))
                "
                prepend-icon="mdi-clock-outline"
                @click="openProperty(property.code)"
            /></v-list>
          </v-card>
          <v-card
            v-for="(items, index) in [
              data!.top_governorates,
              data!.top_districts,
            ]"
            :key="index"
            variant="flat"
            border
            ><div class="section-heading">
              <h2>
                {{
                  index === 0 ? "أكثر المحافظات نشاطاً" : "أكثر المناطق نشاطاً"
                }}
              </h2>
            </div>
            <v-card-text
              ><RankedBarList
                v-if="items.length"
                :items="items"
                @select="openProperty" /><EmptyState
                v-else
                icon="mdi-map-marker-off-outline"
                title="لا توجد بيانات مكانية" /></v-card-text
          ></v-card>
        </aside>
      </div>
    </template>
  </AppPage>
</template>

<style scoped>
.dashboard-context {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 16px;
  justify-content: space-between;
  color: var(--dal-muted);
  font-size: calc(12px * var(--dal-font-scale));
  margin-bottom: 16px;
}
.dashboard-context > span {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.dashboard-metrics {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 12px;
  margin-bottom: 20px;
}
.dashboard-workspace {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 280px;
  gap: 20px;
  align-items: start;
}
.dashboard-main,
.dashboard-side {
  display: grid;
  gap: 20px;
  min-width: 0;
}
.analytics-heading,
.section-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 16px 20px;
}
.analytics-heading {
  flex-wrap: wrap;
  border-bottom: 1px solid var(--dal-stroke);
}
.analytics-heading :deep(.v-tabs) {
  flex: 0 0 auto;
}
.analytics-heading h2,
.section-heading h2 {
  font-size: calc(16px * var(--dal-font-scale));
  font-weight: 600;
}
.analytics-heading p {
  font-size: calc(11px * var(--dal-font-scale));
  color: var(--dal-muted);
  margin-top: 2px;
}
.analytics-grid {
  display: grid;
  grid-template-columns: 1.1fr 1fr;
  gap: 24px;
  padding: 20px;
}
.analytics-grid > section {
  min-width: 0;
}
.chart-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.chart-heading h3 {
  font-size: calc(13px * var(--dal-font-scale));
  font-weight: 600;
}
.chart-heading > span,
.muted-caption {
  color: var(--dal-muted);
  font-size: calc(11px * var(--dal-font-scale));
}
.financial-strip {
  display: grid;
  grid-template-columns: 1.5fr 1.25fr 0.75fr;
  border-block: 1px solid var(--dal-stroke);
  padding: 16px 20px;
  gap: 16px;
}
.financial-strip > div {
  min-width: 0;
  border-inline-end: 1px solid var(--dal-stroke);
  padding-inline-end: 12px;
}
.financial-strip--rentals {
  grid-template-columns: repeat(4, minmax(0, 1fr));
}
.financial-strip > div:last-child {
  border: 0;
}
.financial-strip span {
  display: block;
  font-size: calc(11px * var(--dal-font-scale));
  color: var(--dal-muted);
}
.financial-strip strong {
  display: block;
  font-size: calc(17px * var(--dal-font-scale));
  font-weight: 700;
  margin-top: 6px;
  overflow-wrap: anywhere;
  font-variant-numeric: tabular-nums;
}
.status-legend {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 16px;
  padding: 8px 20px;
  font-size: calc(11px * var(--dal-font-scale));
  color: var(--dal-muted);
}
.status-legend > span {
  display: flex;
  gap: 6px;
  align-items: center;
}
.status-legend b {
  color: rgb(var(--v-theme-on-surface));
  font-variant-numeric: tabular-nums;
}
.status-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #599b87;
}
.status-dot--reserved {
  background: #c27c3a;
}
.status-dot--negotiating {
  background: #748da7;
}
.status-dot--sold,
.status-dot--rented {
  background: #a68775;
}
.recent-offers :deep(th) {
  color: var(--dal-muted);
  background: var(--dal-hover);
  font-size: calc(11px * var(--dal-font-scale));
  white-space: nowrap;
}
.recent-offers :deep(td) {
  white-space: nowrap;
  font-size: calc(12px * var(--dal-font-scale));
}
.offer-link {
  display: flex;
  gap: 10px;
  align-items: center;
  text-align: start;
  padding-block: 10px;
}
.offer-link strong {
  font-size: calc(12px * var(--dal-font-scale));
  font-weight: 600;
}
.offer-link small,
.cell-subtitle {
  display: block;
  font-size: calc(10px * var(--dal-font-scale));
  color: var(--dal-muted);
}
.attention-card {
  border-inline-start: 3px solid rgb(var(--v-theme-error));
}
.quick-search-card :deep(.v-card-text) {
  padding-top: 0;
}
.dashboard-loading {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 16px;
}
.dashboard-loading__chart {
  grid-column: 1 / -1;
}
.dashboard-side :deep(.v-empty-state) {
  padding: 20px 16px;
}
.dashboard-side :deep(.v-empty-state__title) {
  font-size: calc(13px * var(--dal-font-scale));
}
.dashboard-side :deep(.v-empty-state__text) {
  font-size: calc(11px * var(--dal-font-scale));
}
@media (max-width: 1450px) {
  .dashboard-workspace {
    grid-template-columns: minmax(0, 1fr) 250px;
    gap: 16px;
  }
  .analytics-grid {
    gap: 16px;
    padding: 16px;
  }
  .dashboard-metrics :deep(.metric-card) {
    gap: 12px;
    padding: 16px;
  }
  .dashboard-metrics :deep(.metric-card__value) {
    font-size: calc(24px * var(--dal-font-scale));
  }
}
@media (max-width: 1100px) {
  .dashboard-workspace {
    grid-template-columns: 1fr;
  }
  .dashboard-side {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .dashboard-metrics {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}
@media (max-width: 760px) {
  .analytics-heading {
    align-items: flex-start;
    flex-direction: column;
    gap: 8px;
  }
  .dashboard-metrics {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .analytics-grid,
  .dashboard-side {
    grid-template-columns: 1fr;
  }
  .financial-strip {
    grid-template-columns: 1fr;
  }
  .financial-strip > div {
    border: 0;
  }
}
</style>
