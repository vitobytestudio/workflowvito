# الطريقة الكاملة - Instagram & Facebook MCP SaaS للفريلانسر الجزائري

> انسخ هذا الملف لجلسة جديدة لمساعد آخر ليفهم أين نحن

## 1) أين نحن الآن؟
- المستودع: `vitobytestudio/workflowvito` (قوالب Cloudflare Workers - 44 قالب)
- الفرع النشط: `arena/1f9bcae5-workflowvito` (active)
- الموقع: وهران - الجزائر - Entrepreneur (مقاول ذاتي 0.5% ضريبة)
- الهدف: تحويل مشكل الفريلانسر (يضيع ساعات يبحث عن زبون في مجموعات فيسبوك) إلى SaaS يبيع **زبائن حاضرين وسخونين** بقراءة فقط بدون لمس

## 2) ما هو MCP؟
Model Context Protocol من Anthropic (معيار 2024-11-05). يعطي للوكيل:
- **العيون = Resources** (قراءة ملفات، Gmail، Notion، DB)
- **الأيدي = Tools** (نشر، إرسال إيميل، تحكم)
- **الدماغ = Prompts/Skills** (وصفات جاهزة)
البنية: Host (Claude/Cursor/Arena) -> Client -> Server (يشتغل بـ `npx` أو رابط `https://.../mcp` Streamable HTTP + SSE)

## 3) ماذا بنينا في هذه الجلسة؟

### A) instagram-mcp-template (منفصل، كامل)
- المسار: `instagram-mcp-template/` - Cloudflare Worker على `8788`
- البروتوكول: MCP 2024-11-05 + Instagram Graph API v21.0
- 10 أدوات:
  - **بدون توكن (معلومات غير حساسة فقط - قراءة):**
    - `instagram_get_public_profile` (username) - بايو، متابعين للحسابات العامة
    - `instagram_get_public_hashtag` (hashtag)
  - **تحتاج توكن (وقفناها لطلبك قراءة فقط):**
    - `instagram_get_profile`, `instagram_get_media`, `instagram_get_media_details`, `instagram_get_comments`, `instagram_create_media_container`, `instagram_publish_media`, `instagram_get_insights`, `instagram_hashtag_search`
- ملفات: `src/index.ts` + `src/public-fetch.ts` (جلب عام بدون توكن)
- منطق: `getEffectiveEnv()` يدمج `CACHED_TOKEN` بعد OAuth + `callTool()` يفصل العام قبل فحص التوكن
- الصفحات: `/` (زر ربط), `/auth/login` -> Facebook OAuth, `/auth/callback` (يحول قصير->طويل + يجيب IG User ID من `/me/accounts`), `/auth/status`, `/auth/logout`, `/health`, `/mcp` (POST JSON-RPC + GET info + SSE)
- متغيرات: `INSTAGRAM_ACCESS_TOKEN`, `INSTAGRAM_USER_ID`, `FACEBOOK_APP_ID`, `FACEBOOK_APP_SECRET`, `MCP_API_KEY`, `MCP_SERVER_NAME/VERSION`
- حالة: `mock` بدون توكن، `live` مع توكن - مجرب: `curl POST /mcp tools/list` = 10 tools

### B) facebook-mcp-template (قراءة فقط بدون لمس - جديد)
- المسار: `facebook-mcp-template/` - على `8789`
- 4 أدوات كلها قراءة فقط:
  - `facebook_get_public_page` (page) - عنوان ووصف صفحة عامة
  - `facebook_get_public_posts` (page, limit) - منشورات صفحة عامة
  - `facebook_get_public_group_posts` (group) - **المجموعات الأكثر نشاطا** - عامة فقط
  - `facebook_get_page_insights_readonly` (page_id) - يحتاج Page Token قراءة فقط اختياري
- ملفات: `src/index.ts` + `src/public-fetch.ts` + `src/groups.ts`
- ملاحظة الشبكة: في Sandbox مسموح فقط `github.com, registry.npmjs.org, pypi.org` لذا `fetch facebook.com` يفشل `Network connection lost` محلياً لكن ينجح بعد Deploy على Cloudflare (إنترنت كامل)

## 4) القراءة فقط بدون لمس (طلبك الأساسي)
- فعلنا فصل: أدوات `public_*` تعمل **بدون توكن** للحسابات/الصفحات العامة
- أدوات النشر/التعليق/الإحصائيات الخاصة تتطلب `INSTAGRAM_ACCESS_TOKEN` + `INSTAGRAM_USER_ID` (Business/Creator + صفحة FB)
- حتى مع التوكن يمكن طلب scope `instagram_basic` فقط بدون `instagram_content_publish` لضمان قراءة فقط

## 5) SaaS الفريلانسر - المنتج
- الفكرة: نبيع للفريلانسر الجزائري زبائن حاضرين (منشور "مطلوب مصمم") بدل ما يقلب هو
- التسعير المقترح: مجاني 5/أسبوع، Pro 1,990 دج/شهر، Agence 4,990 دج/شهر (BaridiMob/CCP)
- لماذا فيسبوك مجموعات؟ لأنها الأكثر نشاطا - الصفحات هادئة (تمت إضافة `groups.ts` لهذا)
- محدودية فيسبوك: مجموعات **عامة** نجيبها، **خاصة** تحتاج موافقة أدمن + تثبيت App (قانون فيسبوك من 2024)

## 6) الأتمتة التي لم ننشر بعد (مخططة)
- Cron كل 5-10 دقائق: `facebook-mcp + instagram-mcp -> D1`
- فلترة AI: "مطلوب X" = زبون
- حفظ: `leads` جدول بـ `created_at`
- حذف تلقائي كل 24 ساعة: `DELETE FROM leads WHERE created_at < datetime('now', '-1 day')`
- واجهة: `saas-admin-template` الموجودة في workflowvito
- نستخدم `workflows-starter-template` + `D1` في workflowvito

## 7) النشر
```bash
cd instagram-mcp-template
npm install --legacy-peer-deps
cp .dev.vars.example .dev.vars # ضع التوكنات
npm run dev -- --port 8788 # محلي
npm run deploy # يطلع https://instagram-mcp-template.<subdomain>.workers.dev/mcp

cd ../facebook-mcp-template
npm run deploy # https://facebook-mcp-template.../mcp
```
- في Cloudflare Dashboard: Workers -> Settings -> Variables -> ضع `FACEBOOK_APP_ID`, `FACEBOOK_APP_SECRET`, `INSTAGRAM_ACCESS_TOKEN`, etc.
- OAuth Redirect: `https://.../auth/callback` + `http://localhost:8788/auth/callback` في Facebook Login Settings
- إضافة في `templates.json`: hash = `sha1(package.json)` (حسبنا: instagram `05353...`, facebook `399c95...`)

## 8) الحالة الحالية
- الفرع مدفوع: `9bcb7cc`, `8a7c9a5`, `d02d996`, `c877868`, `11187e1` (آخرها groups)
- السيرفرين يشتغلان محلياً: 8788 + 8789 - مجربين بـ curl
- الوضع: mock/public (بدون توكن حقيقي) - جاهزان للتحول live بمجرد وضع App ID
- لم ننشر على Cloudflare بعد، لم نركب Cron/D1 بعد - هذا المخطط للجلسة القادمة

## 9) ماذا تقول للمساعد في الجلسة الجديدة؟
انسخ:
> نحن على فرع `arena/1f9bcae5-workflowvito` في `workflowvito` - بنينا `instagram-mcp-template` (10 tools, قراءة فقط عامة بدون توكن) و `facebook-mcp-template` (4 tools + دعم المجموعات العامة الأكثر نشاطا) - كلاهما MCP 2024-11-05 قراءة فقط بدون لمس - نريد الآن تفعيل SaaS حقيقي: Cron + D1 + حذف 24سا + واجهة saas-admin + نشر على Cloudflare - ساعدني نكمل من هنا

## 10) ملفات مهمة
- `instagram-mcp-template/.dev.vars.example`, `README.md`, `wrangler.jsonc`
- `facebook-mcp-template/` نفس الهيكل
- `templates.json` محدث
- هذا الملف `METHOD.md`
