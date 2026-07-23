<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import AppLayout from "../layouts/AppLayout.vue";
import StatusChip from "../components/shared/StatusChip.vue";
import EmptyState from "../components/shared/EmptyState.vue";
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

// أقصى عدد صفوف تُعرض في بطاقة "تحتاج مراجعة" قبل زر "عرض الكل".
const REVIEW_LIMIT = 8;

/**
 * ينقل المستخدم إلى قائمة العروض مفلترة على الكود الذي ضغط عليه،
 * بدل إنزاله في جدول غير مفلتر يحمل الكود في رأسه.
 */
function openProperty(code?: string | null) {
  filters.value.q = code ?? "";
  void router.push("/properties").then(() => loadProperties());
}

const data = ref<DashboardSummary | null>(null);
const loading = ref(false);
const loadError = ref<string | null>(null);
const lastLoadedAt = ref<Date | null>(null);
const backupRunning = ref(false);

// الأيقونات بلون الحبر الهادئ؛ اللون هنا لا يحمل معنى (هذه أعداد لا حالات
// قابلة للتنفيذ)، وقاعدة "الحبر الشحيح" تحجز التيل للفعل والتحديد والموقع.
const statusCards = [
  { key: "total", label: "إجمالي العروض", icon: "mdi-home-city" },
  { key: "available", label: "متاح", icon: "mdi-check-circle-outline" },
  { key: "reserved", label: "محجوز", icon: "mdi-bookmark-outline" },
  { key: "negotiating", label: "قيد التفاوض", icon: "mdi-handshake-outline" },
  { key: "sold", label: "مباع", icon: "mdi-cash-check" },
  { key: "rented", label: "مؤجر", icon: "mdi-key-outline" },
] as const;

// العنوان الفرعي كان جملة بلا معلومة؛ الآن يحمل وقت آخر تحميل ناجح،
// وهو ما يجعل زر التحديث مفهوماً بدل أن يبدو معطّلاً.
const loadedSubtitle = computed(() => {
  if (loading.value) return "جارٍ التحديث…";
  if (!lastLoadedAt.value) return "نظرة شاملة على نشاط المكتب.";
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

/** لا نُسرّب أسماء الأحداث الإنجليزية إلى نص عربي عند ظهور حدث غير معروف. */
function actionLabel(action: string) {
  return ACTION_LABELS[action] ?? "تغيير";
}

async function load() {
  loading.value = true;
  try {
    data.value = await fetchDashboard();
    lastLoadedAt.value = new Date();
    loadError.value = null;
  } catch (error) {
    const message = getErrorMessage(error);
    // عند فشل التحديث نُبقي آخر بيانات ناجحة معروضة بدل تفريغ الصفحة،
    // ونعرض الخطأ داخل الصفحة (لا في إشعار يختفي بعد ثوانٍ).
    loadError.value = message;
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

// تمييز المتابعة المتأخرة (موعدها في الماضي) — عرض فقط، لا منطق أعمال.
function isOverdue(value: string) {
  const t = new Date(value).getTime();
  return !Number.isNaN(t) && t < Date.now();
}
// ترتيب المتابعات للعرض: الأقرب/الأكثر تأخّراً أولاً (نفس البيانات، ترتيب عرض).
const sortedReminders = computed(() => {
  const list = data.value?.reminders ?? [];
  return [...list].sort((a, b) => {
    const ta = new Date(a.scheduled_at).getTime();
    const tb = new Date(b.scheduled_at).getTime();
    return (Number.isNaN(ta) ? Infinity : ta) - (Number.isNaN(tb) ? Infinity : tb);
  });
});
const overdueCount = computed(
  () => (data.value?.reminders ?? []).filter((r) => isOverdue(r.scheduled_at)).length,
);

onMounted(() => {
  setRefreshHandler(load);
  void load();
});
</script>

<template>
  <AppLayout title="لوحة التحكم" :subtitle="loadedSubtitle">
    <!-- إجراءات الصفحة في شريط الأوامر (نمط سطح المكتب). نفس الصلاحيات
         والمعالجات السابقة تماماً؛ زر رئيسي واحد والبقية خفيفة. -->
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
        محافظة
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

    <!-- تعذّر التحميل ولا توجد بيانات سابقة: نشرح ونعرض إعادة المحاولة،
         بدل ترك الصفحة فارغة بعد اختفاء الإشعار. -->
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
      <div class="text-h6 mt-3">تعذّر تحميل لوحة التحكم</div>
      <div class="text-body-2 text-medium-emphasis mt-1">{{ loadError }}</div>
      <div class="text-body-2 text-medium-emphasis mt-1">
        تأكد من تشغيل قاعدة البيانات، ثم أعد المحاولة.
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
      <div class="kpi-grid mb-4">
        <v-skeleton-loader v-for="n in 6" :key="n" type="list-item-two-line" />
      </div>
      <v-skeleton-loader type="list-item, actions" class="mb-4" />
      <v-row>
        <v-col v-for="n in 4" :key="n" cols="12" md="6">
          <v-skeleton-loader type="list-item-two-line, list-item, list-item" />
        </v-col>
      </v-row>
    </template>

    <template v-else-if="data">
      <!-- شريط تنبيه غير حاجب: فشل التحديث مع بقاء آخر بيانات ناجحة. -->
      <v-alert
        v-if="loadError"
        type="warning"
        variant="tonal"
        class="mb-4"
        role="status"
      >
        تعذّر تحديث البيانات؛ ما يظهر أدناه هو آخر تحميل ناجح.
        <template #append>
          <v-btn variant="text" :loading="loading" @click="load">
            إعادة المحاولة
          </v-btn>
        </template>
      </v-alert>

      <!-- ١) عمل اليوم أولاً: التنبيهات والمراجعات قبل الأرقام العامة.
           المتابعات المتأخرة مُبرَزة (لون تحذيري + ترتيب أوّلي). -->
      <v-row dense class="mb-1">
        <!-- تنبيهات المتابعات -->
        <v-col cols="12" md="6">
          <div class="dal-panel">
            <div class="dal-panel__header">
              <span class="dal-section-title">تنبيهات المتابعات</span>
              <v-chip
                v-if="overdueCount"
                size="x-small"
                color="error"
                variant="tonal"
                label
                class="ms-2"
              >
                <span class="money">{{ overdueCount }}</span> متأخرة
              </v-chip>
            </div>
            <div class="dal-panel__body">
              <EmptyState
                v-if="!sortedReminders.length"
                class="dal-empty"
                icon="mdi-bell-check-outline"
                title="لا متابعات مستحقة"
                text="افتح أي عرض وأضف متابعة لتظهر هنا في موعدها."
              />
              <v-list v-else density="compact">
                <v-list-item
                  v-for="r in sortedReminders"
                  :key="r.id"
                  :title="`${r.property_code} — ${r.notes || 'متابعة'}`"
                  :prepend-icon="
                    isOverdue(r.scheduled_at)
                      ? 'mdi-bell-alert-outline'
                      : 'mdi-bell-ring-outline'
                  "
                  :base-color="isOverdue(r.scheduled_at) ? 'error' : undefined"
                  @click="openProperty(r.property_code)"
                >
                  <template #subtitle>
                    <span
                      v-if="isOverdue(r.scheduled_at)"
                      class="text-error font-weight-bold"
                    >
                      متأخر ·
                    </span>
                    <span class="money">{{ when(r.scheduled_at) }}</span>
                  </template>
                </v-list-item>
              </v-list>
            </div>
          </div>
        </v-col>

        <!-- عروض تحتاج مراجعة -->
        <v-col cols="12" md="6">
          <div class="dal-panel">
            <div class="dal-panel__header">
              <span class="dal-section-title">عروض تحتاج مراجعة</span>
              <span
                v-if="data.needs_review.length > REVIEW_LIMIT"
                class="dal-summary__label"
              >
                (<span class="money">{{ REVIEW_LIMIT }}</span> من
                <span class="money">{{ data.needs_review.length }}</span
                >)
              </span>
              <v-spacer />
              <v-btn
                v-if="data.needs_review.length > REVIEW_LIMIT"
                size="x-small"
                variant="text"
                @click="router.push('/properties')"
              >
                عرض الكل
              </v-btn>
            </div>
            <div class="dal-panel__body">
              <EmptyState
                v-if="!data.needs_review.length"
                class="dal-empty"
                icon="mdi-check-all"
                title="كل العروض محدّثة"
                text="لا يوجد عرض مضى على آخر تحديثه أكثر من 30 يوماً."
              />
              <v-list v-else density="compact">
                <v-list-item
                  v-for="p in data.needs_review.slice(0, REVIEW_LIMIT)"
                  :key="p.id"
                  :title="`${p.code} — ${p.governorate || ''} ${p.district || ''}`"
                  :subtitle="`آخر تحديث ${pluralizeDays(daysSince(String(p.updated_at)))} — راجع المالك`"
                  prepend-icon="mdi-clock-alert-outline"
                  @click="openProperty(p.code)"
                />
              </v-list>
            </div>
          </div>
        </v-col>
      </v-row>

      <!-- ٢) وعي تشغيلي: آخر العروض والنشاط -->
      <v-row dense class="mb-1">
        <!-- آخر العروض -->
        <v-col cols="12" md="6">
          <div class="dal-panel">
            <div class="dal-panel__header">
              <span class="dal-section-title">آخر العروض</span>
            </div>
            <div class="dal-panel__body">
              <EmptyState
                v-if="!data.latest.length"
                class="dal-empty"
                icon="mdi-home-plus-outline"
                title="لا يوجد عروض بعد"
                text="أضف أول عرض ليظهر هنا."
              />
              <v-list v-else density="compact">
                <v-list-item
                  v-for="p in data.latest"
                  :key="p.id"
                  :title="`${p.code} — ${p.property_type}`"
                  @click="openProperty(p.code)"
                >
                  <template #subtitle>
                    {{ p.governorate || "" }} {{ p.district || "" }} ·
                    <span class="money">{{ formatMoney(p.total_price) }}</span>
                    دينار
                  </template>
                  <template #append>
                    <StatusChip :status="p.status" size="x-small" />
                  </template>
                </v-list-item>
              </v-list>
            </div>
          </div>
        </v-col>

        <!-- النشاط الأخير -->
        <v-col cols="12" md="6">
          <div class="dal-panel">
            <div class="dal-panel__header">
              <span class="dal-section-title">النشاط الأخير</span>
            </div>
            <div class="dal-panel__body">
              <EmptyState
                v-if="!data.recent_activity.length"
                class="dal-empty"
                icon="mdi-history"
                title="لا يوجد نشاط"
                text="كل إضافة أو تعديل أو تغيير سعر سيظهر هنا."
              />
              <v-list v-else density="compact">
                <v-list-item
                  v-for="a in data.recent_activity"
                  :key="a.id"
                  :title="`${actionLabel(a.action)} ${a.property_code || ''}`"
                >
                  <template #subtitle>
                    {{ a.user_name || "النظام" }} ·
                    <span class="money">{{ when(a.created_at) }}</span>
                  </template>
                </v-list-item>
              </v-list>
            </div>
          </div>
        </v-col>
      </v-row>

      <!-- ٣) ملخّص الأرقام (بعد المهام) -->
      <div class="dal-summary">
        <div
          v-for="card in statusCards"
          :key="card.key"
          class="dal-summary__item"
        >
          <v-icon :icon="card.icon" size="18" class="dal-summary__icon" />
          <div class="min-w-0">
            <div class="dal-summary__label">{{ card.label }}</div>
            <div class="dal-summary__value money">
              {{ formatNumber(data.counts[card.key], 0) }}
            </div>
          </div>
        </div>
        <div class="dal-summary__item">
          <v-icon
            icon="mdi-cash-multiple"
            size="18"
            class="dal-summary__icon"
          />
          <div class="min-w-0">
            <div class="dal-summary__label">القيمة الإجمالية</div>
            <div class="dal-summary__value money">
              {{ formatMoney(data.financial.total_value) }}
            </div>
          </div>
        </div>
      </div>

      <!-- ٤) أعلى المواقع (سياق، في الأسفل) -->
      <v-row dense>
        <v-col cols="12" md="6">
          <div class="dal-panel">
            <div class="dal-panel__header">
              <span class="dal-section-title">أكثر المحافظات نشاطاً</span>
            </div>
            <div class="dal-panel__body pa-2">
              <!-- الشرائح تفتح قائمة العروض مفلترة على اسم المحافظة. -->
              <v-chip
                v-for="g in data.top_governorates"
                :key="g.name || ''"
                class="ma-1"
                size="small"
                variant="tonal"
                link
                @click="openProperty(g.name)"
              >
                {{ g.name }} · <span class="money">{{ g.count }}</span>
              </v-chip>
              <EmptyState
                v-if="!data.top_governorates.length"
                class="dal-empty"
                icon="mdi-map-marker-off"
                title="لا توجد بيانات"
              />
            </div>
          </div>
        </v-col>
        <v-col cols="12" md="6">
          <div class="dal-panel">
            <div class="dal-panel__header">
              <span class="dal-section-title">أكثر المناطق نشاطاً</span>
            </div>
            <div class="dal-panel__body pa-2">
              <v-chip
                v-for="d in data.top_districts"
                :key="d.name || ''"
                class="ma-1"
                size="small"
                variant="tonal"
                link
                @click="openProperty(d.name)"
              >
                {{ d.name }} · <span class="money">{{ d.count }}</span>
              </v-chip>
              <EmptyState
                v-if="!data.top_districts.length"
                class="dal-empty"
                icon="mdi-map-marker-off"
                title="لا توجد بيانات"
              />
            </div>
          </div>
        </v-col>
      </v-row>
    </template>
  </AppLayout>
</template>

<style scoped>
/* نقاط الكسر تتبع عقد التخطيط الموحّد (1100 / 760) بدل 600 التي كانت
   تترك الشبكة بثلاثة أعمدة بينما اختفى البحث العام أصلاً عند 760. */
.kpi-grid {
  display: grid;
  grid-template-columns: repeat(6, minmax(0, 1fr));
  gap: 14px;
}
@media (max-width: 1400px) {
  .kpi-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}
@media (max-width: 760px) {
  .kpi-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
</style>
