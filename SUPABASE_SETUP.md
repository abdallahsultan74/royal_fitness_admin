# Supabase Setup (Free Plan)

هذا المشروع جاهز الآن بقاعدة بيانات Supabase كاملة (schema + RLS + seed) داخل:

- `supabase/migrations/20260415111000_init_royal_fitness.sql`
- `supabase/seed.sql`

## 1) Login للـ Supabase CLI

```bash
npx supabase login
```

بديل بدون المتصفح:

```bash
set SUPABASE_ACCESS_TOKEN=YOUR_TOKEN
```

## 2) ربط المشروع بالـ Supabase Project

```bash
npx supabase link --project-ref thndmcqsjoejqnvfbnto
```

## 3) تطبيق الـ Database schema + policies

```bash
npx supabase db push
```

## 4) (اختياري) تشغيل seed data

```bash
npx supabase db reset
```

> `db reset` يعيد إنشاء القاعدة محليًا/مرتبطًا حسب السياق، فاستخدمه بحذر على بيانات موجودة.

## بنية الجداول

- `public.profiles`
- `public.exercises`
- `public.workout_sessions`
- `public.workout_session_items`
- `public.daily_stats`

## ملخص الأمان (RLS)

- المستخدم العادي يصل فقط لبياناته (`auth.uid()`).
- الأدمن (claim: `app_metadata.admin = true`) له صلاحيات الإدارة.
- `exercises` قراءة لكل مستخدم مسجل، وكتابة للأدمن فقط.

## ملاحظة مهمة

لا تضع `service_role` داخل تطبيق Flutter أو واجهة React. استخدمه فقط في سكربتات آمنة أو Functions.
