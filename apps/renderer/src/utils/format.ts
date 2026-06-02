export function toNumber(value: unknown) {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numericValue : 0;
}

export function formatMoney(value: unknown) {
  return new Intl.NumberFormat("ar-IQ", {
    maximumFractionDigits: 0,
  }).format(toNumber(value));
}
