/**
 * Facebook MCP Server - قراءة فقط بدون لمس
 * نفس طريقة إنستغرام: معلومات غير حساسة بدون توكن
 */

export interface Env {
  FACEBOOK_APP_ID?: string;
  FACEBOOK_APP_SECRET?: string;
  FACEBOOK_PAGE_TOKEN?: string; // اختياري للجلب الكامل قراءة فقط
  MCP_SERVER_NAME?: string;
  MCP_SERVER_VERSION?: string;
}

import { fetchPublicPage, fetchPublicPosts } from "./public-fetch";
import { fetchPublicGroup } from "./groups";

let CACHED_TOKEN: string | null = null;

function getEffectiveEnv(env: Env): Env {
  if (CACHED_TOKEN) return { ...env, FACEBOOK_PAGE_TOKEN: CACHED_TOKEN };
  return env;
}

const TOOLS = [
  { name: "facebook_get_public_page", description: "جلب معلومات صفحة فيسبوك عامة فقط (الاسم، الوصف) بدون تسجيل دخول - قراءة فقط", inputSchema: { type: "object", properties: { page: { type: "string", description: "اسم الصفحة (مثال: facebook أو zara)" } }, required: ["page"] } },
  { name: "facebook_get_public_posts", description: "جلب منشورات صفحة عامة (قراءة فقط) - بدون لمس، بدون نشر، بدون تعليق", inputSchema: { type: "object", properties: { page: { type: "string", description: "اسم الصفحة" }, limit: { type: "number", default: 5, description: "عدد المنشورات" } }, required: ["page"] } },
  { name: "facebook_get_public_group_posts", description: "جلب منشورات مجموعة فيسبوك عامة - الأكثر نشاطا (قراءة فقط بدون لمس)", inputSchema: { type: "object", properties: { group: { type: "string", description: "معرف المجموعة أو slug (مثال: 123456789 أو freelance.algeria)" }, limit: { type: "number", default: 5 } }, required: ["group"] } },
  { name: "facebook_get_page_insights_readonly", description: "إحصائيات صفحة (تحتاج Page Token قراءة فقط) - لا نشر ولا تحكم", inputSchema: { type: "object", properties: { page_id: { type: "string", description: "معرف الصفحة" } }, required: ["page_id"] } },
] as const;

async function callTool(name: string, args: any, env: Env) {
  try {
    switch (name) {
      case "facebook_get_public_page": {
        const data = await fetchPublicPage(args.page);
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      }
      case "facebook_get_public_posts": {
        const data = await fetchPublicPosts(args.page, args.limit || 5);
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      }
      case "facebook_get_public_group_posts": {
        const data = await fetchPublicGroup(args.group);
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      }
      case "facebook_get_page_insights_readonly": {
        const eff = getEffectiveEnv(env);
        if (!eff.FACEBOOK_PAGE_TOKEN) return { content: [{ type: "text", text: "⚠️ هذا يحتاج Page Token قراءة فقط - للمعلومات العامة استعمل facebook_get_public_page بدون توكن" }] };
        // لو عندك توكن قراءة فقط
        const url = `https://graph.facebook.com/v21.0/${args.page_id}?fields=name,fan_count,followers_count,posts.limit(3){message,created_time}&access_token=${eff.FACEBOOK_PAGE_TOKEN}`;
        const res = await fetch(url);
        const data = await res.json() as any;
        if (!res.ok) throw new Error(data.error?.message || "فشل");
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      }
      default: throw new Error(`أداة غير معروفة: ${name}`);
    }
  } catch (e: any) { return { content: [{ type: "text", text: `❌ ${e.message}` }], isError: true }; }
}

async function handleMcpRpc(body: any, env: Env) {
  const { id, method, params } = body;
  if (method === "initialize") return { jsonrpc: "2.0", id, result: { protocolVersion: "2024-11-05", capabilities: { tools: { listChanged: false } }, serverInfo: { name: env.MCP_SERVER_NAME || "facebook-mcp", version: "1.0.0" }, instructions: "فيسبوك MCP - قراءة فقط بدون لمس" } };
  if (method === "notifications/initialized") return null;
  if (method === "ping") return { jsonrpc: "2.0", id, result: {} };
  if (method === "tools/list") return { jsonrpc: "2.0", id, result: { tools: TOOLS } };
  if (method === "tools/call") { const r = await callTool(params.name, params.arguments || {}, env); return { jsonrpc: "2.0", id, result: r }; }
  return { jsonrpc: "2.0", id, error: { code: -32601, message: `Method not found: ${method}` } };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET, POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type, Authorization" };
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    
    const isLive = !!getEffectiveEnv(env).FACEBOOK_PAGE_TOKEN;
    
    if (url.pathname === "/" && request.method === "GET") {
      const html = `<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Facebook MCP - قراءة فقط</title><style>body{font-family:system-ui;max-width:860px;margin:40px auto;padding:20px;background:#0a0a0a;color:#e5e5e5} .card{border:1px solid #2a2a2a;background:#111;border-radius:14px;padding:18px;margin:14px 0} .ok{color:#22c55e} .warn{color:#f59e0b} code{background:#1a1a1a;padding:10px;display:block;border-radius:8px;overflow:auto}</style></head><body>
<h1>📘 Facebook MCP Server <span style="background:#1877F2;color:#fff;padding:4px 10px;border-radius:999px;font-size:12px">قراءة فقط</span></h1>
<p>نفس طريقة إنستغرام - <b>نجلب المنشورات بدون لمس، بدون نشر، بدون تعليق</b>. للصفحات العامة فقط.</p>
<div class="card" style="border-color:${isLive ? "#22c55e" : "#1877F2"}"><h2>${isLive ? "✅ مربوط قراءة فقط" : "🟢 جاهز - بدون توكن للصفحات العامة"}</h2><p>${isLive ? "التوكن قراءة فقط مفعل" : "تجلب الصفحات العامة مباشرة - للمنشورات الكاملة نحتاج App Token قراءة فقط (اختياري)"}</p></div>
<div class="card"><h2>🔗 رابط MCP</h2><code>https://${url.host}/mcp</code><p>الصقه في وكيلك. قل: "جيب منشورات صفحة facebook"</p></div>
<div class="card"><h2>🛠️ الأدوات (3)</h2><ul><li><b>facebook_get_public_page</b> - معلومات صفحة عامة</li><li><b>facebook_get_public_posts</b> - منشورات صفحة عامة (قراءة فقط)</li><li><b>facebook_get_page_insights_readonly</b> - إحصائيات (تحتاج توكن قراءة فقط - اختياري)</li></ul></div>
<div class="card"><p><b>الحالة:</b> ${isLive ? '<span class="ok">● Live قراءة فقط</span>' : '<span class="ok">● Public جاهز</span>'} | <a href="/health" style="color:#1877F2">health</a> | <a href="/mcp" style="color:#1877F2">/mcp</a></p><small>قراءة فقط - لا نشر ولا تحكم • وهران 🇩🇿</small></div>
</body></html>`;
      return new Response(html, { headers: { ...cors, "Content-Type": "text/html; charset=utf-8" } });
    }
    if (url.pathname === "/health") return new Response(JSON.stringify({ ok: true, service: "facebook-mcp", mode: isLive ? "live_readonly" : "public", tools: TOOLS.length, time: new Date().toISOString() }, null, 2), { headers: { ...cors, "Content-Type": "application/json" } });
    if (url.pathname === "/mcp") {
      if (request.method === "GET") return new Response(JSON.stringify({ name: env.MCP_SERVER_NAME || "facebook-mcp", version: "1.0.0", protocol: "2024-11-05", endpoint: `https://${url.host}/mcp`, tools: TOOLS.map(t => t.name), mode: isLive ? "live_readonly" : "public" }, null, 2), { headers: { ...cors, "Content-Type": "application/json" } });
      if (request.method === "POST") {
        try {
          const body = await request.json() as any;
          const result = await handleMcpRpc(body, env);
          if (!result) return new Response(null, { status: 204, headers: cors });
          return new Response(JSON.stringify(result), { headers: { ...cors, "Content-Type": "application/json" } });
        } catch (e: any) { return new Response(JSON.stringify({ jsonrpc: "2.0", id: null, error: { code: -32603, message: e.message } }), { status: 500, headers: { ...cors, "Content-Type": "application/json" } }); }
      }
    }
    return new Response("Not found - جرب / أو /mcp", { status: 404, headers: cors });
  },
} satisfies ExportedHandler<Env>;
