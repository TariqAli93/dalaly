import {
  computed,
  onBeforeUnmount,
  onMounted,
  ref,
  shallowRef,
  type Ref,
} from "vue";
import { useRouter } from "vue-router";
import { platform } from "../platform";
import { useConfirm } from "./useConfirm";

/**
 * نماذج الصفحات المفتوحة الآن، كي تُحفظ تعديلاتها مسودةً قبل خروج قسري
 * (الخمول أو انتهاء الجلسة) لا يُسأل فيه المستخدم.
 */
type DraftSource = { key: string; dirty: () => boolean; data: () => unknown };
const openForms = new Set<DraftSource>();
const DRAFT_PREFIX = "dalaly.draft.";
// يُفعَّل لخروج قسري واحد فلا يعترضه سؤال «تجاهل التعديلات؟».
let forcedLeave = false;

type StoredDraft = { savedAt: number; data: unknown };

function readDraft(key: string): StoredDraft | null {
  try {
    const raw = sessionStorage.getItem(DRAFT_PREFIX + key);
    return raw ? (JSON.parse(raw) as StoredDraft) : null;
  } catch {
    return null;
  }
}

function removeDraft(key: string) {
  try {
    sessionStorage.removeItem(DRAFT_PREFIX + key);
  } catch {
    // التخزين محجوب: لا مسودة أصلاً.
  }
}

/**
 * يحفظ كل نموذج معدَّل مسودةً في sessionStorage ويسمح بالمغادرة التالية دون
 * سؤال. يُستدعى قبل تسجيل الخروج بالخمول أو عند 401.
 */
export function stashOpenDrafts() {
  // بلا نموذج مفتوح لا حارس يستهلك الإذن، فيبقى ويعطّل سؤال نموذج لاحق.
  forcedLeave = openForms.size > 0;
  for (const form of openForms) {
    if (!form.dirty()) continue;
    try {
      sessionStorage.setItem(
        DRAFT_PREFIX + form.key,
        JSON.stringify({ savedAt: Date.now(), data: form.data() }),
      );
    } catch {
      // التخزين محجوب أو ممتلئ: لا يُمنع الخروج من أجله.
    }
  }
}

const serialize = (value: unknown) => JSON.stringify(value);

/**
 * يحمي نموذج صفحة من فقدان ما لم يُحفظ: يقارن بآخر نسخة حُمّلت أو حُفظت،
 * ويسأل قبل مغادرة المسار، ويعرض مسودة محفوظة من خروج قسري سابق.
 *
 * key يميّز السجل ("property:12" أو "property:new") كي لا تُستعاد مسودة
 * سجل في سجل آخر.
 */
export function useDirtyForm<T>(form: Ref<T>, key: () => string) {
  const router = useRouter();
  const { confirmAsync } = useConfirm();
  const snapshot = ref(serialize(form.value));
  const isDirty = computed(() => serialize(form.value) !== snapshot.value);
  const draft = shallowRef<StoredDraft | null>(null);

  /** بعد تحميل السجل (أو تهيئة نموذج جديد): هذا هو الأصل، وتُعرض مسودته إن وُجدت. */
  function markLoaded() {
    snapshot.value = serialize(form.value);
    draft.value = readDraft(key());
  }

  /** بعد حفظ ناجح: لا تعديلات معلّقة، والمسودة القديمة صارت بلا معنى. */
  function markSaved() {
    snapshot.value = serialize(form.value);
    discardDraft();
  }

  function restoreDraft() {
    if (!draft.value) return;
    form.value = draft.value.data as T;
    removeDraft(key());
    draft.value = null;
  }

  function discardDraft() {
    removeDraft(key());
    draft.value = null;
  }

  const source: DraftSource = {
    get key() {
      return key();
    },
    dirty: () => isDirty.value,
    data: () => form.value,
  };

  // حارس عام لا onBeforeRouteLeave: هذا يرتبط بسجل المسار وقت التركيب، وصفحة
  // الإضافة نفسها تصير صفحة التعديل بعد الحفظ (المكوّن يُعاد استخدامه)، فيسكت
  // الحارس هناك.
  async function guardLeave() {
    if (forcedLeave) {
      forcedLeave = false;
      return true;
    }
    if (!isDirty.value) return true;
    return confirmAsync({
      title: "تعديلات غير محفوظة",
      body: "في هذا النموذج تعديلات لم تُحفظ بعد. إن غادرت الآن ستضيع.",
      confirmText: "مغادرة دون حفظ",
      color: "error",
    });
  }
  let removeGuard: (() => void) | null = null;

  // إغلاق النافذة أو التبويب: المتصفح يسأل بنفسه، وElectron يسأل في عمليته
  // الرئيسية (will-prevent-unload). نسخة سطح مكتب أقدم لا تسأل، فتبقى نافذتها
  // معلّقة بلا سؤال؛ لذا لا يُلغى الإغلاق إلا حيث يوجد من يسأل.
  function onBeforeUnload(event: BeforeUnloadEvent) {
    if (!isDirty.value) return;
    event.preventDefault();
    event.returnValue = "";
  }

  onMounted(() => {
    openForms.add(source);
    removeGuard = router.beforeEach((to, from) =>
      to.path === from.path ? true : guardLeave(),
    );
    if (platform.guardsUnsavedClose)
      window.addEventListener("beforeunload", onBeforeUnload);
  });
  onBeforeUnmount(() => {
    openForms.delete(source);
    removeGuard?.();
    window.removeEventListener("beforeunload", onBeforeUnload);
  });

  return { isDirty, draft, markLoaded, markSaved, restoreDraft, discardDraft };
}
