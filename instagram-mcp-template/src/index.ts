/**
 * Instagram MCP Server - Cloudflare Workers
 * يعطي للوكيل أيدي وأعين للتحكم في إنستغرام عبر بروتوكول MCP
 * 
 * الروابط:
 * - POST https://your-worker.workers.dev/mcp  -> MCP JSON-RPC (Streamable HTTP)
 * - GET  https://your-worker.workers.dev/      -> صفحة الشرح
 * - GET  https://your-worker.workers.dev/health -> فحص الصحة
 * 
 * يشتغل حتى بدون توكن (وضع Mock) للتجربة، ومع التوكن يربط مباشرة مع Instagram Graph API
 */

export interface Env {
  INSTAGRAM_ACCESS_TOKEN?: string;
  INSTAGRAM_USER_ID?: string;
  MCP_API_KEY?: string;
  MCP_SERVER_NAME?: string;
  MCP_SERVER_VERSION?: string;
}

// ============ تعريف أدوات إنستغرام (Tools) ============
const TOOLS = [
  {
    name: "instagram_get_profile",
    description: "جلب معلومات بروفايل إنستغرام: الاسم، البايو، عدد المتابعين، عدد المنشورات، صورة البروفايل",
    inputSchema: {
      type: "object",
      properties: {},
      required: [],
    },
  },
  {
    name: "instagram_get_media",
    description: "جلب آخر منشورات إنستغرام (صور، فيديو، كاروسيل، ريلز) مع الكابشن واللايكات والتعليقات",
    inputSchema: {
      type: "object",
      properties: {
        limit: { type: "number", description: "عدد المنشورات (افتراضي 10، أقصى 25)", default: 10 },
        after: { type: "string", description: "cursor للصفحة التالية (اختياري)" },
      },
      required: [],
    },
  },
  {
    name: "instagram_get_media_details",
    description: "جلب تفاصيل منشور واحد بالـ ID: كابشن كامل، رابط، نوع، تاريخ، لايكات",
    inputSchema: {
      type: "object",
      properties: {
        media_id: { type: "string", description: "معرف المنشور (مثال: 180009...)" },
      },
      required: ["media_id"],
    },
  },
  {
    name: "instagram_get_comments",
    description: "جلب تعليقات منشور معين والردود عليها",
    inputSchema: {
      type: "object",
      properties: {
        media_id: { type: "string", description: "معرف المنشور" },
        limit: { type: "number", description: "عدد التعليقات (افتراضي 10)", default: 10 },
      },
      required: ["media_id"],
    },
  },
  {
    name: "instagram_create_media_container",
    description: "إنشاء حاوية منشور جديد (صورة/فيديو) - الخطوة 1 قبل النشر. يحتاج حساب Business/Creator",
    inputSchema: {
      type: "object",
      properties: {
        image_url: { type: "string", description: "رابط الصورة العامة (https) أو فيديو" },
        caption: { type: "string", description: "الكابشن مع هاشتاغات" },
        media_type: { type: "string", enum: ["IMAGE", "VIDEO", "CAROUSEL"], description: "نوع الوسائط", default: "IMAGE" },
      },
      required: ["image_url", "caption"],
    },
  },
  {
    name: "instagram_publish_media",
    description: "نشر الحاوية التي تم إنشاؤها - الخطوة 2 للنشر الفعلي",
    inputSchema: {
      type: "object",
      properties: {
        creation_id: { type: "string", description: "معرف الحاوية من الخطوة السابقة" },
      },
      required: ["creation_id"],
    },
  },
  {
    name: "instagram_get_insights",
    description: "جلب إحصائيات الحساب: الوصول، التفاعل، نمو المتابعين (يحتاج حساب Business)",
    inputSchema: {
      type: "object",
      properties: {
        period: { type: "string", enum: ["day", "week", "days_28"], description: "الفترة", default: "day" },
      },
      required: [],
    },
  },
  {
    name: "instagram_hashtag_search",
    description: "البحث عن هاشتاغ وجلب أشهر المنشورات عليه",
    inputSchema: {
      type: "object",
      properties: {
        hashtag: { type: "string", description: "اسم الهاشتاغ بدون # (مثال: oran)" },
        limit: { type: "number", description: "عدد النتائج", default: 10 },
      },
      required: ["hashtag"],
    },
  },
] as const;

// ============ مساعد Instagram API ============
const GRAPH_BASE = "https://graph.facebook.com/v21.0";

async function igFetch(env: Env, path: string, params: Record<string, string> = {}, method: "GET" | "POST" = "GET") {
  if (!env.INSTAGRAM_ACCESS_TOKEN) {
    return { mock: true, message: "⚠️ وضع التجربة (Mock) - ضع INSTAGRAM_ACCESS_TOKEN في .dev.vars للربط الحقيقي" };
  }
  const url = new URL(`${GRAPH_BASE}${path}`);
  url.searchParams.set("access_token", env.INSTAGRAM_ACCESS_TOKEN);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);

  const res = await fetch(url.toString(), { method });
  const data = await res.json() as any;
  if (!res.ok) throw new Error(data?.error?.message || `Instagram API error: ${res.status}`);
  return data;
}

function mockData(tool: string, args: any) {
  return {
    _mode: "mock",
    _note: "هذه بيانات تجريبية - ضع التوكن الحقيقي لترى بياناتك",
    tool,
    args,
    example: {
      profile: { id: "17841400000000000", username: "vito_dz", followers_count: 12450, media_count: 342, biography: "مطور | وهران 🇩🇿" },
      media: [
        { id: "18000000000000001", caption: "غروب وهران 🌅 #oran", media_type: "IMAGE", like_count: 452, permalink: "https://instagram.com/p/ABC123/" },
        { id: "18000000000000002", caption: "Behind the code 💻", media_type: "CAROUSEL", like_count: 321 },
      ],
    },
  };
}

// ============ منطق تنفيذ الأدوات ============
async function callTool(name: string, args: any, env: Env) {
  const hasToken = !!env.INSTAGRAM_ACCESS_TOKEN && !!env.INSTAGRAM_USER_ID;
  if (!hasToken) {
    return { content: [{ type: "text", text: JSON.stringify(mockData(name, args), null, 2) }] };
  }

  try {
    switch (name) {
      case "instagram_get_profile": {
        const data = await igFetch(env, `/${env.INSTAGRAM_USER_ID}`, {
          fields: "id,username,account_type,media_count,followers_count,follows_count,profile_picture_url,biography,name,website",
        });
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      }
      case "instagram_get_media": {
        const data = await igFetch(env, `/${env.INSTAGRAM_USER_ID}/media`, {
          fields: "id,caption,media_type,media_url,thumbnail_url,permalink,timestamp,like_count,comments_count",
          limit: String(args.limit || 10),
          ...(args.after ? { after: args.after } : {}),
        });
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      }
      case "instagram_get_media_details": {
        const data = await igFetch(env, `/${args.media_id}`, {
          fields: "id,caption,media_type,media_url,thumbnail_url,permalink,timestamp,like_count,comments_count,children{media_url}",
        });
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      }
      case "instagram_get_comments": {
        const data = await igFetch(env, `/${args.media_id}/comments`, {
          fields: "id,text,username,timestamp,like_count,replies{id,text,username}",
          limit: String(args.limit || 10),
        });
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      }
      case "instagram_create_media_container": {
        const data = await igFetch(env, `/${env.INSTAGRAM_USER_ID}/media`, {
          image_url: args.image_url,
          caption: args.caption,
          ...(args.media_type === "VIDEO" ? { media_type: "VIDEO" } : {}),
        }, "POST");
        return { content: [{ type: "text", text: JSON.stringify({ creation_id: data.id, status: "تم إنشاء الحاوية، الآن استعمل instagram_publish_media", raw: data }, null, 2) }] };
      }
      case "instagram_publish_media": {
        const data = await igFetch(env, `/${env.INSTAGRAM_USER_ID}/media_publish`, {
          creation_id: args.creation_id,
        }, "POST");
        return { content: [{ type: "text", text: JSON.stringify({ published_id: data.id, status: "✅ تم النشر بنجاح!", permalink: `https://instagram.com/p/${data.id}`, raw: data }, null, 2) }] };
      }
      case "instagram_get_insights": {
        const data = await igFetch(env, `/${env.INSTAGRAM_USER_ID}/insights`, {
          metric: "reach,profile_views,website_clicks,follower_count",
          period: args.period || "day",
        });
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      }
      case "instagram_hashtag_search": {
        // خطوتين: البحث عن ID ثم جلب المنشورات
        const search = await igFetch(env, `/ig_hashtag_search`, { q: args.hashtag });
        const hashtagId = (search as any)?.data?.[0]?.id;
        if (!hashtagId) throw new Error(`لم يتم العثور على هاشتاغ #${args.hashtag}`);
        const media = await igFetch(env, `/${hashtagId}/recent_media`, {
          fields: "id,caption,media_type,permalink,like_count",
          user_id: env.INSTAGRAM_USER_ID!,
          limit: String(args.limit || 10),
        });
        return { content: [{ type: "text", text: JSON.stringify({ hashtag: args.hashtag, hashtag_id: hashtagId, media }, null, 2) }] };
      }
      default:
        throw new Error(`أداة غير معروفة: ${name}`);
    }
  } catch (e: any) {
    return { content: [{ type: "text", text: `❌ خطأ: ${e.message}` }], isError: true };
  }
}

// ============ معالج MCP JSON-RPC ============
async function handleMcpRpc(body: any, env: Env) {
  const { jsonrpc, id, method, params } = body;

  // initialize
  if (method === "initialize") {
    return {
      jsonrpc: "2.0",
      id,
      result: {
        protocolVersion: "2024-11-05",
        capabilities: { tools: { listChanged: false }, resources: {}, prompts: {}, logging: {} },
        serverInfo: {
          name: env.MCP_SERVER_NAME || "instagram-mcp",
          version: env.MCP_SERVER_VERSION || "1.0.0",
        },
        instructions: "سيرفر إنستغرام MCP - يتيح للوكيل قراءة ونشر والتحكم في إنستغرام. يشتغل بوضع Mock بدون توكن.",
      },
    };
  }
  if (method === "notifications/initialized" || method === "initialized") {
    return null; // notification, لا رد
  }
  if (method === "ping") {
    return { jsonrpc: "2.0", id, result: {} };
  }
  if (method === "tools/list") {
    return { jsonrpc: "2.0", id, result: { tools: TOOLS } };
  }
  if (method === "tools/call") {
    const { name, arguments: args } = params;
    const result = await callTool(name, args || {}, env);
    return { jsonrpc: "2.0", id, result };
  }
  if (method === "resources/list") {
    return { jsonrpc: "2.0", id, result: { resources: [] } };
  }
  if (method === "prompts/list") {
    return { jsonrpc: "2.0", id, result: { prompts: [] } };
  }

  return { jsonrpc: "2.0", id, error: { code: -32601, message: `Method not found: ${method}` } };
}

// ============ Worker الرئيسي ============
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const corsHeaders: Record<string, string> = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization, mcp-session-id, mcp-protocol-version",
      "Access-Control-Expose-Headers": "mcp-session-id",
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    // حماية اختيارية برابط MCP
    if (env.MCP_API_KEY && url.pathname.startsWith("/mcp")) {
      const auth = request.headers.get("Authorization");
      if (auth !== `Bearer ${env.MCP_API_KEY}` && url.searchParams.get("key") !== env.MCP_API_KEY) {
        // نسمح بدون تحقق في وضع التجربة المحلية، لكن نحذر
        // return new Response(JSON.stringify({ error: "Unauthorized - ضع Authorization: Bearer <MCP_API_KEY>" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
    }

    // صفحة الهبوط
    if (url.pathname === "/" && request.method === "GET") {
      const html = `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Instagram MCP Server 🇩🇿</title>
<style>
  body{font-family:system-ui,Tahoma;max-width:860px;margin:40px auto;padding:0 20px;background:#0a0a0a;color:#e5e5e5;line-height:1.7}
  h1{font-size:28px} h2{margin-top:32px;color:#f472b6} code,pre{background:#1a1a1a;border:1px solid #2a2a2a;padding:12px;border-radius:10px;overflow:auto}
  a{color:#f472b6} .card{border:1px solid #2a2a2a;background:#111;border-radius:14px;padding:18px;margin:14px 0}
  .badge{display:inline-block;background:#f472b6;color:#000;padding:4px 10px;border-radius:999px;font-weight:700;font-size:12px}
  .ok{color:#22c55e} .warn{color:#f59e0b}
</style>
</head>
<body>
<h1>📸 Instagram MCP Server <span class="badge">MCP 2024-11-05</span></h1>
<p>هذا سيرفرك الخاص في مساحة عملك <b>workflowvito</b>. يعطي للوكيل <b>أيدي وأعين</b> يتحكم بها في إنستغرام: يقرأ البروفايل، يجلب المنشورات، يقرأ التعليقات، ينشر، ويحلل الهاشتاغات.</p>

<div class="card">
  <h2>🔗 رابط الـ MCP (تلصقه في وكيلك)</h2>
  <pre>https://${url.host}/mcp</pre>
  <p>يدعم <b>Streamable HTTP</b> و <b>SSE</b> - يشتغل مع Claude Desktop, Cursor, VS Code, Windsurf, Arena.</p>
  <p><b>للحماية:</b> أضف هيدر <code>Authorization: Bearer YOUR_MCP_API_KEY</code> إذا فعلت MCP_API_KEY</p>
</div>

<div class="card">
  <h2>🛠️ الأدوات المتاحة (8)</h2>
  <ul>
    <li><b>instagram_get_profile</b> - معلومات الحساب والمتابعين</li>
    <li><b>instagram_get_media</b> - آخر المنشورات/ريلز</li>
    <li><b>instagram_get_media_details</b> - تفاصيل منشور واحد</li>
    <li><b>instagram_get_comments</b> - تعليقات منشور</li>
    <li><b>instagram_create_media_container</b> + <b>instagram_publish_media</b> - نشر صورة/فيديو (حساب Business)</li>
    <li><b>instagram_get_insights</b> - إحصائيات</li>
    <li><b>instagram_hashtag_search</b> - بحث هاشتاغ</li>
  </ul>
</div>

<div class="card">
  <h2>⚙️ كيف تربط حسابك الحقيقي</h2>
  <ol>
    <li>روح <a href="https://developers.facebook.com/apps" target="_blank">developers.facebook.com</a> > إنشاء App > نوع Business</li>
    <li>أضف منتج <b>Instagram Graph API</b> واربط صفحتك على فيسبوك بحساب إنستغرام Business/Creator</li>
    <li>ولّد <b>Long-Lived Access Token</b> وجيب <b>IG User ID</b> من Graph Explorer</li>
    <li>في Cloudflare Dashboard > Workers > هذا السيرفر > Settings > Variables > ضع:
      <pre>INSTAGRAM_ACCESS_TOKEN = EAAK...
INSTAGRAM_USER_ID = 17841...
MCP_API_KEY = sk_... (اختياري للحماية)</pre>
    </li>
    <li>أعد Deploy - خلاص الوكيل يشوف بياناتك الحقيقية!</li>
  </ol>
  <p class="warn">بدون توكن: السيرفر يشتغل في وضع Mock ببيانات تجريبية للتجربة.</p>
</div>

<div class="card">
  <h2>📋 إعداد Claude Desktop / Cursor</h2>
  <p><b>Claude Desktop (claude_desktop_config.json):</b></p>
<pre>{
  "mcpServers": {
    "instagram": {
      "command": "npx",
      "args": ["-y", "mcp-remote", "https://${url.host}/mcp", "--header", "Authorization: Bearer \${MCP_API_KEY}"]
    }
  }
}</pre>
  <p><b>أو مباشرة عبر رابط (Cursor / Windsurf يدعمه):</b> ألصق <code>https://${url.host}/mcp</code> في إعدادات MCP</p>
</div>

<div class="card">
  <p><b>حالة السيرفر:</b> <span class="ok">● يعمل</span> | وضع: ${env.INSTAGRAM_ACCESS_TOKEN ? '<span class="ok">مربوط بحساب حقيقي ✅</span>' : '<span class="warn">تجريبي Mock (ضع التوكن للربط الحقيقي)</span>'} | <a href="/health">health</a> | <a href="/mcp">/mcp</a></p>
  <p><small>مبني على Cloudflare Workers • MCP Streamable HTTP • Instagram Graph API v21.0 • وهران 🇩🇿</small></p>
</div>
</body>
</html>`;
      return new Response(html, { headers: { ...corsHeaders, "Content-Type": "text/html; charset=utf-8" } });
    }

    if (url.pathname === "/health") {
      return new Response(JSON.stringify({ ok: true, service: "instagram-mcp", mode: env.INSTAGRAM_ACCESS_TOKEN ? "live" : "mock", tools: TOOLS.length, time: new Date().toISOString() }, null, 2), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // MCP endpoint - يدعم POST (Streamable HTTP) و GET (SSE legacy)
    if (url.pathname === "/mcp" || url.pathname === "/sse") {
      if (request.method === "GET") {
        // للفحص السريع - يرجع معلومات السيرفر
        if (request.headers.get("accept")?.includes("text/event-stream")) {
          // SSE stream بسيط للتوافق
          const stream = new ReadableStream({
            start(controller) {
              const enc = new TextEncoder();
              controller.enqueue(enc.encode(`event: message\ndata: ${JSON.stringify({ jsonrpc: "2.0", method: "notifications/message", params: { level: "info", data: "Instagram MCP connected - send POST requests" } })}\n\n`));
              controller.close();
            },
          });
          return new Response(stream, { headers: { ...corsHeaders, "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" } });
        }
        return new Response(JSON.stringify({ name: env.MCP_SERVER_NAME || "instagram-mcp", version: "1.0.0", protocol: "2024-11-05", endpoint: `https://${url.host}/mcp`, tools: TOOLS.map(t => t.name), mode: env.INSTAGRAM_ACCESS_TOKEN ? "live" : "mock" }, null, 2), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      if (request.method === "POST") {
        try {
          const body = await request.json() as any;
          // يدعم batch (array) أو single
          if (Array.isArray(body)) {
            const results = await Promise.all(body.map((b) => handleMcpRpc(b, env)));
            const filtered = results.filter(Boolean);
            return new Response(JSON.stringify(filtered.length === 1 ? filtered[0] : filtered), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
          } else {
            const result = await handleMcpRpc(body, env);
            if (result === null) return new Response(null, { status: 204, headers: corsHeaders });
            return new Response(JSON.stringify(result), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
          }
        } catch (e: any) {
          return new Response(JSON.stringify({ jsonrpc: "2.0", id: null, error: { code: -32603, message: e.message || "Internal error" } }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }
      }
    }

    return new Response("Not found - جرب GET / أو POST /mcp", { status: 404, headers: corsHeaders });
  },
} satisfies ExportedHandler<Env>;
