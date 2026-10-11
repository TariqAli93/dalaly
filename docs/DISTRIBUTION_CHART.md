# Property-type distribution

`DistributionChart.vue` renders a Chart.js doughnut using the existing
`items` and `label` props. The dashboard supplies these items from the authenticated
`GET /api/dashboard/summary` endpoint; the component does not generate sample data
or make an additional database request.

- Sales use `sales.by_type`, aggregated from `properties`.
- Rentals use `rentals.by_type`, aggregated independently from `rentals`.
- Both queries count all rows where `status != 'archived'`, grouped by
  `property_type`, without a top-six cutoff. Completed but non-archived offers are
  still included, matching the existing dashboard totals.
- The center total is the sum of those database counts. Each percentage uses that
  total, and the Arabic labels explicitly describe non-archived offers.
- Data refreshes, theme changes, and appearance settings update the chart. Empty
  datasets show the existing empty-state component instead of fabricated slices.

There is no schema migration, endpoint change, or permission change.

Install dependencies with `pnpm install`, then verify with `pnpm lint` and
`pnpm build`. Chart.js and its color dependency are pinned in `pnpm-lock.yaml`
with published integrity hashes. A network-enabled install is required if these
packages are not already cached.
