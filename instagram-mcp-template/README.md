# 📸 Instagram MCP Server — سيرفر إنستغرام للوكيل

هذا سيرفر **MCP (Model Context Protocol)** مبني على **Cloudflare Workers** يعطي لأي وكيل ذكي (Claude, Cursor, Arena...) **أيدي وأعين** يتحكم بها في إنستغرام.

> فكرة MCP = USB-C للذكاء الاصطناعي. بدل ما تبرمج API لكل منصة، تعطي للوكيل رابط واحد وهو يفهم وحده واش يقدر يدير.

موجود الآن في مساحة عملك `workflowvito/instagram-mcp-template` — تقدر تشغله محلياً أو تنشره وتحصل على رابط تلصقه في وكيلك.

---

## 🔗 الرابط بعد النشر

```
https://instagram-mcp-template.<your-subdomain>.workers.dev/mcp
```

يدعم:
- **Streamable HTTP** (المعيار الجديد 2024-11-05) — `POST /mcp`
- **SSE** للتوافق القديم — `GET /mcp` مع `Accept: text/event-stream`

---

## 🛠️ الأدوات (8 أدوات)

| الأداة | وش تدير |
|--------|----------|
| `instagram_get_profile` | بروفايل، بايو، متابعين |
| `instagram_get_media` | آخر المنشورات/ريلز |
| `instagram_get_media_details` | تفاصيل منشور واحد |
| `instagram_get_comments` | تعليقات منشور |
| `instagram_create_media_container` | إنشاء منشور (خطوة 1) |
| `instagram_publish_media` | نشر المنشور (خطوة 2) |
| `instagram_get_insights` | إحصائيات Business |
| `instagram_hashtag_search` | بحث هاشتاغ |

بدون توكن = **وضع Mock** ببيانات تجريبية للتجربة.
مع توكن = **Live** يقرأ/ينشر من حسابك الحقيقي.

---

## 🚀 التشغيل المحلي (هنا في مساحتك)

```bash
cd instagram-mcp-template
npm install
# ضع التوكن (اختياري للتجربة الحقيقية)
cp .dev.vars.example .dev.vars
# عدّل .dev.vars وضع التوكن الحقيقي
npm run dev
# يفتح على http://localhost:8788
# جرّب: http://localhost:8788/  و http://localhost:8788/mcp
```

اختبار سريع:
```bash
curl -X POST http://localhost:8788/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}'

curl -X POST http://localhost:8788/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"instagram_get_profile","arguments":{}}}'
```

---

## 🔑 ربط حساب إنستغرام الحقيقي

1. روح https://developers.facebook.com/apps > Create App > Business
2. أضف منتج **Instagram Graph API** واربط صفحة فيسبوك بحساب إنستغرام Business/Creator (لازم تحوّل حسابك لـ Business من إعدادات إنستغرام)
3. من **Graph Explorer** ولّد `Long-Lived Access Token` + انسخ `IG User ID`
4. في Cloudflare Dashboard > Workers > `instagram-mcp-template` > Settings > Variables:
   ```
   INSTAGRAM_ACCESS_TOKEN = EAAH... (التوكن الطويل)
   INSTAGRAM_USER_ID = 178414...
   MCP_API_KEY = sk_... (اختياري لحماية الرابط)
   ```
5. `npm run deploy` — خلاص!

> ملاحظة: النشر يحتاج Business/Creator. الحساب الشخصي العادي لا يسمح بالنشر عبر API.

---

## 🔌 ربطه بوكيلك

### Claude Desktop (`claude_desktop_config.json`)

```json
{
  "mcpServers": {
    "instagram": {
      "command": "npx",
      "args": ["-y", "mcp-remote", "https://instagram-mcp-template.YOUR_SUBDOMAIN.workers.dev/mcp", "--header", "Authorization: Bearer YOUR_MCP_API_KEY"]
    }
  }
}
```

### Cursor / Windsurf / VS Code

ألصق الرابط مباشرة في إعدادات MCP:
```
https://instagram-mcp-template.YOUR_SUBDOMAIN.workers.dev/mcp
Header: Authorization: Bearer YOUR_MCP_API_KEY
```

بعدها قل للوكيل:
- "جيب لي آخر 5 منشوراتي وشوف واش ناقص"
- "حلل تعليقات آخر بوست ورد على الناس"
- "انشر لي صورة https://... مع كابشن ..."
- "شوف هاشتاغ #oran وجيب لي أفكار"

---

## 🛡️ الأمان

- لا تشارك `INSTAGRAM_ACCESS_TOKEN` علناً — ضعه كـ Secret في Workers
- فعّل `MCP_API_KEY` حتى لا يستعمل رابطك أي واحد
- راجع صلاحيات التوكن (لا تعطِ `ads_management` إذا ما تحتاجه)

---

## 📂 الهيكل

```
instagram-mcp-template/
├── src/index.ts          # كل منطق MCP + Instagram API
├── wrangler.jsonc        # إعداد Cloudflare
├── package.json
└── .dev.vars.example
```

مبني بـ Hono + Cloudflare Workers + Instagram Graph API v21.0

— وهران 🇩🇿
