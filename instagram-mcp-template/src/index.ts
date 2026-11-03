/**
 * Instagram MCP Server - Cloudflare Workers
 * يعطي للوكيل أيدي وأعين للتحكم في إنستغرام + واتساب Business عبر MCP
 * 
 * الروابط:
 * - POST https://your-worker.workers.dev/mcp        -> MCP JSON-RPC (Streamable HTTP)
 * - GET  https://your-worker.workers.dev/            -> صفحة الشرح + زر الربط
 * - GET  https://your-worker.workers.dev/auth/login  -> تسجيل دخول إنستغرام بكليك
 * - GET  https://your-worker.workers.dev/health      -> فحص الصحة
 */

export interface Env {
  INSTAGRAM_ACCESS_TOKEN?: string;
  INSTAGRAM_USER_ID?: string;
  FACEBOOK_APP_ID?: string;
  FACEBOOK_APP_SECRET?: string;
  MCP_API_KEY?: string;
  MCP_SERVER_NAME?: string;
  MCP_SERVER_VERSION?: string;
}

// تخزين مؤقت للتوكن بعد تسجيل الدخول (في الذاكرة - للتجربة، في الإنتاج احفظه في KV/D1)
let CACHED_TOKEN: string | null = null;
let CACHED_USER_ID: string | null = null;
let CACHED_USERNAME: string | null = null;

function getEffectiveEnv(env: Env): Env {
  if (CACHED_TOKEN && CACHED_USER_ID) {
    return { ...env, INSTAGRAM_ACCESS_TOKEN: CACHED_TOKEN, INSTAGRAM_USER_ID: CACHED_USER_ID };
  }
  return env;
}

// ============ أدوات إنستغرام ============
const TOOLS = [
  { name: "instagram_get_profile", description: "جلب معلومات بروفايل إنستغرام: الاسم، البايو، عدد المتابعين، عدد المنشورات، صورة البروفايل", inputSchema: { type: "object", properties: {}, required: [] } },
  { name: "instagram_get_media", description: "جلب آخر منشورات إنستغرام (صور، فيديو، كاروسيل، ريلز)", inputSchema: { type: "object", properties: { limit: { type: "number", description: "عدد المنشورات (افتراضي 10)", default: 10 } }, required: [] } },
  { name: "instagram_get_media_details", description: "تفاصيل منشور واحد بالـ ID", inputSchema: { type: "object", properties: { media_id: { type: "string", description: "معرف المنشور" } }, required: ["media_id"] } },
  { name: "instagram_get_comments", description: "تعليقات منشور معين", inputSchema: { type: "object", properties: { media_id: { type: "string" }, limit: { type: "number", default: 10 } }, required: ["media_id"] } },
  { name: "instagram_create_media_container", description: "إنشاء منشور جديد (خطوة 1) - يحتاج Business", inputSchema: { type: "object", properties: { image_url: { type: "string" }, caption: { type: "string" }, media_type: { type: "string", enum: ["IMAGE", "VIDEO"], default: "IMAGE" } }, required: ["image_url", "caption"] } },
  { name: "instagram_publish_media", description: "نشر الحاوية (خطوة 2)", inputSchema: { type: "object", properties: { creation_id: { type: "string" } }, required: ["creation_id"] } },
  { name: "instagram_get_insights", description: "إحصائيات الحساب (Business فقط)", inputSchema: { type: "object", properties: { period: { type: "string", enum: ["day", "week", "days_28"], default: "day" } }, required: [] } },
  { name: "instagram_hashtag_search", description: "بحث هاشتاغ", inputSchema: { type: "object", properties: { hashtag: { type: "string" }, limit: { type: "number", default: 10 } }, required: ["hashtag"] } },
] as const;

const GRAPH_BASE = "https://graph.facebook.com/v21.0";

async function igFetch(env: Env, path: string, params: Record<string, string> = {}, method: "GET" | "POST" = "GET") {
  const eff = getEffectiveEnv(env);
  if (!eff.INSTAGRAM_ACCESS_TOKEN) return { mock: true, message: "⚠️ وضع Mock - سجل دخول عبر /auth/login للربط الحقيقي" };
  const url = new URL(`${GRAPH_BASE}${path}`);
  url.searchParams.set("access_token", eff.INSTAGRAM_ACCESS_TOKEN);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url.toString(), { method });
  const data = await res.json() as any;
  if (!res.ok) throw new Error(data?.error?.message || `Instagram API error: ${res.status}`);
  return data;
}

function mockData(tool: string, args: any) {
  return {
    _mode: "mock",
    _note: "بيانات تجريبية - سجل دخول عبر /auth/login لترى بياناتك الحقيقية",
    tool, args,
    example: {
      profile: { id: "17841400000000000", username: "vito_dz", followers_count: 12450, media_count: 342, biography: "Entrepreneur | وهران 🇩🇿" },
      media: [
        { id: "18000000000000001", caption: "غروب وهران 🌅 #oran", media_type: "IMAGE", like_count: 452, permalink: "https://instagram.com/p/ABC123/" },
      ],
    },
  };
}

async function callTool(name: string, args: any, env: Env) {
  const eff = getEffectiveEnv(env);
  const hasToken = !!eff.INSTAGRAM_ACCESS_TOKEN && !!eff.INSTAGRAM_USER_ID;
  if (!hasToken) return { content: [{ type: "text", text: JSON.stringify(mockData(name, args), null, 2) }] };
  try {
    switch (name) {
      case "instagram_get_profile": {
        const data = await igFetch(env, `/${eff.INSTAGRAM_USER_ID}`, { fields: "id,username,account_type,media_count,followers_count,follows_count,profile_picture_url,biography,name,website" });
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      }
      case "instagram_get_media": {
        const data = await igFetch(env, `/${eff.INSTAGRAM_USER_ID}/media`, { fields: "id,caption,media_type,media_url,thumbnail_url,permalink,timestamp,like_count,comments_count", limit: String(args.limit || 10) });
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      }
      case "instagram_get_media_details": {
        const data = await igFetch(env, `/${args.media_id}`, { fields: "id,caption,media_type,media_url,thumbnail_url,permalink,timestamp,like_count,comments_count" });
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      }
      case "instagram_get_comments": {
        const data = await igFetch(env, `/${args.media_id}/comments`, { fields: "id,text,username,timestamp", limit: String(args.limit || 10) });
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      }
      case "instagram_create_media_container": {
        const data = await igFetch(env, `/${eff.INSTAGRAM_USER_ID}/media`, { image_url: args.image_url, caption: args.caption }, "POST");
        return { content: [{ type: "text", text: JSON.stringify({ creation_id: data.id, status: "تم، الآن استعمل instagram_publish_media", raw: data }, null, 2) }] };
      }
      case "instagram_publish_media": {
        const data = await igFetch(env, `/${eff.INSTAGRAM_USER_ID}/media_publish`, { creation_id: args.creation_id }, "POST");
        return { content: [{ type: "text", text: JSON.stringify({ published_id: data.id, status: "✅ تم النشر!", raw: data }, null, 2) }] };
      }
      case "instagram_get_insights": {
        const data = await igFetch(env, `/${eff.INSTAGRAM_USER_ID}/insights`, { metric: "reach,profile_views", period: args.period || "day" });
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      }
      case "instagram_hashtag_search": {
        const search = await igFetch(env, `/ig_hashtag_search`, { q: args.hashtag });
        const hashtagId = (search as any)?.data?.[0]?.id;
        if (!hashtagId) throw new Error(`لا يوجد هاشتاغ #${args.hashtag}`);
        const media = await igFetch(env, `/${hashtagId}/recent_media`, { fields: "id,caption,permalink", user_id: eff.INSTAGRAM_USER_ID!, limit: String(args.limit || 10) });
        return { content: [{ type: "text", text: JSON.stringify({ hashtag: args.hashtag, media }, null, 2) }] };
      }
      default: throw new Error(`أداة غير معروفة: ${name}`);
    }
  } catch (e: any) { return { content: [{ type: "text", text: `❌ ${e.message}` }], isError: true }; }
}

async function handleMcpRpc(body: any, env: Env) {
  const { id, method, params } = body;
  if (method === "initialize") return { jsonrpc: "2.0", id, result: { protocolVersion: "2024-11-05", capabilities: { tools: { listChanged: false } }, serverInfo: { name: env.MCP_SERVER_NAME || "instagram-mcp", version: env.MCP_SERVER_VERSION || "1.0.0" }, instructions: "سيرفر إنستغرام MCP - Business/Entrepreneur جاهز" } };
  if (method === "notifications/initialized") return null;
  if (method === "ping") return { jsonrpc: "2.0", id, result: {} };
  if (method === "tools/list") return { jsonrpc: "2.0", id, result: { tools: TOOLS } };
  if (method === "tools/call") { const r = await callTool(params.name, params.arguments || {}, env); return { jsonrpc: "2.0", id, result: r }; }
  if (method === "resources/list") return { jsonrpc: "2.0", id, result: { resources: [] } };
  if (method === "prompts/list") return { jsonrpc: "2.0", id, result: { prompts: [] } };
  return { jsonrpc: "2.0", id, error: { code: -32601, message: `Method not found: ${method}` } };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const corsHeaders: Record<string, string> = {
      "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization, mcp-session-id", "Access-Control-Expose-Headers": "mcp-session-id"
    };
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });

    const eff = getEffectiveEnv(env);
    const isLive = !!eff.INSTAGRAM_ACCESS_TOKEN && !!eff.INSTAGRAM_USER_ID;
    const redirectUri = `${url.origin}/auth/callback`;

    // ===== AUTH: Login =====
    if (url.pathname === "/auth/login") {
      if (!env.FACEBOOK_APP_ID) {
        const html = `<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>ربط إنستغرام</title><style>body{font-family:system-ui;max-width:700px;margin:40px auto;padding:20px;background:#0a0a0a;color:#e5e5e5} .card{border:1px solid #2a2a2a;background:#111;border-radius:14px;padding:20px} code{background:#1a1a1a;padding:10px;display:block;border-radius:8px;margin:10px 0;overflow:auto} a{color:#f472b6}</style></head><body><h1>🔑 إعداد تسجيل الدخول</h1><div class="card"><p>للتفعيل بكليك واحد، لازم تنشئ App مرة واحدة (دقيقتين):</p><ol><li>روح <a href="https://developers.facebook.com/apps" target="_blank">developers.facebook.com/apps</a> > Create App > Business</li><li>أضف منتج <b>Facebook Login</b> + <b>Instagram Graph API</b></li><li>في Settings > Basic انسخ <b>App ID</b> و <b>App Secret</b></li><li>في Facebook Login > Settings ضع Valid OAuth Redirect URIs:<br><code>${redirectUri}</code></li><li>في Cloudflare Dashboard > Workers > ${env.MCP_SERVER_NAME || "instagram-mcp"} > Settings > Variables ضع:<br><code>FACEBOOK_APP_ID = ...<br>FACEBOOK_APP_SECRET = ...</code> ثم Deploy</li><li>ارجع هنا واضغط تسجيل دخول مرة أخرى</li></ol><p>— أو استعمل الطريقة اليدوية: ضع <code>INSTAGRAM_ACCESS_TOKEN</code> و <code>INSTAGRAM_USER_ID</code> مباشرة في Variables.</p><p><a href="/">← رجوع</a></p></div></body></html>`;
        return new Response(html, { headers: { ...corsHeaders, "Content-Type": "text/html; charset=utf-8" } });
      }
      const scope = "instagram_basic,instagram_content_publish,instagram_manage_insights,pages_show_list,pages_read_engagement";
      const authUrl = `https://www.facebook.com/v21.0/dialog/oauth?client_id=${env.FACEBOOK_APP_ID}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${encodeURIComponent(scope)}&response_type=code&state=instagram`;
      return Response.redirect(authUrl, 302);
    }

    // ===== AUTH: Callback =====
    if (url.pathname === "/auth/callback") {
      const code = url.searchParams.get("code");
      const error = url.searchParams.get("error_description") || url.searchParams.get("error");
      if (error) return new Response(`<h1>❌ خطأ: ${error}</h1><a href="/">رجوع</a>`, { headers: { ...corsHeaders, "Content-Type": "text/html; charset=utf-8" } });
      if (!code) return new Response("لا يوجد code", { status: 400, headers: corsHeaders });
      try {
        // 1. code -> access_token
        const tokenRes = await fetch(`https://graph.facebook.com/v21.0/oauth/access_token?client_id=${env.FACEBOOK_APP_ID}&client_secret=${env.FACEBOOK_APP_SECRET}&redirect_uri=${encodeURIComponent(redirectUri)}&code=${code}`);
        const tokenData = await tokenRes.json() as any;
        if (!tokenRes.ok) throw new Error(tokenData.error?.message || "فشل الحصول على التوكن");
        let accessToken = tokenData.access_token;

        // 2. long-lived token
        try {
          const longRes = await fetch(`https://graph.facebook.com/v21.0/oauth/access_token?grant_type=fb_exchange_token&client_id=${env.FACEBOOK_APP_ID}&client_secret=${env.FACEBOOK_APP_SECRET}&fb_exchange_token=${accessToken}`);
          const longData = await longRes.json() as any;
          if (longRes.ok && longData.access_token) accessToken = longData.access_token;
        } catch {}

        // 3. get pages -> instagram account
        let igUserId: string | null = null;
        let igUsername: string | null = null;
        try {
          const pagesRes = await fetch(`https://graph.facebook.com/v21.0/me/accounts?fields=id,name,instagram_business_account{id,username}&access_token=${accessToken}`);
          const pagesData = await pagesRes.json() as any;
          const pageWithIg = pagesData.data?.find((p: any) => p.instagram_business_account);
          if (pageWithIg) { igUserId = pageWithIg.instagram_business_account.id; igUsername = pageWithIg.instagram_business_account.username; }
        } catch {}
        // fallback: try direct me
        if (!igUserId) {
          try {
            const meRes = await fetch(`https://graph.facebook.com/v21.0/me?fields=id,name&access_token=${accessToken}`);
            const meData = await meRes.json() as any;
            igUsername = meData.name || null;
          } catch {}
        }

        // store in memory for this sandbox
        CACHED_TOKEN = accessToken;
        if (igUserId) CACHED_USER_ID = igUserId;
        if (igUsername) CACHED_USERNAME = igUsername;

        const html = `<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>تم الربط ✅</title><style>body{font-family:system-ui;max-width:700px;margin:40px auto;padding:20px;background:#0a0a0a;color:#e5e5e5} .ok{color:#22c55e} .card{border:1px solid #2a2a2a;background:#111;border-radius:14px;padding:20px;margin:14px 0} code{background:#1a1a1a;padding:10px;display:block;border-radius:8px;overflow:auto;word-break:break-all}</style></head><body><h1 class="ok">✅ تم ربط إنستغرام بنجاح!</h1><div class="card"><p><b>الحساب:</b> ${igUsername ? "@" + igUsername : "مربوط"} ${igUserId ? `(ID: ${igUserId})` : ""}</p><p><b>الوكيل الآن يتحكم في حسابك</b> - يقدر يقرأ وينشر ويحلل.</p><p>للاستخدام الدائم بعد إعادة التشغيل، احفظ هذين في Cloudflare Workers > Settings > Variables:</p><code>INSTAGRAM_ACCESS_TOKEN=${accessToken.slice(0, 30)}...<br>INSTAGRAM_USER_ID=${igUserId || "ضع الآي دي من /me/accounts"}</code><p><small>التوكن الحالي محفوظ مؤقتاً هنا ويعمل الآن. للتجربة قل للوكيل: "جيب بروفايلي"</small></p><p><a href="/" style="color:#f472b6">→ رجوع للسيرفر</a> | <a href="/auth/status" style="color:#f472b6">فحص الحالة</a></p></div></body></html>`;
        return new Response(html, { headers: { ...corsHeaders, "Content-Type": "text/html; charset=utf-8" } });
      } catch (e: any) {
        return new Response(`<h1>❌ فشل: ${e.message}</h1><p>تأكد من FACEBOOK_APP_ID/SECRET و Redirect URI: ${redirectUri}</p><a href="/auth/login">حاول مرة أخرى</a>`, { headers: { ...corsHeaders, "Content-Type": "text/html; charset=utf-8" } });
      }
    }

    if (url.pathname === "/auth/status") {
      return new Response(JSON.stringify({ live: isLive, username: CACHED_USERNAME || null, user_id: eff.INSTAGRAM_USER_ID || null, has_app_id: !!env.FACEBOOK_APP_ID, redirect_uri: redirectUri, time: new Date().toISOString() }, null, 2), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    if (url.pathname === "/auth/logout") {
      CACHED_TOKEN = null; CACHED_USER_ID = null; CACHED_USERNAME = null;
      return Response.redirect(`${url.origin}/`, 302);
    }

    // ===== Landing =====
    if (url.pathname === "/" && request.method === "GET") {
      const html = `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Instagram MCP Server 🇩🇿</title>
<style>
  body{font-family:system-ui,Tahoma;max-width:860px;margin:40px auto;padding:0 20px;background:#0a0a0a;color:#e5e5e5;line-height:1.8}
  h1{font-size:28px} h2{margin-top:28px;color:#f472b6} code,pre{background:#1a1a1a;border:1px solid #2a2a2a;padding:12px;border-radius:10px;overflow:auto;word-break:break-all}
  a{color:#f472b6} .card{border:1px solid #2a2a2a;background:#111;border-radius:14px;padding:18px;margin:14px 0}
  .badge{display:inline-block;background:#f472b6;color:#000;padding:4px 10px;border-radius:999px;font-weight:700;font-size:12px}
  .ok{color:#22c55e} .warn{color:#f59e0b} .btn{display:inline-block;background:#f472b6;color:#000;padding:12px 22px;border-radius:10px;font-weight:800;text-decoration:none;margin:6px 0}
  .btn2{display:inline-block;background:#1a1a1a;color:#e5e5e5;border:1px solid #2a2a2a;padding:10px 18px;border-radius:10px;text-decoration:none;margin:4px}
</style>
</head>
<body>
<h1>📸 Instagram MCP Server <span class="badge">Business / Entrepreneur جاهز</span></h1>
<p>سيرفرك الخاص في <b>workflowvito</b> - يعطي للوكيل (أنا) <b>أيدي وأعين</b> للتحكم الكامل في إنستغرام + واتساب Business.</p>

<div class="card" style="border-color:${isLive ? "#22c55e" : "#f472b6"}">
  <h2>${isLive ? "✅ مربوط ويتحكم الآن" : "🔴 غير مربوط - سجل دخول"}</h2>
  ${isLive ? `<p class="ok">مربوط: <b>${CACHED_USERNAME ? "@" + CACHED_USERNAME : eff.INSTAGRAM_USER_ID}</b> - الوكيل يقدر ينشر ويقرأ الآن.</p><p><a class="btn2" href="/auth/status">فحص الحالة</a> <a class="btn2" href="/auth/logout">قطع الاتصال</a></p>` : `<p class="warn">الوضع الحالي Mock - سجل دخول باش يولي حقيقي ويبقى يتحكم.</p><a class="btn" href="/auth/login">🔗 سجل دخول بإنستغرام (كليك واحد)</a><p><small>يربط حسابك Business/Entrepreneur + صفحة Facebook تلقائياً</small></p>`}
  ${!env.FACEBOOK_APP_ID ? `<p><small>⚠️ لم تضبط FACEBOOK_APP_ID بعد - الضغط سيعرض دليل الإنشاء (دقيقتين)</small></p>` : ``}
</div>

<div class="card">
  <h2>🔗 رابط الـ MCP للوكيل</h2>
  <pre>https://${url.host}/mcp</pre>
  <p>الصقه في Claude Desktop / Cursor / Windsurf. أنا هنا أستخدمه مباشرة - قل لي "جيب بروفايلي" وأنفذ.</p>
</div>

<div class="card">
  <h2>🛠️ أوامر جاهزة (قلها لي)</h2>
  <ul>
    <li>"جيب بروفايلي" → <code>instagram_get_profile</code></li>
    <li>"جيب آخر 3 منشوراتي" → <code>instagram_get_media</code></li>
    <li>"انشر هادي الصورة https://... مع كابشن ..."</li>
    <li>"حلل تعليقات آخر بوست"</li>
    <li>"شوف هاشتاغ #oran"</li>
  </ul>
</div>

<div class="card">
  <p><b>الحالة:</b> ${isLive ? '<span class="ok">● Live ✅ يتحكم</span>' : '<span class="warn">● Mock (سجل دخول للـ Live)</span>'} | <a href="/health">health</a> | <a href="/mcp">/mcp</a> | <a href="/auth/status">status</a></p>
  <p><small>يشتغل حتى لو حسابك Entrepreneur - المهم محول لـ Business ومربوط بصفحة. وهران 🇩🇿</small></p>
</div>
</body>
</html>`;
      return new Response(html, { headers: { ...corsHeaders, "Content-Type": "text/html; charset=utf-8" } });
    }

    if (url.pathname === "/health") {
      return new Response(JSON.stringify({ ok: true, service: "instagram-mcp", mode: isLive ? "live" : "mock", username: CACHED_USERNAME, tools: TOOLS.length, has_app: !!env.FACEBOOK_APP_ID, time: new Date().toISOString() }, null, 2), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (url.pathname === "/mcp" || url.pathname === "/sse") {
      if (request.method === "GET") {
        if (request.headers.get("accept")?.includes("text/event-stream")) {
          const stream = new ReadableStream({ start(c) { const e = new TextEncoder(); c.enqueue(e.encode(`event: message\ndata: ${JSON.stringify({ jsonrpc: "2.0", method: "notifications/message", params: { level: "info", data: "Instagram MCP connected" } })}\n\n`)); c.close(); } });
          return new Response(stream, { headers: { ...corsHeaders, "Content-Type": "text/event-stream", "Cache-Control": "no-cache" } });
        }
        return new Response(JSON.stringify({ name: env.MCP_SERVER_NAME || "instagram-mcp", version: "1.0.0", protocol: "2024-11-05", endpoint: `https://${url.host}/mcp`, tools: TOOLS.map(t => t.name), mode: isLive ? "live" : "mock" }, null, 2), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      if (request.method === "POST") {
        try {
          const body = await request.json() as any;
          if (Array.isArray(body)) {
            const results = await Promise.all(body.map((b) => handleMcpRpc(b, env)));
            const filtered = results.filter(Boolean);
            return new Response(JSON.stringify(filtered.length === 1 ? filtered[0] : filtered), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
          } else {
            const result = await handleMcpRpc(body, env);
            if (result === null) return new Response(null, { status: 204, headers: corsHeaders });
            return new Response(JSON.stringify(result), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
          }
        } catch (e: any) { return new Response(JSON.stringify({ jsonrpc: "2.0", id: null, error: { code: -32603, message: e.message } }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }); }
      }
    }

    return new Response("Not found - جرب / أو /mcp أو /auth/login", { status: 404, headers: corsHeaders });
  },
} satisfies ExportedHandler<Env>;
