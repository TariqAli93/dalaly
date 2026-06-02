<script setup lang="ts">
import { onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import AppLayout from "../layouts/AppLayout.vue";
import { fetchDashboard } from "../services/dashboard.service";
import { createBackup } from "../services/backup.service";
import { getErrorMessage } from "../services/api.service";
import { usePermissions } from "../composables/usePermissions";
import { useSnackbar } from "../composables/useSnackbar";
import { useRefresh } from "../composables/useRefresh";
import { statusLabel } from "../constants/domain";
import { formatMoney } from "../utils/format";
import type { DashboardSummary } from "../types";

const router = useRouter();
const { can } = usePermissions();
const { notifySuccess, notifyError } = useSnackbar();
const { setRefreshHandler } = useRefresh();

const data = ref<DashboardSummary | null>(null);
const loading = ref(false);
const backupRunning = ref(false);

const statusCards = [
  {
    key: "total",
    label: "إجمالي العروض",
    color: "primary",
    icon: "mdi-home-city",
  },
  {
    key: "available",
    label: "متاح",
    color: "primary",
    icon: "mdi-check-circle-outline",
  },
  {
    key: "reserved",
    label: "محجوز",
    color: "accent",
    icon: "mdi-bookmark-outline",
  },
  {
    key: "negotiating",
    label: "قيد التفاوض",
    color: "warning",
    icon: "mdi-handshake-outline",
  },
  { key: "sold", label: "مباع", color: "secondary", icon: "mdi-cash-check" },
  { key: "rented", label: "مؤجر", color: "info", icon: "mdi-key-outline" },
] as const;

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

async function load() {
  loading.value = true;
  try {
    data.value = await fetchDashboard();
  } catch (error) {
    notifyError(getErrorMessage(error));
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
  return new Date(value).toLocaleString("ar-IQ", { numberingSystem: "latn" });
}
function daysSince(value: string) {
  return Math.floor((Date.now() - new Date(value).getTime()) / 86400000);
}

onMounted(() => {
  setRefreshHandler(load);
  void load();
});
</script>

<template>
  <AppLayout title="لوحة التحكم" subtitle="نظرة شاملة على نشاط المكتب.">
    <template v-if="loading && !data">
      <v-skeleton-loader type="card, card, card" />
    </template>
    <template v-else-if="data">
      <!-- بطاقات الحالات -->
      <div class="kpi-grid mb-4">
        <v-card
          v-for="card in statusCards"
          :key="card.key"
          rounded="lg"
          variant="flat"
          border
        >
          <v-card-text class="d-flex align-center ga-3">
            <v-avatar :color="card.color" variant="tonal" rounded="lg">
              <v-icon :icon="card.icon" />
            </v-avatar>
            <div>
              <div class="text-body-2 text-medium-emphasis">
                {{ card.label }}
              </div>
              <div class="text-h5 font-weight-bold">
                {{ data.counts[card.key] }}
              </div>
            </div>
          </v-card-text>
        </v-card>
      </div>

      <!-- إجراءات سريعة -->
      <v-card rounded="lg" variant="flat" border class="mb-4">
        <v-card-title>إجراءات سريعة</v-card-title>
        <v-card-text class="d-flex flex-wrap ga-2">
          <v-btn
            v-if="can('properties.create')"
            variant="tonal"
            prepend-icon="mdi-home-plus"
            @click="router.push('/properties/new')"
          >
            إضافة عرض
          </v-btn>
          <v-btn
            v-if="can('locations.manage')"
            variant="tonal"
            prepend-icon="mdi-map-marker-plus"
            @click="router.push('/locations')"
          >
            إضافة محافظة
          </v-btn>
          <v-btn
            v-if="can('backups.create')"
            variant="tonal"
            prepend-icon="mdi-database-export"
            :loading="backupRunning"
            @click="runBackup"
          >
            إنشاء نسخة احتياطية
          </v-btn>
          <v-btn
            v-if="can('users.create')"
            variant="tonal"
            prepend-icon="mdi-account-plus"
            @click="router.push('/users')"
          >
            إضافة مستخدم
          </v-btn>
        </v-card-text>
      </v-card>

      <v-row>
        <!-- تنبيهات المتابعات -->
        <v-col cols="12" md="6">
          <v-card rounded="lg" variant="flat" border>
            <v-card-title>تنبيهات المتابعات</v-card-title>
            <v-card-text>
              <v-empty-state
                v-if="!data.reminders.length"
                icon="mdi-bell-off-outline"
                title="لا توجد تنبيهات"
              />
              <v-list v-else density="compact">
                <v-list-item
                  v-for="r in data.reminders"
                  :key="r.id"
                  :title="`${r.property_code} — ${r.notes || 'متابعة'}`"
                  :subtitle="when(r.scheduled_at)"
                  prepend-icon="mdi-bell-ring-outline"
                />
              </v-list>
            </v-card-text>
          </v-card>
        </v-col>

        <!-- عروض تحتاج مراجعة -->
        <v-col cols="12" md="6">
          <v-card rounded="lg" variant="flat" border>
            <v-card-title>عروض تحتاج مراجعة</v-card-title>
            <v-card-text>
              <v-empty-state
                v-if="!data.needs_review.length"
                icon="mdi-check-all"
                title="كل العروض محدّثة"
              />
              <v-list v-else density="compact">
                <v-list-item
                  v-for="p in data.needs_review.slice(0, 8)"
                  :key="p.id"
                  :title="`${p.code} — ${p.governorate || ''} ${p.district || ''}`"
                  :subtitle="`آخر تحديث منذ ${daysSince(String(p.updated_at))} يوم — راجع المالك`"
                  prepend-icon="mdi-clock-alert-outline"
                  @click="router.push('/properties')"
                />
              </v-list>
            </v-card-text>
          </v-card>
        </v-col>

        <!-- آخر العروض -->
        <v-col cols="12" md="6">
          <v-card rounded="lg" variant="flat" border>
            <v-card-title>آخر العروض</v-card-title>
            <v-empty-state
              v-if="!data.latest.length"
              icon="mdi-history"
              title="لا يوجد عروض"
            />
            <v-list density="compact">
              <v-list-item
                v-for="p in data.latest"
                :key="p.id"
                :title="`${p.code} — ${p.property_type}`"
                :subtitle="`${p.governorate || ''} ${p.district || ''} · ${formatMoney(p.total_price)} دينار`"
              >
                <template #append>
                  <v-chip size="x-small" variant="tonal">{{
                    statusLabel(p.status)
                  }}</v-chip>
                </template>
              </v-list-item>
            </v-list>
          </v-card>
        </v-col>

        <!-- النشاط الأخير -->
        <v-col cols="12" md="6">
          <v-card rounded="lg" variant="flat" border>
            <v-card-title>النشاط الأخير</v-card-title>
            <v-card-text>
              <v-empty-state
                v-if="!data.recent_activity.length"
                icon="mdi-history"
                title="لا يوجد نشاط"
              />
              <v-list v-else density="compact">
                <v-list-item
                  v-for="a in data.recent_activity"
                  :key="a.id"
                  :title="`${ACTION_LABELS[a.action] || a.action} ${a.property_code || ''}`"
                  :subtitle="`${a.user_name || 'النظام'} · ${when(a.created_at)}`"
                />
              </v-list>
            </v-card-text>
          </v-card>
        </v-col>

        <!-- تحليلات المواقع -->
        <v-col cols="12" md="6">
          <v-card rounded="lg" variant="flat" border>
            <v-card-title>أكثر المحافظات نشاطاً</v-card-title>
            <v-card-text>
              <v-chip
                v-for="g in data.top_governorates"
                :key="g.name || ''"
                class="ma-1"
                variant="tonal"
              >
                {{ g.name }} · {{ g.count }}
              </v-chip>
              <v-empty-state
                v-if="!data.top_governorates.length"
                icon="mdi-map-marker-off"
                title="لا توجد بيانات"
              />
            </v-card-text>
          </v-card>
        </v-col>
        <v-col cols="12" md="6">
          <v-card rounded="lg" variant="flat" border>
            <v-card-title>أكثر المناطق نشاطاً</v-card-title>
            <v-card-text>
              <v-chip
                v-for="d in data.top_districts"
                :key="d.name || ''"
                class="ma-1"
                variant="tonal"
              >
                {{ d.name }} · {{ d.count }}
              </v-chip>
              <v-empty-state
                v-if="!data.top_districts.length"
                icon="mdi-map-marker-off"
                title="لا توجد بيانات"
              />
            </v-card-text>
          </v-card>
        </v-col>
      </v-row>
    </template>
  </AppLayout>
</template>

<style scoped>
.kpi-grid {
  display: grid;
  grid-template-columns: repeat(6, minmax(0, 1fr));
  gap: 12px;
}
.financial-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 16px;
}
@media (max-width: 1100px) {
  .kpi-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
  .financial-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
@media (max-width: 600px) {
  .kpi-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
</style>
