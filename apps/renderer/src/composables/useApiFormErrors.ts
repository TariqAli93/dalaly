import { ref } from "vue";
import { ApiError, getErrorMessage } from "../services/api.service";

/**
 * أخطاء الخادم على حقولها: issues[].field يصير رسالة تحت الحقل نفسه،
 * وDUPLICATE_PLOT (409) تحت رقم القطعة. ما لا يقابل حقلاً يُعاد رسالةً عامة.
 * الأسماء كما في الطلب (snake_case)، وaliases لحقل يحمل اسماً آخر في النموذج.
 */
export function useApiFormErrors(aliases: Record<string, string> = {}) {
  const errors = ref<Record<string, string[]>>({});

  function clear(field?: string) {
    if (!field) errors.value = {};
    else if (errors.value[field]) {
      const { [field]: _removed, ...rest } = errors.value;
      errors.value = rest;
    }
  }

  /** يوزّع الخطأ على الحقول، ويعيد ما يُعرض عاماً (أو null إن غطّته الحقول). */
  function apply(cause: unknown): string | null {
    errors.value = {};
    if (cause instanceof ApiError) {
      if (cause.code === "DUPLICATE_PLOT") {
        errors.value = { plot_number: [cause.message] };
        return null;
      }
      if (cause.issues.length) {
        const next: Record<string, string[]> = {};
        for (const issue of cause.issues) {
          const field = aliases[issue.field] ?? issue.field;
          (next[field] ??= []).push(issue.message);
        }
        errors.value = next;
        return "تعذر الحفظ: صحّح الحقول المعلّمة بالأحمر.";
      }
    }
    return getErrorMessage(cause);
  }

  const messages = (field: string) => errors.value[field] ?? [];
  const fields = () => Object.keys(errors.value);

  return { errors, apply, clear, messages, fields };
}
