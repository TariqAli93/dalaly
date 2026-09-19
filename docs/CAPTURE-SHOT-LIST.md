# قائمة اللقطات — دلالي (Capture Shot List)

نسخة الويب: `http://127.0.0.1:5199` · حساب التصوير: `demo.admin` / `246810`
كل ميزة لها اختبار Playwright مستقل ينتج **لقطة + فيديو + Poster**.

المسارات بصيغة hash لأن الموجّه يستخدم `createWebHashHistory`.

## الحالات

| الحالة | المعنى |
| ------ | ------ |
| `Captured` | صُوِّرت واعتُمدت (لقطة + فيديو + Poster) |
| `Ready` | جاهزة للتصوير ولم تُنفَّذ بعد |
| `Pending` | بانتظار تجهيز بيانات أو خطوة سابقة |
| `Needs Review` | صُوِّرت لكنها تحتاج مراجعة بصرية |
| `Blocked` | غير قابلة للتصوير على الويب (سبب مذكور) |
| `Skipped` | متاحة لكن استُثنيت عمداً (سبب مذكور) |

---

## 1) المصادقة والبداية

| ID | الميزة | Route | خطوات العرض | Screenshot | Video | الحالة |
| -- | ------ | ----- | ----------- | ---------- | ----- | ------ |
| `auth/01-login-screen` | شاشة تسجيل الدخول | `/#/login` | فتح الشاشة → إبراز حقلي Username وPIN | `auth/01-login-screen/screenshot.png` | ✔ | Captured |
| `auth/02-login-success` | تسجيل دخول ناجح | `/#/login → /#/` | كتابة الحساب → كتابة PIN → دخول → لوحة التحكم | `auth/02-login-success/screenshot.png` | ✔ | Captured |

## 2) لوحة التحكم

| ID | الميزة | Route | خطوات العرض | Screenshot | Video | الحالة |
| -- | ------ | ----- | ----------- | ---------- | ----- | ------ |
| `dashboard/01-overview` | لوحة التحكم الكاملة | `/#/` | فتح اللوحة → جولة على الانتباه/الملخّص/آخر العروض | `dashboard/01-overview/screenshot.png` | ✔ | Captured |
| `dashboard/02-reminders` | تذكيرات المتابعة | `/#/` | إبراز «يتطلب انتباهك» → فتح العرض المرتبط | `dashboard/02-reminders/screenshot.png` | ✔ | Captured |
| `dashboard/03-quick-search` | الوصول السريع والبحث | `/#/` | كتابة منطقة → Enter → الانتقال للنتائج | `dashboard/03-quick-search/screenshot.png` | ✔ | Captured |

## 3) العروض العقارية

| ID | الميزة | Route | خطوات العرض | Screenshot | Video | الحالة |
| -- | ------ | ----- | ----------- | ---------- | ----- | ------ |
| `properties/01-list` | قائمة العروض | `/#/properties` | عرض الجدول → تحديد صف → فتح لوح الملخّص | `screenshot.png` + `screenshot-detail-pane.png` | ✔ | Captured |
| `properties/02-details` | تفاصيل العقار | `/#/properties` | فتح حوار التفاصيل الكامل | `properties/02-details/screenshot.png` | ✔ | Captured |
| `properties/03-create` | إضافة عقار (نوع، سند، محافظة/منطقة/حي، قطعة وحرف، مساحة، سعر، واجهة، نزال، مالك وهاتف، عنوان، ملاحظات) | `/#/properties/new` | ملء النموذج كاملاً → حفظ → رسالة نجاح | `screenshot-empty-form.png` + `screenshot-filled-form.png` + `screenshot.png` | ✔ | Captured |
| `properties/04-edit` | تعديل العقار | `/#/properties/:id/edit` | فتح التعديل → تغيير الحالة والملاحظات → حفظ | `properties/04-edit/screenshot.png` | ✔ | Captured |
| `properties/05-duplicate-guard` | منع التكرار | `/#/properties/new` | إدخال هوية قطعة موجودة → حفظ → رفض مع اسم المالك المسجّل | `screenshot-before-save.png` + `screenshot.png` | ✔ | Captured |
| `properties/06-archive-restore` | الأرشفة | `/#/properties` | أرشفة عرض → تأكيد → رسالة نجاح | `properties/06-archive-restore/screenshot.png` | ✔ | Captured |

## 4) الصور

| ID | الميزة | Route | خطوات العرض | Screenshot | Video | الحالة |
| -- | ------ | ----- | ----------- | ---------- | ----- | ------ |
| `images/01-gallery` | معرض الصور | تفاصيل → الصور | فتح التبويب → عرض الصورة الرئيسية والمصغّرات | `images/01-gallery/screenshot.png` | ✔ | Captured |
| `images/02-primary` | رفع/تعيين الصورة الرئيسية | تفاصيل → الصور | تعيين صورة أخرى كرئيسية → تبديل المعرض | `screenshot-before.png` + `screenshot.png` | ✔ | Captured |
| `images/03-reorder` | ترتيب الصور | تفاصيل → الصور | سحب المصغّرة الثالثة إلى الأولى → حفظ الترتيب | `screenshot-before.png` + `screenshot.png` | ✔ | Captured |
| `images/04-upload` | رفع صورة جديدة | تفاصيل → الصور | اختيار ملف → معاينة → رفع → ظهورها في المعرض | `screenshot-preview.png` + `screenshot.png` | ✔ | Captured |

## 5) البحث والفلاتر

| ID | الميزة | Route | خطوات العرض | Screenshot | Video | الحالة |
| -- | ------ | ----- | ----------- | ---------- | ----- | ------ |
| `search/01-global` | البحث العام | `/#/properties` | كتابة كلمة → تقلّص النتائج فوراً | `screenshot-before.png` + `screenshot.png` | ✔ | Captured |
| `search/02-owner-name` | البحث باسم المالك | `/#/properties` | كتابة جزء من اسم المالك → نتيجة واحدة | `search/02-owner-name/screenshot.png` | ✔ | Captured |
| `search/03-owner-phone` | البحث برقم الهاتف | `/#/properties` | كتابة رقم الهاتف → نتيجة واحدة | `search/03-owner-phone/screenshot.png` | ✔ | Captured |
| `search/04-district-neighborhood` | البحث بالمحافظة والمنطقة والحي | `/#/properties` | اختيار بغداد → الكرادة → كرادة داخل | `search/04-district-neighborhood/screenshot.png` | ✔ | Captured |
| `search/05-plot-number` | البحث برقم القطعة وحرفها | `/#/properties` | فتح الفلاتر الإضافية → رقم 3312 وحرف ب → نتيجة | `screenshot-filters-drawer.png` + `screenshot.png` | ✔ | Captured |
| `search/06-filters` | الفلاتر والشرائح | `/#/properties` | فلترة بالنوع والحالة → إزالة شريحة | `search/06-filters/screenshot.png` | ✔ | Captured |
| `search/07-sort-area` | الترتيب حسب المساحة | `/#/properties` | اختيار «المساحة: الأكبر أولاً» | `search/07-sort-area/screenshot.png` | ✔ | Captured |
| `search/08-sort-price` | الترتيب حسب السعر | `/#/properties` | اختيار «السعر: الأعلى» | `search/08-sort-price/screenshot.png` | ✔ | Captured |

## 6) المتابعات وسجل العمليات

| ID | الميزة | Route | خطوات العرض | Screenshot | Video | الحالة |
| -- | ------ | ----- | ----------- | ---------- | ----- | ------ |
| `followups/01-timeline` | سجل المتابعات | تفاصيل → المتابعات | فتح التبويب → عرض الخط الزمني | `followups/01-timeline/screenshot.png` | ✔ | Captured |
| `followups/02-create` | إضافة متابعة | تفاصيل → المتابعات | إضافة متابعة نوع «معاينة» بملاحظة → حفظ | `screenshot-form.png` + `screenshot.png` | ✔ | Captured |
| `audit/01-property-log` | سجل العمليات على العقار | تفاصيل → السجل | فتح التبويب → عرض من غيّر وماذا ومتى | `audit/01-property-log/screenshot.png` | ✔ | Captured |

## 7) المفضلة

| ID | الميزة | Route | خطوات العرض | Screenshot | Video | الحالة |
| -- | ------ | ----- | ----------- | ---------- | ----- | ------ |
| `favorites/01-add` | إضافة إلى المفضلة | `/#/properties` | نقر القلب → تصفية «المفضلة» | `screenshot-before.png` + `screenshot.png` | ✔ | Captured |
| `favorites/02-page` | صفحة المفضلة | `/#/favorites` | فتح الصفحة → عرض العروض المفضّلة | `favorites/02-page/screenshot.png` | ✔ | Captured |

## 8) التصدير والمشاركة

| ID | الميزة | Route | خطوات العرض | Screenshot | Video | الحالة |
| -- | ------ | ----- | ----------- | ---------- | ----- | ------ |
| `export/01-menu` | قائمة التصدير | تفاصيل → تصدير | فتح القائمة (طباعة/PDF/TXT/واتساب/إعلان) | `export/01-menu/screenshot.png` | ✔ | Captured |
| `export/02-pdf` | تصدير PDF | تفاصيل → تصدير | تصدير PDF → تنزيل الملف → رسالة نجاح | `export/02-pdf/screenshot.png` | ✔ | Captured |
| `export/03-txt` | تصدير TXT | تفاصيل → تصدير | تصدير TXT → تنزيل `V-0001.txt` | `export/03-txt/screenshot.png` | ✔ | Captured |
| `export/04-whatsapp` | مشاركة واتساب | تفاصيل → تصدير | نسخ النص الجاهز → تأكيد النسخ | `export/04-whatsapp/screenshot.png` | ✔ | Captured |
| `export/05-excel` | تصدير Excel | `/#/properties` | تصدير القائمة → تنزيل `.xlsx` | `export/05-excel/screenshot.png` | ✔ | Captured |

## 9) الاستيراد

| ID | الميزة | Route | خطوات العرض | Screenshot | Video | الحالة |
| -- | ------ | ----- | ----------- | ---------- | ----- | ------ |
| `import/01-excel` | استيراد Excel | `/#/properties` | اختيار ملف → ربط الأعمدة → تحقق → استيراد → النتيجة | `screenshot-step-1.png` + `screenshot-step-2-mapping.png` + `screenshot-step-3-validation.png` + `screenshot.png` | ✔ | Captured |

## 10) المواقع

| ID | الميزة | Route | خطوات العرض | Screenshot | Video | الحالة |
| -- | ------ | ----- | ----------- | ---------- | ----- | ------ |
| `locations/01-tree` | المحافظة/المنطقة/الحي | `/#/locations` | اختيار بغداد → المنصور → عرض الأحياء | `locations/01-tree/screenshot.png` | ✔ | Captured |
| `locations/02-add-neighborhood` | إضافة حي | `/#/locations` | إضافة «حي الأطباء» → حفظ → ظهوره | `screenshot-dialog.png` + `screenshot.png` | ✔ | Captured |

## 11) المستخدمون والصلاحيات

| ID | الميزة | Route | خطوات العرض | Screenshot | Video | الحالة |
| -- | ------ | ----- | ----------- | ---------- | ----- | ------ |
| `admin/01-users` | قائمة المستخدمين | `/#/users` | عرض المستخدمين وأدوارهم وحالتهم | `admin/01-users/screenshot.png` | ✔ | Captured |
| `admin/02-add-user` | إضافة مستخدم | `/#/users` | ملء الحوار → اختيار دور → حفظ | `screenshot-dialog.png` + `screenshot.png` | ✔ | Captured |
| `admin/03-roles` | الأدوار والصلاحيات | `/#/roles` | عرض الأدوار → فتح مجموعة صلاحيات | `admin/03-roles/screenshot.png` | ✔ | Captured |
| `admin/04-role-permissions` | تعديل صلاحيات دور | `/#/roles` | تعديل دور → تفعيل صلاحية → حفظ | `screenshot-dialog.png` + `screenshot.png` | ✔ | Captured |

## 12) الإعدادات والنسخ الاحتياطي

| ID | الميزة | Route | خطوات العرض | Screenshot | Video | الحالة |
| -- | ------ | ----- | ----------- | ---------- | ----- | ------ |
| `settings/01-overview` | صفحة الإعدادات | `/#/settings` | المظهر + الاتصال الخارجي + الأمان + النظام + النسخ | `settings/01-overview/screenshot.png` | ✔ | Captured |
| `settings/02-change-pin` | تغيير رمز PIN | `/#/settings` | فتح الحوار (بلا تنفيذ فعلي لإبقاء حساب التصوير صالحاً) | `settings/02-change-pin/screenshot.png` | ✔ | Captured |
| `settings/03-dark-mode` | الوضع الداكن | `/#/` | تبديل الثيم → إعادة رسم اللوحة داكنة | `settings/03-dark-mode/screenshot.png` | ✔ | Captured |
| `backup/01-create` | النسخ الاحتياطي | `/#/settings` | إنشاء نسخة → ظهورها في سجل النسخ | `screenshot-before.png` + `screenshot.png` | ✔ | Captured |
| `backup/02-restore` | الاستعادة | `/#/settings` | فتح حوار الاسترجاع وعرض نطاقاته (بلا تنفيذ) | `backup/02-restore/screenshot.png` | ✔ | Captured |

## 13) المساعدة

| ID | الميزة | Route | خطوات العرض | Screenshot | Video | الحالة |
| -- | ------ | ----- | ----------- | ---------- | ----- | ------ |
| `help/01-faq` | دليل الاستخدام | `/#/help` | فتح سؤال شائع وعرض إجابته | `help/01-faq/screenshot.png` | ✔ | Captured |

---

## ميزات مطلوبة في القائمة الأصلية لكنها غير قابلة للتصوير هنا

| الميزة | الحالة | السبب |
| ------ | ------ | ----- |
| First Run Wizard (`/#/first-run`) | Blocked | لا يظهر إلا وقاعدة البيانات غير مهيأة؛ تصويره يتطلب هدم قاعدة العرض أثناء الجلسة |
| التصدير اليدوي للنسخة الاحتياطية إلى مسار على القرص | Blocked | يحتاج حوار حفظ من نظام التشغيل (Electron) |
| تغيير مجلد النسخ الاحتياطي | Blocked | يحتاج حوار اختيار مجلد من نظام التشغيل |
| جدولة النسخ الاحتياطي بالبريد | Blocked | Electron safeStorage + SMTP، والمكوّن معطَّل أصلاً في صفحة الإعدادات |
| تنفيذ الاستعادة فعلياً | Skipped | يستبدل بيانات العرض ويُفسد بقية اللقطات؛ صُوِّر الحوار ونطاقاته فقط |
| تنفيذ تغيير رمز PIN فعلياً | Skipped | يُبطل حساب التصوير لبقية الجلسة؛ صُوِّر الحوار فقط |
| تشغيل الاتصال الخارجي (cloudflared) | Skipped | يشغّل عملية نظام خارجية؛ صُوِّرت الشاشة ضمن `settings/01-overview` بلا تفعيل |
| «تذكيرات انتهاء العرض» بالمعنى الحرفي | Skipped | لا توجد ميزة انتهاء صلاحية عرض في المشروع؛ أقرب ما هو موجود فعلاً هو تذكيرات المتابعة (`dashboard/02-reminders`) وعروض «تحتاج مراجعة» بعد 30 يوماً |
| «نوع السند» كحقل مستقل | — | موجود فعلاً باسم «جنس الأرض / الصفة القانونية» ومُصوَّر ضمن `properties/03-create` |
