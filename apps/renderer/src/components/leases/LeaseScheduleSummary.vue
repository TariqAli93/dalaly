<script setup lang="ts">
import { computed } from "vue";
import { installmentCount } from "../../constants/leases";
import { formatAmount, formatDate } from "../../utils/format";
import type { Currency, LeaseSchedule } from "../../types";

/**
 * جدول الأقساط قبل حفظ الإيجار: عددها ومجموعها، وأولها وآخرها. الفترة
 * التي يقطعها تاريخ الانتهاء تُعلَّم، لأن قسطها حصة أيامها من البدل.
 */
const props = defineProps<{
  schedule: LeaseSchedule | null;
  error?: string;
  currency: Currency;
}>();

const rows = computed(() => {
  const list = props.schedule?.installments ?? [];
  if (list.length <= 4) return list;
  return [...list.slice(0, 2), null, list.at(-1)!];
});
const cut = computed(
  () => props.schedule?.installments.filter((row) => !row.full) ?? [],
);
</script>

<template>
  <section class="lease-schedule" aria-label="جدول الأقساط" aria-live="polite">
    <v-alert v-if="error" type="warning" variant="tonal" density="compact">{{
      error
    }}</v-alert>
    <p v-else-if="!schedule" class="lease-schedule__empty">
      يظهر جدول الأقساط حين يُكتب البدل وتاريخا البدء والانتهاء.
    </p>
    <template v-else>
      <p class="lease-schedule__head">
        <strong>{{ installmentCount(schedule.installments.length) }}</strong>
        مجموعها
        <bdi>{{ formatAmount(schedule.total, currency) }}</bdi
        >، يُستحق كل قسط في أول يوم من فترته.
      </p>
      <v-table density="compact">
        <thead>
          <tr>
            <th scope="col">#</th>
            <th scope="col">الفترة</th>
            <th scope="col" class="lease-schedule__amount">القسط</th>
          </tr>
        </thead>
        <tbody>
          <template
            v-for="(row, index) in rows"
            :key="row?.seq ?? `gap-${index}`"
          >
            <tr v-if="row">
              <td>{{ row.seq }}</td>
              <td>
                {{ formatDate(row.period_start) }} ←
                {{ formatDate(row.period_end) }}
                <v-chip
                  v-if="!row.full"
                  size="x-small"
                  variant="tonal"
                  color="warning"
                  label
                  >فترة ناقصة</v-chip
                >
              </td>
              <td class="lease-schedule__amount">
                <bdi>{{ formatAmount(row.amount, currency) }}</bdi>
              </td>
            </tr>
            <tr v-else>
              <td colspan="3" class="text-medium-emphasis">…</td>
            </tr>
          </template>
        </tbody>
      </v-table>
      <p v-if="cut.length" class="lease-schedule__note">
        تاريخ الانتهاء يقطع الفترة الأخيرة، فقسطها حصة أيامها من البدل.
      </p>
    </template>
  </section>
</template>

<style scoped>
.lease-schedule {
  margin-top: 8px;
}
.lease-schedule__empty,
.lease-schedule__note {
  margin: 0;
  font-size: 0.8125rem;
  color: rgb(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}
.lease-schedule__head {
  margin: 0 0 4px;
  font-size: 0.875rem;
}
.lease-schedule__amount {
  text-align: end;
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}
</style>
