import { createI18n } from "vue-i18n";
import ar from "../locales/ar.json";

export const i18n = createI18n({
  legacy: false,
  globalInjection: true,
  locale: "ar",
  fallbackLocale: "ar",
  messages: { ar },
  datetimeFormats: {
    ar: {
      short: {
        calendar: "gregory",
        numberingSystem: "latn",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      },
      long: {
        calendar: "gregory",
        numberingSystem: "latn",
        year: "numeric",
        month: "long",
        day: "numeric",
      },
    },
  },
  numberFormats: {
    ar: {
      integer: {
        style: "decimal",
        useGrouping: true,
        maximumFractionDigits: 0,
      },
      currencyIQD: {
        style: "currency",
        currency: "IQD",
        currencyDisplay: "symbol",
        maximumFractionDigits: 0,
      },
    },
  },
  missingWarn: import.meta.env.DEV,
  fallbackWarn: import.meta.env.DEV,
});
