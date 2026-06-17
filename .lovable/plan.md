
## نظرة عامة
إضافة 8 ميزات لإدارة الطلاب بالكامل مع دعم العمل بدون إنترنت.

## 1. تعديل وحذف الطلاب (شؤون الطلاب + admin)
- إضافة زر "تعديل" و "حذف" في صفحة تفاصيل الطالب `students.$id.tsx`.
- صفحة جديدة `students.$id.edit.tsx` بنفس فورم `students.new.tsx` لكن للتحديث.
- RLS policies: السماح لـ student_affairs و admin بـ UPDATE/DELETE على جدول students.

## 2. حقول جديدة في جدول students
- `birth_date` (date), `birth_place` (text), `gender` (text), `religion` (text)
- `mother_name` (text), `mother_national_id` (text), `father_national_id` (text)
- `guardian_job` (text), `address` (text), `phone2` (text)
- `is_transferred_in` (boolean) — محول للمدرسة عند الإضافة
- `transfer_out_type` (enum: 'transfer' | 'withdrawal' | null) — عند سحب الملف
- `transfer_out_date` (date), `archived_year` (text nullable للأرشفة)

## 3. حساب السن
- دالة client-side: تحسب السن بتاريخ `1/10/<السنة الدراسية الحالية>` (إذا الشهر >= 9، السنة هي السنة الحالية، وإلا السنة السابقة).
- يظهر في صفحة تفاصيل الطالب وقائمة الطلاب.

## 4. استيراد Excel (شؤون الطلاب)
- صفحة `imports.students.tsx`: رفع `.xlsx`، قراءة بـ `xlsx` library، معاينة الصفوف، إدخال جماعي.
- خريطة الأعمدة العربية → حقول DB (الاسم/الرقم القومي/...).
- تجميع تاريخ الميلاد من `12/20/2020` + اليوم/الشهر/السنة (الاحتياطية).
- bun add xlsx.

## 5. تصدير Excel كامل (شؤون الطلاب + finance)
- زر "تصدير Excel" في `students.index.tsx` يصدّر كل البيانات (مع الفلاتر الحالية).
- استخدام نفس `xlsx` library للكتابة.

## 6. طباعة PDF
- صفحة `students.$id.print.tsx`: dialog لاختيار الحقول المراد طباعتها (checkboxes).
- HTML قابل للطباعة + `window.print()` بـ CSS print mode، أو jsPDF.
- استخدام `window.print()` مع print stylesheet (أبسط، يعمل offline).

## 7. أرشفة السنوات (admin)
- صفحة `admin.archive.tsx`: زر "أرشفة السنة الحالية" → يضع `archived_year='2024/2025'` لكل الطلاب غير المؤرشفين.
- فلتر في قائمة الطلاب لإخفاء/إظهار المؤرشفين.
- صفحة `archive.index.tsx` لعرض السنوات المؤرشفة + بياناتها.

## 8. كشف المحولين/المسحوبين
- عند تحديث `delivery_tracking` لـ "ملف الطالب" إلى delivered=true، يظهر dialog يسأل: تحويل أم سحب؟ + تاريخ → يحدّث `transfer_out_type` و `transfer_out_date`.
- صفحة `transfers.index.tsx`: تعرض كل الطلاب اللي `transfer_out_type IS NOT NULL` مع فلتر (تحويل/سحب).

## 9. عمل Offline (PWA)
- تثبيت `vite-plugin-pwa` بإعدادات: `registerType: 'autoUpdate'`, `injectRegister: null`, `devOptions.enabled: false`.
- service worker registration wrapper بكل الحراس المطلوبين (preview/iframe/sw=off).
- manifest.webmanifest + icons + theme color.
- runtimeCaching: NetworkFirst للـ HTML، CacheFirst للـ assets الـ hashed، NetworkFirst للـ Supabase REST.
- **ملاحظة:** الكتابة على DB تحتاج إنترنت — Offline سيعمل للقراءة فقط من cache.

## التغييرات التقنية (موجزة)
- **Migration واحد**: ALTER TABLE students لإضافة الأعمدة، إنشاء enum `transfer_out_kind`، RLS policies للحذف/التعديل، فهرس على `archived_year`.
- **Libs**: `bun add xlsx vite-plugin-pwa`.
- **Routes جديدة**: `students.$id.edit.tsx`, `imports.students.tsx`, `archive.index.tsx`, `transfers.index.tsx`.
- **Routes معدّلة**: `students.new.tsx` (حقول جديدة + checkbox محول), `students.$id.tsx` (سن، أزرار تعديل/حذف، dialog تحويل عند تسليم الملف), `students.index.tsx` (زر تصدير + عمود السن + فلتر أرشيف), `app-shell.tsx` (روابط للصفحات الجديدة).
- **PWA**: `vite.config.ts`, `src/lib/pwa-register.ts`, `public/manifest.webmanifest`, `__root.tsx` head tags.

## ملاحظات
- استيراد Excel: ترتيب الأعمدة من المثال — اليوم=11, الشهر=9, السنة=5 يبدو غير منطقي لميلاد 2020؛ سأعتمد على عمود `تاريخ الميلاد` (12/20/2020) كمصدر أساسي وأتجاهل اليوم/الشهر/السنة المنفصلة إذا التاريخ موجود.
- Offline للقراءة فقط؛ التعديلات تحتاج اتصال.

هل أبدأ التنفيذ؟
