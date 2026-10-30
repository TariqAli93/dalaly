<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { useRoute } from "vue-router";
import AppPage from "../components/app/AppPage.vue";
import * as leasesService from "../services/leases.service";
import { getErrorMessage } from "../services/api.service";
import { usePermissions } from "../composables/usePermissions";
import { useRefresh } from "../composables/useRefresh";
import { useSnackbar } from "../composables/useSnackbar";
import {
  installmentCount,
  leaseFrequencyLabel,
  leasePerPeriod,
  leaseStateOf,
} from "../constants/leases";
import { formatAmount, formatDate, formatDateTime } from "../utils/format";
import type { LeaseDetail } from "../types";

/**
 * صفحة الإيجار: طرفاه وعرضه وعقده (بنسخته الصادرة)، وبدله ودوريته ومدته
 * وتأمينه، وجدول أقساطه كما كُتب عند التفعيل. شروطه وجدوله لا تتغير؛ إيجار
 * أُدخل خطأً يُلغى بسبب.
 */
const route = useRoute();
const { can } = usePermissions();
const { setRefreshHandler } = useRefresh();
const { notifySuccess } = useSnackbar();

const lease = ref<LeaseDetail | null>(null);
const loading = ref(false);
const error = ref<string | null>(null);
const id = computed(() => Number(route.params.id));

async function load() {
  loading.value = true;
  error.value = null;
  try {
    lease.value = await leasesService.getLease(id.value);
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

const money = (value: string | null) =>
  formatAmount(value, lease.value?.currency);
const state = computed(() => leaseStateOf(lease.value?.state ?? ""));

const cancelDialog = ref(false);
const cancelReason = ref("");
const cancelError = ref("");
const cancelling = ref(false);
function openCancel() {
  cancelReason.value = "";
  cancelError.value = "";
  cancelDialog.value = true;
}
async function confirmCancel() {
  const current = lease.value;
  if (!current || cancelling.value) return;
  if (!cancelReason.value.trim()) {
    cancelError.value = "اذكر سبب إلغاء الإيجار.";
    return;
  }
  cancelling.value = true;
  cancelError.value = "";
  try {
    lease.value = await leasesService.cancelLease(
      current.id,
      cancelReason.value.trim(),
    );
    cancelDialog.value = false;
    notifySuccess(`أُلغي الإيجار ${current.code}.`);
  } catch (cause) {
    cancelError.value = getErrorMessage(cause);
  } finally {
    cancelling.value = false;
  }
}
</script>

<template>
  <AppPage
    :title="lease ? `الإيجار ${lease.code}` : 'الإيجار'"
    :parent="{ to: '/leases', label: 'الإيجارات السارية' }"
  >
    <template v-if="lease?.status === 'active'" #header-actions>
      <v-btn
        v-if="can('leases.manage')"
        variant="text"
        color="error"
        prepend-icon="mdi-cancel"
        @click="openCancel"
        >إلغاء الإيجار</v-btn
      >
    </template>

    <v-progress-linear v-if="loading && !lease" indeterminate />
    <v-alert v-else-if="error" type="error" variant="tonal">
      {{ error }}
      <template #append>
        <v-btn variant="text" size="small" @click="load">إعادة المحاولة</v-btn>
      </template>
    </v-alert>

    <template v-else-if="lease">
      <section class="dal-panel lease" aria-label="بيانات الإيجار">
        <div class="lease__head">
          <div>
            <p class="text-caption text-medium-emphasis mb-1">المستأجر</p>
            <h2 class="text-h6">
              <router-link
                v-if="lease.tenant_person_id"
                :to="`/clients/${lease.tenant_person_id}`"
                >{{ lease.tenant_name }}</router-link
              >
              <template v-else>—</template>
            </h2>
          </div>
          <v-chip size="small" variant="tonal" label :color="state.color">{{
            state.title
          }}</v-chip>
        </div>

        <div class="lease__figures">
          <div>
            <span>البدل {{ leasePerPeriod(lease.frequency) }}</span>
            <bdi>{{ money(lease.rent_amount) }}</bdi>
          </div>
          <div>
            <span>مجموع الأقساط</span>
            <bdi>{{ money(lease.total_rent) }}</bdi>
          </div>
          <div>
            <span>القسط القادم</span>
            <bdi>{{
              lease.status === "active" && lease.next_due_date
                ? formatDate(lease.next_due_date)
                : "—"
            }}</bdi>
          </div>
        </div>

        <v-alert
          v-if="lease.status === 'cancelled'"
          type="error"
          variant="tonal"
          density="compact"
          class="mb-3"
        >
          أُلغي
          <span v-if="lease.cancelled_at">{{
            formatDateTime(lease.cancelled_at)
          }}</span
          >: {{ lease.cancel_reason }}
        </v-alert>

        <dl class="lease__facts">
          <div>
            <dt>المؤجر</dt>
            <dd>
              <router-link
                v-if="lease.landlord_person_id"
                :to="`/clients/${lease.landlord_person_id}`"
                >{{ lease.landlord_name }}</router-link
              >
              <template v-else>—</template>
            </dd>
          </div>
          <div>
            <dt>المدة</dt>
            <dd>
              {{ formatDate(lease.start_date) }} ←
              {{ formatDate(lease.end_date) }}
            </dd>
          </div>
          <div>
            <dt>دورية الدفع</dt>
            <dd>{{ leaseFrequencyLabel(lease.frequency) }}</dd>
          </div>
          <div>
            <dt>التأمين</dt>
            <dd>
              <bdi>{{ lease.deposit ? money(lease.deposit) : "—" }}</bdi>
            </dd>
          </div>
          <div>
            <dt>العرض</dt>
            <dd>
              <router-link
                v-if="lease.rental_id"
                :to="`/rentals/${lease.rental_id}`"
                ><bdi>{{ lease.rental_code }}</bdi>
                {{ lease.rental_name ?? "" }}</router-link
              >
              <template v-else>—</template>
            </dd>
          </div>
          <div>
            <dt>العقد</dt>
            <dd>
              <template v-if="lease.agreement_id">
                <router-link :to="`/contracts/${lease.agreement_id}`"
                  ><bdi>{{ lease.agreement_code }}</bdi></router-link
                >
                <small> (النسخة {{ lease.agreement_revision }})</small>
              </template>
              <template v-else>بلا عقد في النظام</template>
            </dd>
          </div>
          <div>
            <dt>قبض الإيجار</dt>
            <dd>
              {{
                lease.office_collects
                  ? "يقبضه المكتب لحساب المؤجر"
                  : "يدفعه المستأجر للمؤجر مباشرة"
              }}
            </dd>
          </div>
          <div>
            <dt>أُدخل</dt>
            <dd>
              {{ formatDateTime(lease.created_at) }}
              <template v-if="lease.created_by_name">
                · {{ lease.created_by_name }}</template
              >
            </dd>
          </div>
          <div v-if="lease.notes" class="lease__wide">
            <dt>ملاحظة</dt>
            <dd>{{ lease.notes }}</dd>
          </div>
        </dl>
      </section>

      <section class="dal-panel lease-part mt-4" aria-label="جدول الأقساط">
        <h3 class="lease-part__title">
          جدول الأقساط
          <span class="text-medium-emphasis"
            >({{ installmentCount(lease.installment_count) }})</span
          >
        </h3>
        <v-table density="compact">
          <thead>
            <tr>
              <th scope="col">#</th>
              <th scope="col">الفترة</th>
              <th scope="col">يُستحق في</th>
              <th scope="col" class="lease-amount">القسط</th>
              <th scope="col"><span class="d-sr-only">الحالة</span></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in lease.installments" :key="row.id">
              <td>{{ row.seq }}</td>
              <td>
                {{ formatDate(row.period_start) }} ←
                {{ formatDate(row.period_end) }}
              </td>
              <td>{{ formatDate(row.due_date) }}</td>
              <td class="lease-amount">
                <bdi>{{ money(row.amount) }}</bdi>
              </td>
              <td>
                <span
                  v-if="lease.status === 'active'"
                  :class="row.state === 'due' ? '' : 'text-medium-emphasis'"
                  >{{ row.state === "due" ? "حلّ موعده" : "قادم" }}</span
                >
              </td>
            </tr>
          </tbody>
        </v-table>
      </section>
    </template>

    <v-dialog v-model="cancelDialog" max-width="480" :persistent="cancelling">
      <v-card tag="form" @submit.prevent="confirmCancel">
        <v-card-title>إلغاء الإيجار {{ lease?.code }}</v-card-title>
        <v-card-text>
          <p class="text-body-2 mb-3">
            لإيجار أُدخل خطأً. يبقى في السجل ملغى بجدوله، ويعود العرض متاحاً إن
            لم يكن له إيجار آخر. يمكن بعدها تفعيل العقد من جديد.
          </p>
          <v-alert
            v-if="cancelError"
            type="error"
            variant="tonal"
            class="mb-3"
            >{{ cancelError }}</v-alert
          >
          <v-text-field
            v-model="cancelReason"
            label="سبب الإلغاء *"
            placeholder="مثلاً: أُدخل بتاريخ بدء خاطئ"
            hide-details
          />
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn
            variant="text"
            :disabled="cancelling"
            @click="cancelDialog = false"
            >تراجع</v-btn
          >
          <v-btn
            color="error"
            variant="flat"
            type="submit"
            :loading="cancelling"
            >إلغاء الإيجار</v-btn
          >
        </v-card-actions>
      </v-card>
    </v-dialog>
  </AppPage>
</template>

<style scoped>
.lease {
  padding: 20px 24px;
}
.lease__head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 16px;
}
.lease__figures {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(10rem, 1fr));
  gap: 12px;
  margin: 12px 0 16px;
}
.lease__figures div {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.lease__figures span {
  font-size: 0.8125rem;
  color: rgb(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}
.lease__figures bdi {
  font-size: 1.15rem;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}
.lease__facts {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(12rem, 1fr));
  gap: 12px 24px;
}
.lease__wide {
  grid-column: 1 / -1;
}
.lease__facts dt {
  font-size: 0.8125rem;
  color: rgb(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}
.lease__facts dd {
  font-weight: 500;
}
.lease-part {
  padding: 12px 16px;
}
.lease-part__title {
  margin: 0 0 8px;
  font-size: 0.95rem;
  font-weight: 700;
}
.lease-amount {
  text-align: end;
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}
</style>
