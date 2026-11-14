# Grade 9 Hub — MVP

موقع ثابت (HTML + JS) مع Supabase للتخزين. بدون build.

## تجربة سريعة (بدون إعداد)
```
cd school-market
python3 -m http.server 8000
```
افتح `http://localhost:8000`. بدون مفاتيح Supabase الموقع يشتغل بوضع تجريبي:
- البائع: `/seller.html?t=demo`
- الليدر: `/leader.html?t=demo`

## الإعداد الحقيقي (٥ دقائق)
1. أنشئ مشروع Supabase مجاني.
2. SQL Editor → الصق `supabase/schema.sql` → Run.
3. Project Settings → API → انسخ `Project URL` و `anon public key` إلى `js/config.js`.
4. أضف البائعين والمنتجات (Table Editor أو SQL):
   ```sql
   insert into sellers (name) values ('اسم البائع');
   insert into products (seller_id, name, price, category)
     select id, 'شيبس ليز', 0.5, 'chips' from sellers where name = 'اسم البائع';
   -- التصنيفات: chips, drinks, sandwiches, sweets, other
   select name, token from sellers;   -- التوكن = رابط البائع الخاص
   ```
   رابط البائع: `https://موقعك/seller.html?t=التوكن`
5. الليدرز: `insert into leaders (name, class_name) values ('الاسم','9A');` ثم `select name, token from leaders;`
   رابط الليدر: `https://موقعك/leader.html?t=التوكن`
6. انشر المجلد على Vercel كموقع ثابت.

## إعلانات البائع وواتساب
البائع يفتح صفحته الخاصة وينشر إعلانه بنفسه (اسم، سعر، تصنيف). السعر الأقل من دينار ينعرض بالقروش (0.35 = 35 قرش). ويقدر يخفي الإعلان أو يظهره بأي وقت.
- زر "واتساب" على الإعلان يظهر فقط لو البائع حط رقمه بنفسه من صفحته. الرقم يظهر لكل زوار الموقع، فخلّي أهل البائع موافقين.
- السكربت `supabase/003_seller_ads.sql` لقاعدة بيانات موجودة أصلًا، وهو مدمج بـ`schema.sql` للسنوات الجاية.
- لإخفاء إعلان مخالف من عندك: `update products set available = false where id = '...';`

## الطلبات الخاصة
الطالب يكتب شو بدو (مثال: "دوريتوس كبير") من زر "اطلب شي خاص". الطلب يظهر لكل البائعين بصفحاتهم، وأول بائع يضغط "أقبل الطلب" يكسبه. الطالب يتابع الحالة من نفس المتصفح (تحت "طلباتي الخاصة") بدون حساب.
- ملاحظة: الطالب يتابع طلبه بتوكن محفوظ بمتصفحه. لو مسح بيانات المتصفح أو غيّر جهازه ما يشوف طلباته القديمة.
- السكربت `supabase/002_special_requests.sql` لقاعدة بيانات موجودة أصلًا. وهو مدمج بـ`schema.sql` للسنوات الجاية.

## ملاحظات
- التوكن هو "كلمة السر" للبائع/الليدر. لا تنشر الروابط الخاصة بالجروبات.
- الزوار ما يقدروا يقرأوا الطلبات ولا الرسائل. فقط يرسلوا (RLS في schema.sql).
- الطلب يحفظ اسم + صف فقط، بدون أرقام هواتف.
- لحذف بائع من الموقع: `update sellers set active = false where name = '...';`
- شروط Vercel Hobby تقيّد الاستخدام التجاري. راجعها لو بدأ الدفع فعلًا.
