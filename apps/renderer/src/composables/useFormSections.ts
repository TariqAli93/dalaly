import { nextTick, ref, type Ref } from "vue";

/** قيمة أدخلها المستخدم أو جاءت من السجل؛ الفراغ والصفر المنطقي لا يُعدّان. */
export function hasValue(value: unknown): boolean {
  if (value === null || value === undefined || value === false) return false;
  if (typeof value === "string") return value.trim() !== "";
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "object") return Object.values(value).some(hasValue);
  return true;
}

/**
 * أقسام اختيارية مطوية في نموذج (FormSection collapsible): القسم مفتوح إن فتحه
 * المستخدم، وإلا إن كان فيه ما يُعرض (سجل يُعدَّل، مسودة مستعادة) أو خطأ من
 * الخادم؛ ونموذج جديد فارغ يبدأ بالحقول الأساسية وحدها. `reveal` يفتح قسم
 * الحقل الخاطئ قبل التركيز عليه، فلا يقع التحقق على حقل مخفي.
 */
export function useFormSections<K extends string>(
  model: Ref<object>,
  fields: Record<K, readonly string[]>,
  errors: () => Record<string, string[]> | undefined = () => undefined,
) {
  const toggled = ref<Partial<Record<K, boolean>>>({});
  const values = () => model.value as Record<string, unknown>;

  const filled = (key: K) =>
    fields[key].filter((field) => hasValue(values()[field])).length;
  const hasError = (key: K) =>
    fields[key].some((field) => (errors()?.[field]?.length ?? 0) > 0);

  /** `fallback`: مفتوح أيضاً ما لم يطوه المستخدم (قسم الحالة عند التعديل). */
  function isOpen(key: K, fallback = false) {
    return (
      hasError(key) || (toggled.value[key] ?? (filled(key) > 0 || fallback))
    );
  }
  function setOpen(key: K, open: boolean) {
    toggled.value = { ...toggled.value, [key]: open };
  }
  /** ما يُكتب بجانب عنوان القسم: هل فيه بيانات، أم هو اختياري فارغ. */
  function summary(key: K) {
    return filled(key) ? "فيه بيانات" : "اختياري";
  }
  /** يفتح القسم الذي يحوي العنصر (data-section) قبل التركيز عليه. */
  async function reveal(element: Element | null) {
    const key = element?.closest<HTMLElement>("[data-section]")?.dataset
      .section as K | undefined;
    if (!key || !(key in fields) || isOpen(key)) return;
    setOpen(key, true);
    await nextTick();
  }

  return { isOpen, setOpen, summary, reveal };
}
