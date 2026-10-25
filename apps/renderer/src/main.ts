import "@mdi/font/css/materialdesignicons.css";
import "vuetify/styles";
import "./styles.css";

import { createApp, nextTick } from "vue";
import { createVuetify } from "vuetify";
import { ar } from "vuetify/locale";
import App from "./App.vue";
import { router } from "./router";
import { i18n } from "./plugins/i18n";
import {
  configuredThemes,
  initializeAppearance,
} from "./composables/useAppearance";
import { setUnauthorizedHandler } from "./services/api.service";
import { useAuth } from "./composables/useAuth";
import { useSetup } from "./composables/useSetup";
import { stashOpenDrafts } from "./composables/useDirtyForm";

// Startup marks, read by scripts/perf/startup-trace.mjs.
performance.mark("dalaly:modules-evaluated");
initializeAppearance();
// Components and directives are imported per template by vite-plugin-vuetify.
// ─── الثيم الابتدائي ─────────────────────────────────────────────────
// localStorage قد يرمي استثناءً (تخزين معطَّل أو بيانات موقع محظورة)،
// فلا نترك قراءته تُسقط التطبيق قبل أن يُرسم. وإن لم يختر المستخدم ثيماً
// بعد، نتبع ثيم Windows كما تفعل برامج سطح المكتب.
const THEME_KEY = "dalaly.theme";

function initialTheme() {
  try {
    const saved = localStorage.getItem(THEME_KEY);
    if (saved === "dalalyDark" || saved === "dalalyLight") return saved;
  } catch {
    // التخزين غير متاح — نكمل بتفضيل النظام
  }
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches
    ? "dalalyDark"
    : "dalalyLight";
}

// ─── إعدادات مشتركة ──────────────────────────────────────────────────
// كثافة سطح المكتب: حقول بإطار ومضغوطة (40px) — لغة برامج Windows لا
// لغة الويب. hideDetails:"auto" يحذف شريط الرسائل (22px) المحجوز تحت كل
// حقل ولا يُظهره إلا عند خطأ تحقق أو hint، وهو أكبر مكسب في كثافة النماذج.
const field = {
  variant: "outlined",
  density: "compact",
  rounded: "lg",
  // hideDetails: "auto",
};

const selection = {
  density: "compact",
  // hideDetails: "auto",
  color: "primary",
};

// hover: تظليل الصف تحت المؤشر، من أساسيات جداول سطح المكتب.
const table = { density: "compact", hover: true };

const vuetify = createVuetify({
  locale: {
    locale: "ar",
    // Vuetify يضمّن الإنجليزية دائماً، فنجعلها الاحتياط: أي مفتاح ناقص
    // في ar يظهر بالإنجليزية بدل اسم المفتاح الخام وخطأ في console.
    fallback: "en",
    messages: { ar },
    // فاصل عشري ثابت لـ VNumberInput: "ar" تُنسَّق بأرقام هندية و"٫"
    // في محركات ICU القديمة وبأرقام لاتينية و"." في الحديثة — نوحّدها.
    decimalSeparator: ".",
    // حُذف rtl: { ar: true } — العربية RTL افتراضياً، وتمرير الكائن
    // كان يستبدل جدول Vuetify كله بدل أن يضيف إليه.
  },

  defaults: {
    // بلا موجة النقر (ripple) — أوضح أثر لـ Material. حالات hover
    // والضغط تبقى كما هي.
    global: { ripple: false },

    VTextField: field,
    VSelect: field,
    VAutocomplete: field,
    VCombobox: field,
    VTextarea: field,
    VNumberInput: field, // Vuetify 3.8+؛ الإصدارات الأقدم تتجاهل المفتاح
    // الأيقونة داخل الحقل بدل خارجه، فيصطف مع بقية حقول النموذج بدل أن
    // يُزاح بعرض الأيقونة.
    VFileInput: { ...field, prependIcon: "", prependInnerIcon: "$file" },

    VCheckbox: selection,
    VRadioGroup: selection,
    VSwitch: { ...selection, inset: true }, // مفتاح كبسولي بأسلوب Windows 11

    // variant:"flat" بدل elevation:0 — الأخيرة تضيف class ‎.elevation-0
    // بـ !important فتمسح ظل كل نافذة حوار وقائمة تحتوي VCard، فتبدو
    // الحوارات ملتصقة بالخلفية. flat يعطي المظهر نفسه بلا هذا الأثر، ومن
    // يمرّر elevation صراحةً يحصل عليه كما كان.
    VBtn: { variant: "flat", density: "comfortable", rounded: "lg" },
    VCard: { variant: "flat", rounded: "lg" },
    // VDialog وVMenu لا يملكان خاصية rounded فكانت تُتجاهل بصمت: الحوار
    // يأخذ استدارته من VCard، والقوائم من vuetify-overrides.css.

    VChip: { rounded: "lg" },
    VAlert: { rounded: "lg" },
    VSnackbar: { rounded: "lg" },
    VTabs: { height: 44 },
    // تشمل قوائم VSelect وVAutocomplete المنسدلة: 40px للعنصر بدل 48
    VList: { density: "compact" },
    // تأخير كبرامج سطح المكتب، وفوق العنصر بدل جانبه (الافتراضي end)
    VTooltip: { location: "top", openDelay: 500 },

    // Server وVirtual مكوّنان مستقلان لا يرثان إعدادات VDataTable
    VDataTable: table,
    VDataTableServer: table,
    VDataTableVirtual: table,
    VTable: table,
  },

  theme: {
    defaultTheme: initialTheme(),
    themes: configuredThemes(),
  },
});
// const vuetify = createVuetify({
//   locale: {
//     locale: "ar",
//     fallback: "ar",
//     messages: { ar },
//     rtl: { ar: true },
//   },
//   // كثافة سطح المكتب: حقول محدّدة بإطار ومضغوطة، وأزرار أقصر — لغة برامج
//   // Windows لا لغة الويب. compact يقارب ارتفاع 40px للحقول.
//   defaults: {
//     VTextField: { variant: "outlined", density: "compact", rounded: "lg" },
//     VSelect: { variant: "outlined", density: "compact", rounded: "lg" },
//     VAutocomplete: {
//       variant: "outlined",
//       density: "compact",
//       rounded: "lg",
//     },
//     VCombobox: { variant: "outlined", density: "compact", rounded: "lg" },
//     VTextarea: { variant: "outlined", density: "compact", rounded: "lg" },
//     VFileInput: {
//       variant: "outlined",
//       density: "compact",
//       rounded: "lg",
//     },
//     VBtn: { density: "comfortable", rounded: "lg", elevation: 0 },
//     VCard: { rounded: "lg", elevation: 0 },
//     VDialog: { rounded: "lg" },
//     VMenu: { rounded: "lg" },
//     VChip: { rounded: "lg" },
//     VTabs: { height: 44 },
//     VDataTable: { density: "compact" },
//   },
//   theme: {
//     defaultTheme:
//       localStorage.getItem("dalaly.theme") === "dalalyDark"
//         ? "dalalyDark"
//         : "dalalyLight",
//     themes: configuredThemes(),
//   },
// });

// عند انتهاء الجلسة (401) في أي طلب: امسح الحالة وانتقل لتسجيل الدخول.
setUnauthorizedHandler(() => {
  const current = router.currentRoute.value;
  // تعديلات نموذج مفتوح تُحفظ مسودةً، ويعود المستخدم إلى الصفحة نفسها بعد الدخول.
  stashOpenDrafts();
  useAuth().clearAuthState();
  if (current.path !== "/login") {
    void router.push({ path: "/login", query: { redirect: current.fullPath } });
  }
});

document.documentElement.lang = "ar";
document.documentElement.dir = "rtl";

router.afterEach((to) => {
  const titleKey = to.meta.titleKey as string | undefined;
  document.title = titleKey
    ? `${i18n.global.t(titleKey)} | ${i18n.global.t("common.appName")}`
    : i18n.global.t("common.appName");
});

const app = createApp(App).use(i18n).use(vuetify).use(router);
async function mountApplication() {
  try {
    await router.isReady();
    performance.mark("dalaly:router-ready");
    app.mount("#app");
    await nextTick();
    performance.mark("dalaly:mounted");
    const { startupState, status } = useSetup();
    await window.dalalyConfig?.rendererReady?.({
      startup_state: startupState.value,
      startup_reason: status.value?.startup_reason,
    });
  } catch (error) {
    console.error("Renderer startup failed", error);
    await window.dalalyConfig?.rendererReady?.({
      startup_state: "ERROR",
      startup_reason: "RENDERER_FAILED",
    });
  }
}
void mountApplication();
