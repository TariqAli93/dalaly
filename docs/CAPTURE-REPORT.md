# تقرير التصوير النهائي — دلالي (Capture Report)

> يخصّ مشروع **دلالي** في `D:\dev_projects\dalaly` فقط. لم يُمسّ موقع كودل،
> ولم تُضف إليه أي مادة. المواد جاهزة للمراجعة فقط.

---

## 1. طريقة تشغيل نسخة الويب

```bash
pnpm demo:reset   # يبني قاعدة العرض المعزولة (dalaly_demo) وبيانات الصور
pnpm dev:web      # يشغّل API + واجهة الويب في وضع web-demo
```

`pnpm dev:web` يشغّل عمليتين:

- **API**: `tsx` للخادم مع `ENV_FILE=.env.web-demo` على المنفذ 45699 وقاعدة `dalaly_demo`.
- **الواجهة**: Vite بوضع `--mode web-demo` على المنفذ 5199، مع `VITE_API_BASE_URL` يشير إلى API العرض.

## 2. الرابط المحلي

```text
http://127.0.0.1:5199
```

(المسارات بصيغة hash، مثل `http://127.0.0.1:5199/#/properties`.)

## 3. حساب Demo

```text
username: demo.admin
PIN:      246810
```

مدير بكل الصلاحيات (دور Super Admin). يُنشأ آلياً في كل `pnpm demo:reset`، محلي فقط، وغير موجود في أي قاعدة إنتاج.

> ملاحظة: النظام يستخدم **PIN** (4–12 خانة) لا كلمة مرور، فاستُخدم PIN من ست خانات بدل `DemoCaptureOnly123!` الوارد في التعليمات.

## 4. عدد Routes المكتشفة

**12 مساراً**: `first-run` (محجوب)، `login`، `/` (لوحة التحكم)، `properties`، `properties/new`، `properties/:id/edit`، `favorites`، `users`، `roles`، `locations`، `settings`، `help`.

## 5. عدد الميزات المكتشفة والمُصوَّرة

**46 ميزة مُصوَّرة** موزّعة على 13 مجموعة (المصادقة، لوحة التحكم، العروض، الصور، البحث والفلاتر، المتابعات، السجل، المفضلة، التصدير، الاستيراد، المواقع، الإدارة، الإعدادات، المساعدة).

## 6. عدد Screenshots الناجحة

**64 لقطة** (بعض الميزات لها لقطات متعددة: قبل/بعد، حوار، خطوات).

## 7. عدد الفيديوهات الناجحة

**46 فيديو** — واحد لكل ميزة (WebM + MP4)، مع **46 Poster** بصيغة WebP.

## 8. الميزات التي تعذّر تصويرها

| الميزة                                              | الحالة  | السبب                                                                            |
| --------------------------------------------------- | ------- | -------------------------------------------------------------------------------- |
| First Run Wizard                                    | Blocked | لا يظهر إلا وقاعدة البيانات غير مهيأة؛ تصويره يتطلب هدم قاعدة العرض أثناء الجلسة |
| التصدير اليدوي للنسخة الاحتياطية إلى مسار على القرص | Blocked | يحتاج حوار حفظ من نظام التشغيل (Electron)                                        |
| تغيير مجلد النسخ الاحتياطي                          | Blocked | يحتاج حوار اختيار مجلد من نظام التشغيل                                           |
| جدولة النسخ الاحتياطي بالبريد                       | Blocked | Electron safeStorage + SMTP، والمكوّن معطَّل أصلاً في صفحة الإعدادات             |
| تنفيذ الاستعادة فعلياً                              | Skipped | يستبدل بيانات العرض ويُفسد بقية اللقطات؛ صُوِّر الحوار ونطاقاته فقط              |
| تنفيذ تغيير رمز PIN فعلياً                          | Skipped | يُبطل حساب التصوير لبقية الجلسة؛ صُوِّر الحوار فقط                               |
| تشغيل الاتصال الخارجي (cloudflared)                 | Skipped | يشغّل عملية نظام خارجية؛ صُوِّرت شاشته ضمن الإعدادات بلا تفعيل                   |

## 9. سبب تعذّر كل ميزة

مذكور في الجدول أعلاه. باختصار: كلها إمّا تعتمد على حوارات نظام التشغيل عبر Electron، أو عملية نظام خارجية، أو تُفسد حالة العرض بشكل يمنع بقية اللقطات.

## 10. الميزات التي تعتمد على Electron

من جرد جسر `window.dalalyConfig` (preload):

| القدرة                                       | الاستخدام في الواجهة          | البديل في وضع web-demo                 |
| -------------------------------------------- | ----------------------------- | -------------------------------------- |
| `exportPdf`                                  | `utils/exportProperty.ts`     | تنزيل مستند HTML جاهز للطباعة          |
| `chooseExportPath`                           | `BackupSettings.vue`          | معطَّل (الزر مخفي) + رسالة تجريبية     |
| `pickFolder`                                 | `BackupSettings.vue`          | معطَّل (الزر مخفي)                     |
| `pickBackupFile`                             | `BackupSettings.vue`          | `<input type="file">` كـ data URL      |
| `getScheduledBackup` / `saveScheduledBackup` | `ScheduledBackupSettings.vue` | معطَّل + تنبيه واضح                    |
| `saveDatabaseUrl`                            | `setup.service.ts`            | لا عملية (الخادم يهيّئ الـ pool حيّاً) |

كلها تمرّ الآن عبر طبقة `apps/renderer/src/platform/` (تنفيذان: `electron.ts` و`web.ts`). في نسخة سطح المكتب يُختار تنفيذ Electron دائماً لوجود الجسر.

## 11. مسارات الملفات الخام

```text
source-assets/captures/dalaly/<group>/<name>/
  ├── meta.json          بطاقة الميزة (id، عنوان، مسار، مجلد فيديو Playwright)
  └── screenshot*.png     اللقطات الثابتة الخام
test-results/<...>/video.webm   فيديو Playwright الخام (لم يُحذف)
```

المواد الخام الإضافية للتصوير:

```text
source-assets/demo/images/*.png   ست صور عقارية تجريبية مجرّدة
source-assets/demo/import/demo-import.xlsx   ملف استيراد تجريبي
```

## 12. مسارات الملفات المعالجة

```text
public/videos/dalaly/<group>/<name>/desktop.webm     (VP9، بلا صوت)
public/videos/dalaly/<group>/<name>/desktop.mp4      (H.264 faststart)
public/posters/dalaly/<group>/<name>.webp            (Poster من الحالة النهائية)
public/images/products/dalaly/<group>/<name>/*.webp  (اللقطات الثابتة)
docs/capture-manifest.json                           (بيان يربط كل ميزة بملفاتها وأحجامها)
```

## 13. أحجام الملفات

الأحجام الدقيقة لكل ميزة في `docs/capture-manifest.json`. المدى النموذجي:

- WebM: 64 KB – 800 KB (الوسيط حوالي 400 KB).
- MP4: 84 KB – 870 KB.
- Poster (WebP): 14 KB – 91 KB.
- لقطة ثابتة (WebP): عشرات إلى مئات الكيلوبايت.

## 14. نتيجة Type Check

```text
pnpm typecheck            → نجح (خادم: tsc، واجهة: vue-tsc)
tsc -p tsconfig.captures  → نجح (اختبارات التصوير)
```

## 15. نتيجة Build

```text
pnpm build → نجح، وتحقّق assert-production-assets من أصول الإنتاج.
```

## 16. نتيجة Playwright

```text
pnpm capture:all → 47/47 اختبار ناجح (46 ميزة + فحص جاهزية واحد).
```

## 17. التغييرات التي أُجريت على المشروع

كلها إضافية ومعزولة، ولا تغيّر أي سلوك افتراضي (التفاصيل في `docs/WEB-CAPTURE-AUDIT.md §7`):

- **خادم**: `config.ts` (دعم `ENV_FILE` + `corsOrigins` + `webDemoMode`)، `server.ts` (CORS من الإعداد).
- **واجهة**: طبقة `src/platform/` جديدة، وتحويل `exportProperty.ts` و`setup.service.ts` و`BackupSettings.vue` و`ScheduledBackupSettings.vue` إليها، وحذف `console.log` تنقيح، و`vite.config.ts` (استبعاد DevTools في وضع web-demo)، و`env.d.ts` (أنواع).
- **جذر**: أوامر `dev:web`, `demo:reset`, `demo:images`, `capture:*`, `typecheck` في `package.json`، وملفّا `.env.web-demo`، و`playwright.config.ts`، و`tsconfig.captures.json`، وتحديث `.gitignore` و`README.md`.
- **سكربتات جديدة**: `scripts/{web-demo-env,dev-web,demo-reset,seed-demo-images,generate-demo-images,generate-demo-xlsx,process-captures}.mjs`.
- **اختبارات**: `tests/captures/` (13 ملف spec + مساعدات).
- **وثائق**: `docs/{WEB-CAPTURE-AUDIT,CAPTURE-SHOT-LIST,CAPTURE-REPORT}.md` + `capture-manifest.json`.

لم تُحذف أي وظيفة Electron، ولم يتغيّر منطق أعمال، ولم تُنشأ ميزات وهمية.

## 18. تأكيد أن نسخة Electron لم تتأثر

- `pnpm build` نجح كما هو.
- `pnpm start` (Electron على البناء) أقلع، شغّل الـ API على 34567، ونجح فحص الصحة، وحمّل الواجهة — أي أن مسار سطح المكتب سليم.
- منطق اختيار المنصّة يعتمد على وجود جسر `preload`؛ داخل Electron يوجد الجسر دائماً فيُختار تنفيذ Electron، ولا يدخل بديل الويب حيّز التنفيذ.
- وضع web-demo معزول بالكامل: ملف بيئة، قاعدة بيانات، منفذ API، منفذ ويب، ومجلد بيانات — كلها مختلفة عن نسخة التطوير/الإنتاج.

---

## الخلاصة

لكل ميزة معتمدة (46 ميزة) توجد المجموعة الكاملة:

```text
Screenshot + Video (webm + mp4) + Poster + Shot List entry
```

المواد جاهزة في `public/` و`source-assets/`، والبيان في `docs/capture-manifest.json`.
**لم تُضف أي مادة إلى موقع كودل** — المهمة تتوقف هنا للمراجعة.
