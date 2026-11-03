<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import AppPage from "../components/app/AppPage.vue";
import CodelContacts from "../components/help/CodelContacts.vue";
import CodelLogo from "../components/help/CodelLogo.vue";
import { CODEL } from "../constants/about";
import { usePermissions } from "../composables/usePermissions";
import { useSetup } from "../composables/useSetup";

/**
 * المساعدة وحول التطبيق: قسمان في صفحة واحدة بالمبدّل نفسه المستعمل في بقية
 * البرنامج (?section=about للثاني). المساعدة: خطوات قصيرة لكل عمل يومي مع زر
 * يفتح شاشته، وأسئلة شائعة، واختصارات لوحة المفاتيح كما هي مطبّقة فعلاً (تُطابَق
 * بموضع المفتاح، فتعمل مع العربية)، وبحث يصفّيها كلها. حول التطبيق: الإصدار
 * من حالة الخادم نفسها التي يقرؤها البرنامج عند التشغيل، والمطوّر شركة كودل.
 */
const route = useRoute();
const router = useRouter();
const { can } = usePermissions();
const { status } = useSetup();

type Section = "help" | "about";
const section = ref<Section>(
  route.query.section === "about" ? "about" : "help",
);
watch(section, (value) => {
  void router.replace({
    query: value === "about" ? { section: "about" } : {},
  });
});
watch(
  () => route.query.section,
  (value) => (section.value = value === "about" ? "about" : "help"),
);

const search = ref<string | null>("");
const query = computed(() => (search.value ?? "").trim());
const matches = (...texts: string[]) =>
  !query.value || texts.some((text) => text.includes(query.value));

// ─── خطوات سريعة ────────────────────────────────────────────────────────
type Guide = {
  id: string;
  title: string;
  steps: string[];
  action: { label: string; to: string; permission?: string | string[] };
};
const GUIDES: Guide[] = [
  {
    id: "property",
    title: "إضافة عرض بيع",
    steps: [
      "اضغط «عرض بيع» في «عمليات سريعة» بلوحة التحكم، أو «إضافة» في الشريط العلوي ثم «عرض بيع».",
      "إن كان المالك زبوناً مسجلاً فاختره من «ربط المالك بزبون مسجّل» فيُملأ اسمه وهاتفه، وإلا فاكتبهما.",
      "اكتب المساحة والسعر. النوع والسند ووحدة المساحة وطريقة التسعير مملوءة بأشيع قيمها؛ غيّرها إن لزم.",
      "اضغط «حفظ» (Ctrl+S): تُفتح صفحة العرض لتضيف صوره، ويُعرض لك من يطلب مثله إن وُجد.",
    ],
    action: {
      label: "إضافة عرض بيع",
      to: "/properties/new",
      permission: "properties.create",
    },
  },
  {
    id: "request",
    title: "تسجيل طلب زبون ورؤية ما يطابقه",
    steps: [
      "«إضافة» ثم «طلب شراء» أو «طلب إيجار»، أو «طلب جديد» من ملف الزبون فيُختار الزبون وحده.",
      "اختر الزبون، ثم النوع والموقع والميزانية. الزبون غير المسجّل يُضاف من «زبون جديد» داخل النموذج نفسه.",
      "«حفظ ومطابقة» يعرض العروض المتاحة التي تحقق الطلب فوراً، وصفحة الطلب تعرضها دائماً ومنها تبدأ صفقة.",
    ],
    action: {
      label: "طلب شراء جديد",
      to: "/purchase-requests?new=1",
      permission: "requests.create",
    },
  },
  {
    id: "customer",
    title: "إضافة زبون",
    steps: [
      "«زبون» في «عمليات سريعة» أو في «إضافة».",
      "الاسم وحده مطلوب؛ الهاتف يتيح الاتصال وواتساب من أي شاشة.",
      "بعد الحفظ يعرض الإشعار «فتح ملف الزبون» لتسجّل طلبه أو مستمسكاته.",
    ],
    action: {
      label: "زبون جديد",
      to: "/people?new=1",
      permission: "people.create",
    },
  },
  {
    id: "deal",
    title: "صفقة بيع أو إيجار",
    steps: [
      "أسرع طريق: اضغط «صفقة» في مطابقة بلوحة التحكم أو في صفحة العرض أو الطلب، فيُملأ العرض والزبون.",
      "أو «صفقة بيع» في «عمليات سريعة»: اختر العرض ثم الزبون. المالك والسعر المطلوب يؤخذان من العرض.",
      "اكتب السعر المتفق عليه إن اتُّفق، والعمولة المتوقعة مبلغاً أو نسبة (%). بقية الخيارات في «خيارات إضافية».",
      "«حفظ» يفتح صفحة الصفقة: منها تنقل مرحلتها وتسجّل عمولتها وتُعدّ عقدها.",
    ],
    action: {
      label: "صفقة بيع جديدة",
      to: "/deals?new=sale",
      permission: "deals.create",
    },
  },
  {
    id: "collect",
    title: "قبض عمولة من الزبون",
    steps: [
      "أقدم العمولات غير المستلمة في لوحة التحكم ولكل منها «تحصيل». لغيرها: «الحسابات» ثم «تحصيل عمولة» فتظهر المتبقية وحدها، وابحث برقمها أو باسم الدافع.",
      "اضغط «تحصيل» في صفّ العمولة: المبلغ المتبقي والصندوق وتاريخ اليوم مملوءة.",
      "«إصدار» يسجّل سند القبض، و«فتح السند للطباعة» في الإشعار يطبعه للزبون.",
    ],
    action: {
      label: "تحصيل عمولة",
      to: "/accounting?new=commission",
      permission: "vouchers.receipt",
    },
  },
  {
    id: "expense",
    title: "تسجيل مصروف للمكتب",
    steps: [
      "«الحسابات» ثم «تسجيل مصروف»، أو «مصروف» في «عمليات سريعة».",
      "اختر نوع المصروف (إيجار، كهرباء، رواتب…): يُملأ البيان والمستلم من آخر مصروف مثله.",
      "اكتب المبلغ ثم «إصدار». التاريخ والصندوق في سطر واحد، و«تغيير» يفتحهما.",
    ],
    action: {
      label: "تسجيل مصروف",
      to: "/accounting?new=expense",
      permission: "vouchers.payment",
    },
  },
  {
    id: "contract",
    title: "إنشاء عقد وتصديره",
    steps: [
      "من صفحة الصفقة اضغط «إعداد العقد» ثم «إعداد المسودة»: الأطراف والعقار والسعر تُنقل من الصفقة، ويُفتح العقد على «التفاصيل».",
      "أكمل ما ينقص (الرقم الأحمر على الخطوة يعدّه): مكان التحرير، تاريخ التسليم… ويُحفظ كل تغيير وحده.",
      "«إصدار العقد» ثم «حفظ PDF»، أو «تصدير» لملف Word أو للطباعة.",
    ],
    action: { label: "الصفقات", to: "/deals", permission: "deals.read" },
  },
  {
    id: "outstanding",
    title: "معرفة العمولات التي لم تُقبض",
    steps: [
      "«الحسابات»: بطاقة «العمولات المتبقية» تعرض ما بقي حتى اليوم وعدد عمولاته.",
      "اضغط البطاقة لتظهر قائمتها، ومنها «تحصيل» لكل عمولة.",
    ],
    action: {
      label: "العمولات المتبقية",
      to: "/accounting?view=commissions&state=open",
      permission: "commissions.read",
    },
  },
  {
    id: "report",
    title: "فتح تقرير لفترة محددة",
    steps: [
      "«التقارير»: اختر التصنيف (العقارات، الصفقات، الإيجارات، العمولات والحسابات، الزبائن) ثم التقرير.",
      "اختر الفترة: هذا الشهر، الشهر الماضي، هذه السنة، أو «مخصص» لتاريخين.",
      "Excel أو PDF أو «طباعة» في أعلى الصفحة تُخرج التقرير كما يُعرض.",
    ],
    action: {
      label: "التقارير",
      to: "/reports",
      permission: ["reports.operations", "reports.financial"],
    },
  },
];
const guides = computed(() =>
  GUIDES.filter((guide) => matches(guide.title, ...guide.steps)),
);
const allowed = (guide: Guide) =>
  !guide.action.permission || can(guide.action.permission);

// ─── أسئلة شائعة ────────────────────────────────────────────────────────
const FAQ: Array<{ q: string; a: string }> = [
  {
    q: "ما الفرق بين العمولات المقبوضة والمتبقية؟",
    a: "المقبوضة ما دخل الصندوق أو المصرف بسند قبض على العمولة نفسها. المتبقية ما سُجّل على الصفقات ولم يُقبض بعد. و«إجمالي العمولات» ما سُجّل خلال الفترة المختارة، مقبوضاً كان أو لا.",
  },
  {
    q: "قبضت عمولة ولم ينقص المتبقي منها، لماذا؟",
    a: "لأن السند سُجّل من «تسجيل قبض» بغرض «عمولة المكتب» دون اختيار العمولة، فصار إيراداً مستقلاً. ألغِ السند من صفحته، ثم سجّله من «تحصيل عمولة» أو «تحصيل» في صفّ العمولة.",
  },
  {
    q: "كيف أصحح سنداً أو مبلغاً خاطئاً؟",
    a: "السند لا يُعدَّل بعد إصداره حتى تبقى الحسابات سليمة: افتحه واضغط «إلغاء السند» واذكر السبب، ثم سجّل سنداً صحيحاً. القيد اليدوي يُصحَّح بقيد عكسي من صفحته.",
  },
  {
    q: "ماذا يشمل «صافي الرصيد»؟",
    a: "كل ما في الصناديق والمصارف في آخر الفترة، ومنه أمانات الزبائن (عربون، إيجار يُسلَّم للمؤجر، ثمن يُسلَّم للبائع) التي ليست مال المكتب. مقدارها مكتوب تحت البطاقات.",
  },
  {
    q: "لماذا لا يُجمع الدينار والدولار؟",
    a: "لا سعر صرف في البرنامج، فكل مبلغ يبقى بعملته: يظهر سطر للدينار وسطر للدولار في كل رقم.",
  },
  {
    q: "كيف أصدّر تقريراً أو أطبعه؟",
    a: "افتح «التقارير»، اختر التقرير والفترة، ثم Excel أو PDF أو «طباعة» في أعلى الصفحة. يخرج التقرير كما هو على الشاشة.",
  },
  {
    q: "أين الصناديق والقيود ودليل الحسابات؟",
    a: "في «الحسابات» ثم «عرض التفاصيل». وحين تكون داخل الحسابات تظهر أيضاً تحتها في القائمة الجانبية.",
  },
  {
    q: "أين المفضلة؟",
    a: "زر «المفضلة» في قائمتي عروض البيع وعروض الإيجار، وقلب أي عرض يضيفه إليها.",
  },
  {
    q: "كيف آخذ نسخة احتياطية؟",
    a: "«نسخة احتياطية» في لوحة التحكم، أو الإعدادات ثم «النسخ الاحتياطي» لاسترجاع نسخة أو جدولة النسخ.",
  },
];
const faq = computed(() => FAQ.filter((item) => matches(item.q, item.a)));

// ─── الاختصارات ─────────────────────────────────────────────────────────
type Shortcut = { keys: string[][]; action: string; where: string };
// كل سطر في keys بديل؛ المفاتيح داخل السطر تُضغط معاً.
const SHORTCUTS: Shortcut[] = [
  {
    keys: [["Ctrl", "K"]],
    action: "البحث الشامل في العروض والزبائن والطلبات",
    where: "في كل مكان",
  },
  { keys: [["Ctrl", "F"]], action: "التركيز على بحث الصفحة", where: "القوائم" },
  {
    keys: [["Ctrl", "N"]],
    action: "سجل جديد من نوع الصفحة",
    where:
      "عروض البيع والإيجار، الزبائن، الطلبات، المهام، المستمسكات، الصفقات، الإيجارات، المستخدمون",
  },
  {
    keys: [["Ctrl", "S"]],
    action: "حفظ أو إصدار",
    where: "النماذج وحوارات النماذج",
  },
  {
    keys: [["Esc"]],
    action: "إغلاق الحوار أو اللوحة الجانبية، أو مسح البحث",
    where: "في كل مكان",
  },
  { keys: [["↓"], ["↑"]], action: "الصف التالي أو السابق", where: "الجداول" },
  { keys: [["Home"], ["End"]], action: "أول صف أو آخره", where: "الجداول" },
  {
    keys: [["PgDn"], ["PgUp"]],
    action: "الصفحة التالية أو السابقة",
    where: "الجداول",
  },
  { keys: [["Enter"]], action: "فتح الصف المحدد", where: "الجداول" },
  { keys: [["Space"]], action: "تحديد الصف وفتح ملخّصه", where: "الجداول" },
  {
    keys: [["Shift", "F10"], ["Menu"]],
    action: "أوامر الصف كلها",
    where: "الجداول",
  },
  { keys: [["↓"]], action: "من البحث إلى أول صف", where: "حقل بحث القائمة" },
  {
    keys: [["Alt", "←"]],
    action: "رجوع إلى الصفحة السابقة، والصف نفسه محدد",
    where: "في كل مكان",
  },
  { keys: [["F1"]], action: "هذه الصفحة", where: "في كل مكان" },
  {
    keys: [
      ["Ctrl", "→"],
      ["Ctrl", "←"],
    ],
    action: "تقديم الصورة أو تأخيرها في الترتيب",
    where: "صور العرض",
  },
];
const shortcuts = computed(() =>
  SHORTCUTS.filter((item) =>
    matches(item.action, item.where, ...item.keys.flat()),
  ),
);
const nothingFound = computed(
  () =>
    Boolean(query.value) &&
    !guides.value.length &&
    !faq.value.length &&
    !shortcuts.value.length,
);

// ─── حول التطبيق ────────────────────────────────────────────────────────
const version = computed(() => status.value?.app_version ?? null);
</script>

<template>
  <AppPage title="المساعدة وحول التطبيق">
    <div class="help">
      <div class="help__bar">
        <v-btn-toggle
          v-model="section"
          mandatory
          divided
          density="compact"
          variant="outlined"
          color="primary"
          aria-label="القسم"
        >
          <v-btn value="help" prepend-icon="mdi-lifebuoy">المساعدة</v-btn>
          <v-btn value="about" prepend-icon="mdi-information-outline"
            >حول التطبيق</v-btn
          >
        </v-btn-toggle>
        <v-text-field
          v-if="section === 'help'"
          v-model="search"
          class="help__search"
          label="ابحث في المساعدة"
          placeholder="مثلاً: عمولة، مصروف، تقرير"
          prepend-inner-icon="mdi-magnify"
          density="compact"
          hide-details
          clearable
        />
      </div>

      <template v-if="section === 'help'">
        <p v-if="nothingFound" class="help__empty">
          لا شيء في المساعدة عن «{{ query }}». جرّب كلمة أخرى، أو تواصل مع الدعم
          في أسفل الصفحة.
        </p>

        <div class="help__columns">
          <div class="help__main">
            <section
              v-if="guides.length"
              class="dal-panel"
              aria-labelledby="help-guides-title"
            >
              <header class="dal-panel__header">
                <h2 id="help-guides-title" class="dal-section-title">
                  خطوات سريعة
                </h2>
              </header>
              <article
                v-for="guide in guides"
                :key="guide.id"
                class="help__guide"
                :aria-labelledby="`guide-${guide.id}`"
              >
                <div class="help__guide-head">
                  <h3 :id="`guide-${guide.id}`">{{ guide.title }}</h3>
                  <v-btn
                    v-if="allowed(guide)"
                    variant="tonal"
                    color="primary"
                    size="small"
                    append-icon="mdi-arrow-left"
                    @click="router.push(guide.action.to)"
                    >{{ guide.action.label }}</v-btn
                  >
                </div>
                <ol>
                  <li v-for="(step, index) in guide.steps" :key="index">
                    {{ step }}
                  </li>
                </ol>
              </article>
            </section>

            <section
              v-if="faq.length"
              class="dal-panel"
              aria-labelledby="help-faq-title"
            >
              <header class="dal-panel__header">
                <h2 id="help-faq-title" class="dal-section-title">
                  أسئلة شائعة
                </h2>
              </header>
              <details
                v-for="item in faq"
                :key="item.q"
                class="help__faq"
                :open="Boolean(query)"
              >
                <summary>{{ item.q }}</summary>
                <p>{{ item.a }}</p>
              </details>
            </section>
          </div>

          <div class="help__side">
            <section
              v-if="shortcuts.length"
              class="dal-panel"
              aria-labelledby="help-keys-title"
            >
              <header class="dal-panel__header">
                <h2 id="help-keys-title" class="dal-section-title">
                  اختصارات لوحة المفاتيح
                </h2>
              </header>
              <p class="help__note">
                تعمل مع لوحة المفاتيح العربية أيضاً، ولا تعمل وحوار مفتوح فوق
                الصفحة (عدا Ctrl+S داخل الحوار).
              </p>
              <table class="help__table">
                <caption class="d-sr-only">
                  اختصارات لوحة المفاتيح
                </caption>
                <thead>
                  <tr>
                    <th scope="col">المفاتيح</th>
                    <th scope="col">ما يفعله</th>
                    <th scope="col">أين</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="(shortcut, index) in shortcuts" :key="index">
                    <td class="help__combo">
                      <template v-for="(combo, c) in shortcut.keys" :key="c">
                        <span v-if="c" class="help__or">أو</span>
                        <span class="help__keys-group" dir="ltr">
                          <template v-for="(key, k) in combo" :key="key">
                            <span v-if="k" aria-hidden="true">+</span>
                            <kbd>{{ key }}</kbd>
                          </template>
                        </span>
                      </template>
                    </td>
                    <td>{{ shortcut.action }}</td>
                    <td class="help__where">{{ shortcut.where }}</td>
                  </tr>
                </tbody>
              </table>
            </section>

            <section class="dal-panel" aria-labelledby="help-support-title">
              <header class="dal-panel__header">
                <h2 id="help-support-title" class="dal-section-title">الدعم</h2>
                <CodelLogo
                  variant="mark"
                  :height="18"
                  class="help__support-logo"
                />
              </header>
              <div class="help__support">
                <p>
                  للمساعدة أو الإبلاغ عن مشكلة تواصل مع {{ CODEL.nameAr }} (<bdi
                    dir="ltr"
                    >{{ CODEL.nameEn }}</bdi
                  >)، مطوّر البرنامج.
                </p>
                <CodelContacts />
              </div>
            </section>
          </div>
        </div>
      </template>

      <section v-else class="dal-panel about" aria-labelledby="about-title">
        <div class="about__app">
          <span class="about__logo" aria-hidden="true">
            <v-icon icon="mdi-home-city-outline" size="32" />
          </span>
          <div class="about__app-text">
            <h2 id="about-title" class="about__name">
              دلالي <bdi dir="ltr" class="about__latin">Dalaly</bdi>
            </h2>
            <p class="about__desc">
              برنامج مكتبي لإدارة مكتب العقارات: العروض والطلبات والزبائن
              والصفقات والعقود والحسابات والتقارير، على هذا الجهاز ودون إنترنت.
            </p>
          </div>
          <p class="about__version">
            الإصدار
            <bdi dir="ltr">{{ version ?? "—" }}</bdi>
          </p>
        </div>

        <div class="about__developer">
          <div class="about__credit">
            <h3 class="about__eyebrow">التطوير والتصميم</h3>
            <CodelLogo :height="36" class="about__codel" />
            <p class="about__credit-text">
              تم تطوير وتصميم البرنامج بواسطة
              <bdi dir="ltr">{{ CODEL.nameEn }}</bdi> - {{ CODEL.nameAr }}
            </p>
            <p class="about__address">
              <v-icon
                icon="mdi-map-marker-outline"
                size="16"
                aria-hidden="true"
              />
              <span class="d-sr-only">العنوان:</span>
              {{ CODEL.address }}
            </p>
          </div>
          <CodelContacts class="about__contacts" />
        </div>

        <p class="about__copyright">
          <bdi dir="ltr">© {{ CODEL.nameEn }}</bdi> - {{ CODEL.nameAr }} — جميع
          الحقوق محفوظة
        </p>
      </section>
    </div>
  </AppPage>
</template>

<style scoped>
.help {
  display: grid;
  gap: var(--dal-gutter);
}
.help__bar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 12px;
}
.help__search {
  flex: 0 1 360px;
}
.help__empty {
  margin: 0;
  color: var(--dal-muted);
}
.help__columns {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(340px, 460px);
  gap: var(--dal-gutter);
  align-items: start;
}
.help__main,
.help__side {
  display: grid;
  gap: var(--dal-gutter);
  min-width: 0;
}
.help__guide {
  padding: 10px 16px 12px;
  border-bottom: 1px solid var(--dal-stroke);
}
.help__guide:last-child {
  border-bottom: 0;
}
.help__guide-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 4px;
}
.help__guide h3 {
  margin: 0;
  font-size: calc(14px * var(--dal-font-scale));
  font-weight: 700;
}
.help__guide ol {
  margin: 0;
  padding-inline-start: 22px;
  /* Preflight يزيل الترقيم؛ الخطوات مرقّمة بأرقام لاتينية. */
  list-style: decimal;
  display: grid;
  gap: 2px;
  font-size: calc(13px * var(--dal-font-scale));
  line-height: 1.7;
}
.help__faq {
  border-bottom: 1px solid var(--dal-stroke);
}
.help__faq:last-child {
  border-bottom: 0;
}
.help__faq summary {
  padding: 10px 16px;
  cursor: pointer;
  font-size: calc(13px * var(--dal-font-scale));
  font-weight: 600;
}
.help__faq summary:hover {
  background: var(--dal-hover);
}
.help__faq p {
  margin: 0;
  padding: 0 16px 12px;
  font-size: calc(13px * var(--dal-font-scale));
  line-height: 1.7;
}
.help__note {
  margin: 0;
  padding: 8px 16px;
  color: var(--dal-muted);
  font-size: calc(12px * var(--dal-font-scale));
}
.help__table {
  width: 100%;
  border-collapse: collapse;
  font-size: calc(13px * var(--dal-font-scale));
}
.help__table th,
.help__table td {
  padding: 6px 12px;
  border-top: 1px solid var(--dal-stroke);
  text-align: start;
  vertical-align: middle;
}
.help__table thead th {
  height: var(--dal-head-height);
  color: var(--dal-muted);
  font-size: calc(12px * var(--dal-font-scale));
  font-weight: 600;
  background: var(--dal-hover);
}
.help__combo {
  white-space: nowrap;
}
.help__keys-group {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  unicode-bidi: isolate;
}
.help__or {
  margin-inline: 6px;
  color: var(--dal-muted);
  font-size: calc(12px * var(--dal-font-scale));
}
.help__where {
  color: var(--dal-muted);
  font-size: calc(12px * var(--dal-font-scale));
}
kbd {
  display: inline-block;
  min-width: 24px;
  padding: 1px 6px;
  border: 1px solid var(--dal-stroke);
  border-bottom-width: 2px;
  border-radius: var(--dal-radius-control);
  background: rgb(var(--v-theme-surface));
  font-family: inherit;
  font-size: calc(12px * var(--dal-font-scale));
  font-weight: 600;
  line-height: 1.6;
  text-align: center;
}
.help__support {
  display: grid;
  gap: 8px;
  padding: 12px 16px;
  font-size: calc(13px * var(--dal-font-scale));
}
.help__support p {
  margin: 0;
  line-height: 1.7;
}
.help__support-logo {
  margin-inline-start: auto;
  color: var(--dal-muted);
}

/* حول التطبيق: البرنامج وإصداره، ثم المطوّر بشعاره وطرق التواصل معه في
   عمودين يصيران عموداً واحداً حين يضيق اللوح، ثم سطر الحقوق. */
.about {
  display: grid;
  container-type: inline-size;
}
.about__app {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 16px;
  border-bottom: 1px solid var(--dal-stroke);
}
.about__logo {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 56px;
  height: 56px;
  flex: none;
  border-radius: var(--dal-radius-card);
  background: rgb(var(--v-theme-sidebar));
  color: rgb(var(--v-theme-on-sidebar));
}
.about__app-text {
  flex: 1;
  min-width: 0;
}
.about__name {
  margin: 0;
  font-family: var(--dal-display-font);
  font-size: calc(20px * var(--dal-font-scale));
  font-weight: 600;
  color: var(--dal-heading);
}
.about__latin {
  margin-inline-start: 6px;
  color: var(--dal-muted);
  font-size: calc(14px * var(--dal-font-scale));
  font-weight: 600;
}
.about__desc {
  margin: 2px 0 0;
  font-size: calc(13px * var(--dal-font-scale));
  line-height: 1.7;
}
.about__version {
  flex: none;
  align-self: flex-start;
  margin: 0;
  color: var(--dal-muted);
  font-size: calc(13px * var(--dal-font-scale));
}
.about__version bdi {
  color: rgb(var(--v-theme-on-surface));
  font-weight: 600;
}
.about__developer {
  display: grid;
  grid-template-columns: minmax(240px, 5fr) minmax(0, 6fr);
  gap: 24px;
  padding: 16px;
}
.about__credit {
  display: grid;
  align-content: start;
  justify-items: start;
  gap: 10px;
}
/* النحاس المقروء على الورق (link)؛ sidebar-accent مضبوط على الشريط الداكن. */
.about__eyebrow {
  margin: 0;
  color: rgb(var(--v-theme-link));
  font-size: calc(12px * var(--dal-font-scale));
  font-weight: 600;
}
.about__codel {
  margin-block: 4px;
  color: var(--dal-heading);
}
.about__credit-text,
.about__address {
  margin: 0;
  font-size: calc(13px * var(--dal-font-scale));
  line-height: 1.7;
}
.about__credit-text {
  font-weight: 600;
}
.about__address {
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--dal-muted);
}
.about__contacts {
  padding-inline-start: 24px;
  border-inline-start: 1px solid var(--dal-stroke);
}
.about__copyright {
  margin: 0;
  padding: 10px 16px;
  border-top: 1px solid var(--dal-stroke);
  color: var(--dal-muted);
  font-size: calc(12px * var(--dal-font-scale));
}
@container (max-width: 639px) {
  .about__developer {
    grid-template-columns: minmax(0, 1fr);
    gap: 12px;
  }
  .about__contacts {
    padding-inline-start: 0;
    padding-top: 4px;
    border-inline-start: 0;
    border-top: 1px solid var(--dal-stroke);
  }
}
@media (max-width: 1100px) {
  .help__columns {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
