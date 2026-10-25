<script setup lang="ts">
import type { DashboardMatching, DashboardOverview } from "../../types";
import { formatNumber } from "../../utils/format";
import { moneyText } from "../../utils/listingText";

/**
 * عمليات الإيجار كما يسجّلها النظام: عروض الإيجار بحالاتها وقيمتها الشهرية،
 * وطلبات الإيجار ومطابقتها. لا يسجّل دلالي عقود الإيجار ولا الدفعات، فلا
 * تجديدات ولا دفعات متأخرة هنا، ويقول القسم ذلك بدل عرض بديل.
 */
defineProps<{
  overview: DashboardOverview | null;
  matching: DashboardMatching | null;
}>();
const emit = defineEmits<{ status: [string]; requests: [] }>();

const STATUSES = [
  { key: "available", label: "متاحة", tone: "primary" },
  { key: "negotiating", label: "قيد التفاوض", tone: "warning" },
  { key: "reserved", label: "محجوزة", tone: "warning" },
  { key: "rented", label: "مؤجرة", tone: "success" },
] as const;
</script>

<template>
  <section class="dal-panel rentals" aria-labelledby="rentals-title">
    <header class="dal-panel__header">
      <h2 id="rentals-title" class="dal-section-title">عمليات الإيجار</h2>
    </header>
    <div v-if="!overview">
      <v-skeleton-loader type="list-item-two-line" />
      <v-skeleton-loader type="list-item-two-line" />
    </div>
    <div v-else-if="!overview.rental" class="rentals__body rentals__muted">
      عروض الإيجار غير متاحة لحسابك.
    </div>
    <div v-else class="rentals__body">
      <div class="rentals__statuses">
        <button
          v-for="status in STATUSES"
          :key="status.key"
          type="button"
          class="rentals__status"
          :class="`rentals__status--${status.tone}`"
          @click="emit('status', status.key)"
        >
          <span>{{ status.label }}</span>
          <strong>{{
            formatNumber(overview.rental.counts[status.key], 0)
          }}</strong>
        </button>
      </div>
      <dl class="rentals__figures">
        <div>
          <dt>القيمة الشهرية للمتاح</dt>
          <dd class="money">
            {{ moneyText(overview.rental.available_monthly_value) }}
          </dd>
        </div>
        <div>
          <dt>القيمة الشهرية للمؤجر</dt>
          <dd class="money">
            {{ moneyText(overview.rental.rented_monthly_value) }}
          </dd>
        </div>
        <div>
          <dt>أُجّر خلال {{ overview.recent_days }} يوماً</dt>
          <dd>{{ formatNumber(overview.rental.closed_recently, 0) }}</dd>
        </div>
      </dl>
      <p class="rentals__muted rentals__hint">
        القيم الشهرية: السنوي ÷ 12 ونصف السنوي ÷ 6. "أُجّر" يعدّ ما حالته الآن
        مؤجر وسُجّل تغييرها إلى مؤجر في سجل التغييرات خلال المدة.
      </p>
      <button
        v-if="matching?.counts.rental"
        type="button"
        class="rentals__requests"
        @click="emit('requests')"
      >
        <span
          >طلبات إيجار مفتوحة:
          <strong>{{
            formatNumber(matching.counts.rental.open_requests, 0)
          }}</strong></span
        >
        <span
          >لها مطابقة:
          <strong>{{
            formatNumber(matching.counts.rental.with_matches, 0)
          }}</strong></span
        >
        <span
          >بلا مطابقة:
          <strong>{{
            formatNumber(matching.counts.rental.without_matches, 0)
          }}</strong></span
        >
      </button>
      <div class="rentals__unsupported">
        <v-icon icon="mdi-information-outline" size="16" />
        <span>
          عقود الإيجار ومواعيد انتهائها ودفعات المستأجرين لا تُسجَّل في دلالي
          حالياً، فلا تظهر هنا تجديدات أو دفعات متأخرة.
        </span>
      </div>
    </div>
  </section>
</template>

<style scoped>
.rentals {
  min-width: 0;
}
.rentals__body {
  display: grid;
  gap: 10px;
  padding: 12px 14px;
}
.rentals__statuses {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 8px;
}
.rentals__status {
  display: grid;
  gap: 2px;
  padding: 8px 10px;
  text-align: start;
  border: 1px solid var(--dal-stroke);
  border-radius: var(--dal-radius-control);
  border-top: 3px solid var(--status-tone);
}
.rentals__status:hover {
  background: var(--dal-hover);
}
.rentals__status--primary {
  --status-tone: rgb(var(--v-theme-primary));
}
.rentals__status--warning {
  --status-tone: rgb(var(--v-theme-warning));
}
.rentals__status--success {
  --status-tone: rgb(var(--v-theme-success));
}
.rentals__status span {
  font-size: calc(11.5px * var(--dal-font-scale));
  color: var(--dal-muted);
}
.rentals__status strong {
  font-size: calc(18px * var(--dal-font-scale));
  font-variant-numeric: tabular-nums;
}
.rentals__figures {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
  margin: 0;
}
.rentals__figures dt {
  font-size: calc(11.5px * var(--dal-font-scale));
  color: var(--dal-muted);
}
.rentals__figures dd {
  margin: 0;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  overflow-wrap: anywhere;
}
.rentals__muted {
  color: var(--dal-muted);
  font-size: calc(12px * var(--dal-font-scale));
}
.rentals__hint {
  margin: 0;
  font-size: calc(11px * var(--dal-font-scale));
}
.rentals__requests {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 16px;
  padding: 8px 10px;
  text-align: start;
  font-size: calc(12px * var(--dal-font-scale));
  border: 1px solid var(--dal-stroke);
  border-radius: var(--dal-radius-control);
}
.rentals__requests:hover {
  background: var(--dal-hover);
}
.rentals__requests strong {
  font-variant-numeric: tabular-nums;
}
.rentals__unsupported {
  display: flex;
  gap: 6px;
  align-items: flex-start;
  font-size: calc(11.5px * var(--dal-font-scale));
  color: var(--dal-muted);
}
@media (max-width: 760px) {
  .rentals__statuses {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .rentals__figures {
    grid-template-columns: 1fr;
  }
}
</style>
