<script setup lang="ts">
import AppPage from "../components/app/AppPage.vue";

/**
 * المساعدة: دليل مختصر لكل قسم في البرنامج، وجدول اختصارات لوحة المفاتيح
 * كما هي مطبّقة فعلاً. الاختصارات تُطابَق بموضع المفتاح لا بحرفه، فتعمل مع
 * لوحة المفاتيح العربية أيضاً.
 */
type Guide = { id: string; title: string; points: string[] };

const guides: Guide[] = [
  {
    id: "dashboard",
    title: "لوحة التحكم",
    points: [
      "شريط الملخّص في الأعلى يعدّ ما يحتاج عملاً: مواعيد اليوم، والطلبات التي لها عروض مطابقة أو بلا مطابقة، والمعاينات بلا نتيجة، والعروض الراكدة. اضغط أي رقم لتنتقل إلى قسمه.",
      "«ابدأ بـ» يقترح أهم عمل الآن، ثم ما بعده.",
      "قائمة المطابقات تعرض كل طلب مفتوح مع العرض الذي يحقق شروطه الأساسية؛ سجّل متابعة من الصف نفسه بعد الاتصال بالزبون.",
      "«حالة العروض» تعدّ العروض في كل حالة، وكل رقم يفتح قائمته.",
    ],
  },
  {
    id: "sale",
    title: "عروض البيع",
    points: [
      "ابحث بالمالك أو الهاتف أو رقم القطعة أو الرمز، وصفِّ بالمحافظة والمنطقة والنوع والحالة. بقية الفلاتر في «فلاتر إضافية»، ولكل فلتر فعّال شريحة تزيله.",
      "النقر على صف يفتح ملخّصه في اللوحة الجانبية؛ النقر المزدوج أو Enter يفتح صفحة العرض.",
      "صفحة العرض فيها السعر والقطعة والمالك مع أزرار الاتصال وواتساب، والتفاصيل والموقع والمتابعات والملاحظات والسجل، والصور بجانبها.",
      "عند إضافة عرض ينبّهك النموذج إن كانت القطعة نفسها مسجّلة في عرض آخر. بعد الحفظ تُفتح صفحة العرض لتضيف صوره.",
      "أوامر الصف (تعديل، تصدير، أرشفة، حذف) في زر «⋯» أو بـ Shift+F10.",
    ],
  },
  {
    id: "rentals",
    title: "عروض الإيجار",
    points: [
      "بالطريقة نفسها: قائمة بفلاترها، ولوحة ملخّص، وصفحة لكل عرض إيجاري فيها صوره ومتابعاته وملاحظاته.",
      "الفلاتر تشمل نوع الإيجار والسعر والمساحة والغرف والمميزات المطلوبة.",
      "«المفضلة» عرض سريع في القائمة، وتجد المفضلة كاملة في «مفضلة الإيجارات».",
    ],
  },
  {
    id: "people",
    title: "الزبائن",
    points: [
      "ابحث بالاسم أو الهاتف أو الرمز. المؤرشفون لا يظهرون إلا باختيار «المؤرشفون» في الحالة، والأرشفة يمكن التراجع عنها من الإشعار.",
      "ملف الزبون يجمع هاتفه وطلباته (شراء وإيجار) وما يملكه من عروض ومستمسكاته وملاحظاته. «طلب جديد» يفتح نموذج الطلب والزبون مختار فيه.",
    ],
  },
  {
    id: "requests",
    title: "طلبات الشراء والإيجار والمطابقة",
    points: [
      "سجّل ما يريده الزبون: النوع والموقع والميزانية والمساحة والمميزات. إن لم يكن الزبون مسجّلاً فأضفه من زر «زبون جديد» داخل النموذج نفسه.",
      "«حفظ ومطابقة» يحفظ الطلب ثم يعرض العروض المتاحة التي تحقق شروطه الأساسية (النوع والموقع والميزانية، ونوع الإيجار). التفضيلات ترتّب النتائج ولا تستبعدها.",
      "صفحة الطلب تعرض الزبون وهاتفه والعروض المطابقة الآن، ومنها تغيّر الحالة إلى «تمت المطابقة» أو «مغلق». المطابقة تشمل الطلبات المفتوحة وحدها.",
    ],
  },
  {
    id: "documents",
    title: "المستندات",
    points: [
      "ارفع مستمسكات الزبون (هوية، بطاقة سكن، سند) مع رقمها وتاريخ انتهائها، وتظهر المنتهية بحالة «منتهي».",
      "تجد مستمسكات كل زبون أيضاً في ملفه.",
    ],
  },
  {
    id: "settings",
    title: "الإعدادات والنسخ الاحتياطي",
    points: [
      "«المظهر»: الوضع الفاتح أو الداكن ولوحات الألوان والخط وحجم النص، على هذا الجهاز وحده.",
      "«النسخ الاحتياطي»: أنشئ نسخة كاملة في مجلد النسخ، أو استرجع نسخة. قبل أي استرجاع تُحفظ نسخة من البيانات الحالية، ويظهر مسارها بعد الاسترجاع.",
      "النسخ المجدول بالبريد يرسل قاعدة البيانات فقط مشفّرة بكلمة مرور؛ احفظ الكلمة خارج الجهاز، فبدونها لا تُفتح النسخة.",
      "«الأمان»: تغيير الرمز السري والقفل التلقائي بعد مدة بلا استخدام. تعديلات النموذج المفتوح تُحفظ عند القفل وتستعيدها بعد الدخول.",
    ],
  },
];

/** رابط في فهرس الدليل: ينقل التركيز إلى القسم (والتمرير معه). */
function jump(id: string) {
  document.getElementById(`help-${id}`)?.focus();
}

type Shortcut = { keys: string[][]; action: string; where: string };

// كل سطر في keys بديل؛ المفاتيح داخل السطر تُضغط معاً.
const shortcuts: Shortcut[] = [
  {
    keys: [["Ctrl", "K"]],
    action: "البحث الشامل في العروض والزبائن والطلبات",
    where: "في كل مكان",
  },
  { keys: [["Ctrl", "F"]], action: "التركيز على بحث الصفحة", where: "القوائم" },
  {
    keys: [["Ctrl", "N"]],
    action: "سجل جديد من نوع الصفحة",
    where: "عروض البيع والإيجار، الزبائن، الطلبات",
  },
  { keys: [["Ctrl", "S"]], action: "حفظ", where: "النماذج وحوارات النماذج" },
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
</script>

<template>
  <AppPage title="المساعدة">
    <div class="help">
      <section class="dal-panel help__guide" aria-labelledby="help-guide-title">
        <div class="dal-panel__header">
          <h2 id="help-guide-title" class="dal-section-title">
            دليل الاستخدام
          </h2>
        </div>
        <nav class="help__toc" aria-label="أقسام الدليل">
          <a
            v-for="guide in guides"
            :key="guide.id"
            :href="`#help-${guide.id}`"
            class="record-link"
            @click.prevent="jump(guide.id)"
            >{{ guide.title }}</a
          >
        </nav>
        <section
          v-for="guide in guides"
          :id="`help-${guide.id}`"
          :key="guide.id"
          class="help__topic"
          tabindex="-1"
          :aria-labelledby="`help-${guide.id}-title`"
        >
          <h3 :id="`help-${guide.id}-title`">{{ guide.title }}</h3>
          <ul>
            <li v-for="(point, index) in guide.points" :key="index">
              {{ point }}
            </li>
          </ul>
        </section>
      </section>

      <section class="dal-panel help__keys" aria-labelledby="help-keys-title">
        <div class="dal-panel__header">
          <h2 id="help-keys-title" class="dal-section-title">
            اختصارات لوحة المفاتيح
          </h2>
        </div>
        <p class="help__note">
          تعمل الاختصارات مع لوحة المفاتيح العربية أيضاً، ولا تعمل وحوار مفتوح
          فوق الصفحة (عدا Ctrl+S داخل حوار النموذج).
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
    </div>
  </AppPage>
</template>

<style scoped>
.help {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(360px, 480px);
  gap: var(--dal-gutter);
  align-items: start;
}
.help__toc {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 16px;
  padding: 8px 16px;
  border-bottom: 1px solid var(--dal-stroke);
  font-size: calc(13px * var(--dal-font-scale));
}
.help__topic {
  padding: 12px 16px;
  border-bottom: 1px solid var(--dal-stroke);
  scroll-margin-top: calc(var(--dal-bar-height) + var(--dal-gutter));
}
.help__topic:last-child {
  border-bottom: 0;
}
.help__topic:focus {
  outline: none;
}
.help__topic:focus-visible {
  outline: 2px solid rgb(var(--v-theme-primary));
  outline-offset: -2px;
}
.help__topic h3 {
  margin: 0 0 6px;
  font-size: calc(14px * var(--dal-font-scale));
  font-weight: 700;
}
.help__topic ul {
  margin: 0;
  padding-inline-start: 20px;
  display: grid;
  gap: 4px;
  font-size: calc(14px * var(--dal-font-scale));
  line-height: 1.7;
}
.help__keys {
  position: sticky;
  top: calc(var(--dal-bar-height) + var(--dal-gutter));
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
@media (max-width: 1100px) {
  .help {
    grid-template-columns: minmax(0, 1fr);
  }
  .help__keys {
    position: static;
  }
}
</style>
