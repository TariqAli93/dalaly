<script setup lang="ts">
import { computed, nextTick, ref, watch } from "vue";
import { useRouter } from "vue-router";
import LeaseScheduleSummary from "./LeaseScheduleSummary.vue";
import * as leasesService from "../../services/leases.service";
import { getErrorMessage } from "../../services/api.service";
import { leasePerPeriod } from "../../constants/leases";
import { formatAmount, formatDate } from "../../utils/format";
import type { AgreementLeaseDraft, LeaseDetail } from "../../types";

/**
 * تفعيل عقد إيجار صادر: يصير إيجاراً سارياً ببدل نسخته الصادرة ودوريتها
 * ومدتها وتأمينها، وبمؤجره ومستأجره وعرضه، ويُكتب جدول أقساطه. يُفعَّل العقد
 * مرة واحدة؛ إن كان مفعَّلاً يدل الحوار على إيجاره.
 */
const open = defineModel<boolean>({ required: true });
const props = defineProps<{
  agreementId: number;
  /** The contract's parties, for their names. */
  parties?: Array<{ role: string; full_name: string }>;
}>();
const emit = defineEmits<{ activated: [LeaseDetail] }>();
const router = useRouter();

const draft = ref<AgreementLeaseDraft | null>(null);
const loading = ref(false);
const saving = ref(false);
const error = ref("");
const officeCollects = ref(false);
const notes = ref("");
let opener: HTMLElement | null = null;

const nameOf = (role: string) =>
  props.parties?.find((party) => party.role === role)?.full_name ?? "—";
const schedule = computed(() =>
  draft.value?.lease
    ? { installments: draft.value.installments, total: draft.value.total_rent }
    : null,
);

watch(open, async (isOpen) => {
  if (!isOpen) {
    const target = opener;
    opener = null;
    if (target?.isConnected) void nextTick(() => target.focus());
    return;
  }
  opener = document.activeElement as HTMLElement | null;
  draft.value = null;
  error.value = "";
  officeCollects.value = false;
  notes.value = "";
  loading.value = true;
  try {
    draft.value = await leasesService.getAgreementLease(props.agreementId);
  } catch (cause) {
    error.value = getErrorMessage(cause);
  } finally {
    loading.value = false;
  }
});

async function activate() {
  if (saving.value || !draft.value?.lease || draft.value.problem) return;
  saving.value = true;
  error.value = "";
  try {
    const lease = await leasesService.activateLease({
      agreement_id: props.agreementId,
      office_collects: officeCollects.value,
      notes: notes.value.trim() || null,
    });
    open.value = false;
    emit("activated", lease);
  } catch (cause) {
    error.value = getErrorMessage(cause);
  } finally {
    saving.value = false;
  }
}
function openExisting() {
  const existing = draft.value?.existing_lease;
  if (!existing) return;
  open.value = false;
  void router.push(`/leases/${existing.id}`);
}
</script>

<template>
  <v-dialog
    v-model="open"
    max-width="680"
    scrollable
    :persistent="saving"
    aria-labelledby="lease-activate-title"
  >
    <v-card tag="form" @submit.prevent="activate">
      <v-card-title id="lease-activate-title">
        تفعيل الإيجار{{ draft ? ` — العقد ${draft.agreement_code}` : "" }}
      </v-card-title>
      <v-divider />
      <v-card-text>
        <v-progress-linear v-if="loading" indeterminate />
        <v-alert v-if="error" type="error" variant="tonal" class="mb-3">{{
          error
        }}</v-alert>
        <template v-if="draft">
          <v-alert
            v-if="draft.existing_lease"
            type="info"
            variant="tonal"
            class="mb-3"
          >
            العقد مفعَّل بالإيجار
            <bdi>{{ draft.existing_lease.code }}</bdi
            >. يُلغى ذلك الإيجار أولاً لتفعيله من جديد.
            <template #append>
              <v-btn variant="text" size="small" @click="openExisting"
                >فتح الإيجار</v-btn
              >
            </template>
          </v-alert>
          <v-alert
            v-else-if="draft.problem"
            type="warning"
            variant="tonal"
            class="mb-3"
            >{{ draft.problem }}</v-alert
          >
          <template v-if="draft.lease && !draft.existing_lease">
            <p class="text-body-2 text-medium-emphasis mb-2">
              من النسخة الصادرة
              <bdi>{{ draft.agreement_revision }}</bdi> للعقد. شروطه لا تتغير
              بعد التفعيل.
            </p>
            <dl class="lease-activate__facts">
              <div>
                <dt>المؤجر</dt>
                <dd>{{ nameOf("landlord") }}</dd>
              </div>
              <div>
                <dt>المستأجر</dt>
                <dd>{{ nameOf("tenant") }}</dd>
              </div>
              <div>
                <dt>البدل</dt>
                <dd>
                  <bdi>{{
                    formatAmount(draft.lease.rent_amount, draft.lease.currency)
                  }}</bdi>
                  {{ leasePerPeriod(draft.lease.frequency) }}
                </dd>
              </div>
              <div>
                <dt>المدة</dt>
                <dd>
                  {{ formatDate(draft.lease.start_date) }} ←
                  {{ formatDate(draft.lease.end_date) }}
                </dd>
              </div>
              <div>
                <dt>التأمين</dt>
                <dd>
                  <bdi>{{
                    draft.lease.deposit
                      ? formatAmount(draft.lease.deposit, draft.lease.currency)
                      : "—"
                  }}</bdi>
                </dd>
              </div>
            </dl>
            <LeaseScheduleSummary
              :schedule="schedule"
              :currency="draft.lease.currency"
            />
            <v-switch
              v-model="officeCollects"
              class="mt-2"
              color="primary"
              hide-details
              label="المكتب يقبض الإيجار لحساب المؤجر"
            />
            <v-text-field
              v-model="notes"
              class="mt-2"
              label="ملاحظة (اختياري)"
              hide-details
            />
          </template>
        </template>
      </v-card-text>
      <v-divider />
      <v-card-actions>
        <v-spacer />
        <v-btn variant="text" :disabled="saving" @click="open = false"
          >إغلاق</v-btn
        >
        <v-btn
          v-if="draft?.lease && !draft.problem && !draft.existing_lease"
          color="primary"
          variant="flat"
          type="submit"
          :loading="saving"
          prepend-icon="mdi-home-clock-outline"
          >تفعيل الإيجار</v-btn
        >
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<style scoped>
.lease-activate__facts {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(11rem, 1fr));
  gap: 10px 20px;
  margin: 0 0 8px;
}
.lease-activate__facts dt {
  font-size: 0.75rem;
  color: rgb(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}
.lease-activate__facts dd {
  margin: 0;
  font-weight: 600;
}
</style>
