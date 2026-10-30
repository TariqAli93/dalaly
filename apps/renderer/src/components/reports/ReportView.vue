<script setup lang="ts">
import { computed } from "vue";
import {
  cellText,
  compareCells,
  currencyTitle,
  type ReportCell,
  type ReportColumn,
  type ReportDocument,
  type ReportRow,
  type ReportTable,
} from "../../utils/reportDocument";
import type { Currency } from "../../types";

/**
 * تقرير على الشاشة: لكل عملة أرقامها الإجمالية ثم جداولها. كل عمود يُرتَّب
 * بالنقر عليه (المبالغ بدقة الفلس)، والبحث يصفّي الصفوف، والخلية المرتبطة
 * بسجل تفتحه. ما يُعرض هنا هو ما يُصدَّر ويُطبع.
 */
const props = defineProps<{
  report: ReportDocument;
  /** Filters every table's rows by their text. */
  search?: string;
}>();

type Item = Record<string, ReportCell> & { __row: ReportRow; __key: number };

const headersOf = (table: ReportTable) =>
  table.columns.map((column) => ({
    key: column.key,
    title: column.title,
    align: (column.kind === "money" || column.kind === "number"
      ? "end"
      : "start") as "end" | "start",
    sortable: true,
    sort: (a: ReportCell, b: ReportCell) => compareCells(a, b, column.kind),
  }));
const itemsOf = (table: ReportTable): Item[] =>
  table.rows.map(
    (row, index) => ({ ...row.cells, __row: row, __key: index }) as Item,
  );
const numeric = (column: ReportColumn) =>
  column.kind === "money" || column.kind === "number";
const negative = (value: ReportCell, column: ReportColumn) =>
  column.kind === "money" && String(value ?? "").startsWith("-");

const empty = computed(() => !props.report.sections.length);
const multi = computed(() => props.report.sections.length > 1);
const text = (value: ReportCell, column: ReportColumn, currency: Currency) =>
  cellText(value, column.kind, currency);
</script>

<template>
  <div class="report">
    <p v-if="empty" class="report__empty">لا بيانات في هذه المدة.</p>
    <section
      v-for="section in report.sections"
      :key="section.currency"
      class="report__section"
      :aria-label="currencyTitle(section.currency)"
    >
      <h2 v-if="multi" class="report__currency">
        {{ currencyTitle(section.currency) }}
      </h2>
      <v-alert
        v-if="section.warning"
        type="error"
        variant="tonal"
        density="compact"
        class="mb-3"
        >{{ section.warning }}</v-alert
      >
      <dl class="report__figures">
        <div v-for="figure in section.figures" :key="figure.label">
          <dt>{{ figure.label }}</dt>
          <dd
            :class="{
              'text-success': figure.tone === 'good',
              'text-error': figure.tone === 'bad',
              'text-warning': figure.tone === 'warn',
            }"
          >
            <bdi>{{
              cellText(figure.value, figure.kind ?? "money", section.currency)
            }}</bdi>
          </dd>
        </div>
      </dl>

      <div
        v-for="table in section.tables"
        :key="table.title"
        class="report__table dal-panel"
      >
        <h3 class="report__title">
          {{ table.title }}
          <span class="text-medium-emphasis">({{ table.rows.length }})</span>
        </h3>
        <v-data-table
          :headers="headersOf(table)"
          :items="itemsOf(table)"
          item-value="__key"
          :search="search || undefined"
          :items-per-page="-1"
          hide-default-footer
          density="compact"
          :no-data-text="
            search ? 'لا صفوف مطابقة للبحث.' : (table.empty ?? 'لا بيانات.')
          "
          :aria-label="table.title"
          class="report__grid"
        >
          <template
            v-for="column in table.columns"
            :key="column.key"
            #[`item.${column.key}`]="{ item }"
          >
            <router-link
              v-if="(item as Item).__row.links?.[column.key]"
              :to="(item as Item).__row.links![column.key]!"
              :class="{ report__num: numeric(column) }"
              >{{
                text((item as Item)[column.key], column, section.currency)
              }}</router-link
            >
            <bdi
              v-else-if="numeric(column)"
              class="report__num"
              :class="{
                'text-error': negative((item as Item)[column.key], column),
                'text-medium-emphasis': (item as Item).__row.tone === 'muted',
                'font-weight-bold': (item as Item).__row.tone === 'strong',
              }"
              >{{
                text((item as Item)[column.key], column, section.currency)
              }}</bdi
            >
            <span
              v-else
              :class="{
                'text-medium-emphasis': (item as Item).__row.tone === 'muted',
                'font-weight-bold': (item as Item).__row.tone === 'strong',
              }"
              >{{
                text((item as Item)[column.key], column, section.currency)
              }}</span
            >
          </template>
          <template v-if="table.total && table.rows.length" #tfoot>
            <tfoot>
              <tr class="report__total">
                <td
                  v-for="column in table.columns"
                  :key="column.key"
                  :class="{ 'text-end': numeric(column) }"
                >
                  <bdi :class="{ report__num: numeric(column) }">{{
                    text(
                      table.total[column.key] ?? null,
                      column,
                      section.currency,
                    )
                  }}</bdi>
                </td>
              </tr>
            </tfoot>
          </template>
        </v-data-table>
      </div>
    </section>
    <ul v-if="report.notes.length" class="report__notes">
      <li v-for="note in report.notes" :key="note">{{ note }}</li>
    </ul>
  </div>
</template>

<style scoped>
.report__empty {
  padding: 24px;
  text-align: center;
  color: rgb(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}
.report__section + .report__section {
  margin-top: 24px;
}
.report__currency {
  margin: 0 0 8px;
  font-size: 1rem;
  font-weight: 700;
}
.report__figures {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(10.5rem, 1fr));
  gap: 10px 16px;
  margin: 0 0 12px;
}
.report__figures dt {
  font-size: 0.75rem;
  color: rgb(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}
.report__figures dd {
  margin: 0;
  font-size: 1.05rem;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}
.report__table {
  padding: 8px 12px 4px;
  margin-bottom: 12px;
  overflow-x: auto;
}
.report__title {
  margin: 4px 0 4px;
  font-size: 0.9rem;
  font-weight: 700;
}
.report__num {
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}
.report__total td {
  font-weight: 700;
  border-top: 2px solid rgb(var(--v-theme-on-surface), 0.25);
  white-space: nowrap;
}
.report__notes {
  margin: 8px 0 0;
  padding-inline-start: 1.25rem;
  font-size: 0.8125rem;
  color: rgb(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}
</style>
