# Monthly offer trend

`OfferTrendChart.vue` uses the installed Chart.js dependency to render a bar chart
from the dashboard's `sales.monthly_activity` or `rentals.monthly_activity` data.
It retains the existing `points` and `label` props and makes no extra API requests.

The existing `/api/dashboard/summary` endpoint now returns six ordered calendar
months, including the current month, using `Asia/Baghdad` boundaries. PostgreSQL
generates the month buckets and counts matching records from `properties` or
`rentals`; months without records return zero. The renderer uses those returned
months directly instead of recreating the window from the computer's UTC clock.

Existing status rules are preserved: sales exclude archived properties, while
the rental creation trend includes all rental statuses. Sale and rental records
remain separate. API fields and permissions are unchanged; no migration is needed.

Zero counts have no artificial minimum-height bars. Arabic tooltips include the
month and year, axes use whole-number counts, and the chart updates when data,
theme, or typography changes. Empty input shows the shared empty state; an
all-zero period still displays its actual months and zero values.

Validate with `pnpm lint` and `pnpm build`.
