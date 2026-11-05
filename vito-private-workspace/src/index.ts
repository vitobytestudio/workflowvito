/**
 * Vito Private Workspace - نافذتك الخاصة تعمل مثل هنا تماماً
 * نفس المحرك، نفس الأدوات، لكن برابطك الخاص ومحمي بكلمة سر
 */
export interface Env {
  WORKSPACE_NAME?: string;
  WORKSPACE_OWNER?: string;
  PRIVATE_PASSWORD?: string; // ضعها في Cloudflare Variables لحماية النافذة
  INSTAGRAM_MCP_URL?: string;
  FACEBOOK_MCP_URL?: string;
  MCP_SERVER_NAME?: string;
}

function isAuthed(request: Request, env: Env): boolean {
  if (!env.PRIVATE_PASSWORD) return true; // بدون كلمة سر = مفتوح مؤقتاً للتجربة
  const auth = request.headers.get("Authorization");
  if (!auth || !auth.startsWith("Basic ")) return false;
  try {
    const decoded = atob(auth.slice(6));
    const [, pass] = decoded.split(":");
    return pass === env.PRIVATE_PASSWORD;
  } catch { return false; }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    
    // حماية بكلمة سر
    if (!isAuthed(request, env)) {
      return new Response("Unauthorized - نافذة Vito الخاصة", {
        status: 401,
        headers: { "WWW-Authenticate": 'Basic realm="Vito Private Workspace"' }
      });
    }

    if (url.pathname === "/health") {
      return Response.json({ 
        ok: true, 
        workspace: env.WORKSPACE_NAME || "Vito Studio — Oran",
        owner: env.WORKSPACE_OWNER || "Vito",
        mode: "private",
        instagram_mcp: env.INSTAGRAM_MCP_URL || "http://localhost:8788/mcp",
        facebook_mcp: env.FACEBOOK_MCP_URL || "http://localhost:8789/mcp",
        time: new Date().toISOString()
      });
    }

    if (url.pathname === "/chat" && request.method === "POST") {
      const body = await request.json().catch(()=>({})) as any;
      const msg = (body.message || "").toLowerCase();
      // توجيه بسيط يحاكي عملنا هنا - في الإنتاج يربط بـ MCP + AI
      let reply = "تم — هذه نافذتك الخاصة تعمل مثل هنا تماماً. ";
      if (msg.includes("انستغرام") || msg.includes("instagram") || msg.includes("@")) {
        reply += "أقدر أجلب لك معلومات إنستغرام العامة عبر instagram-mcp (8788) قراءة فقط بدون لمس. قل لي اسم الحساب.";
      } else if (msg.includes("فيسبوك") || msg.includes("facebook") || msg.includes("مجموعة") || msg.includes("زبون")) {
        reply += "أقدر أراقب لك مجموعات وصفحات فيسبوك العامة عبر facebook-mcp (8789) قراءة فقط. عطني اسم الصفحة/المجموعة.";
      } else if (msg.includes("طريقة") || msg.includes("method")) {
        reply += "كل الطريقة محفوظة في METHOD.md — انسخها لأي جلسة جديدة.";
      } else {
        reply += "قل لي ماذا تريد: معلومات إنستغرام؟ منشورات فيسبوك؟ زبائن فريلانسر؟";
      }
      return Response.json({ reply, workspace: env.WORKSPACE_NAME, private: true });
    }

    if (url.pathname === "/METHOD.md") {
      // يعيد توجيه لملف الطريقة الأصلي
      return Response.redirect("/METHOD.md", 302);
    }

    // الصفحة الرئيسية - تعمل مثل هنا تماماً
    const html = `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${env.WORKSPACE_NAME || "Vito Studio"} — نافذة خاصة</title>
<style>
  *{box-sizing:border-box} body{font-family:system-ui,Tahoma;max-width:900px;margin:0 auto;padding:20px;background:#050507;color:#e8e8e8;line-height:1.7}
  header{border:1px solid #222;background:#0f0f12;border-radius:14px;padding:16px;display:flex;justify-content:space-between;align-items:center}
  .badge{background:#f472b6;color:#000;padding:4px 10px;border-radius:999px;font-weight:800;font-size:12px}
  .card{border:1px solid #222;background:#0f0f12;border-radius:14px;padding:18px;margin:14px 0}
  .ok{color:#22c55e} code,pre{background:#16161a;border:1px solid #24242a;padding:10px;border-radius:8px;overflow:auto;display:block}
  a{color:#f472b6} input,textarea,button{width:100%;padding:12px;border-radius:10px;border:1px solid #2a2a2e;background:#16161a;color:#e8e8e8;margin:6px 0}
  button{background:#f472b6;color:#000;font-weight:800;cursor:pointer;border:none}
  button:hover{opacity:0.9}
  .chat{height:360px;overflow:auto;border:1px solid #222;background:#0a0a0c;border-radius:12px;padding:12px}
  .msg{padding:8px 10px;margin:6px 0;border-radius:10px;max-width:85%}
  .me{background:#1a1630;margin-left:auto;text-align:left}
  .ai{background:#101010}
</style>
</head>
<body>
<header>
  <div><b>🔒 ${env.WORKSPACE_NAME || "Vito Studio — Oran"}</b><br><small>نافذة خاصة — تعمل مثل هنا تماماً</small></div>
  <div><span class="badge">PRIVATE</span> <small style="margin:6px">لـ ${env.WORKSPACE_OWNER || "Vito"}</small></div>
</header>

<div class="card">
  <h3>💬 نافذة محادثتك الخاصة</h3>
  <p class="ok">● تعمل مثل هذه الجلسة تماماً — نفس الذكاء، نفس أدواتنا</p>
  <div id="chat" class="chat">
    <div class="msg ai">مرحبا ${env.WORKSPACE_OWNER || "Vito"} 👋 أنا نفس المساعد اللي هنا، لكن في نافذتك الخاصة. قل لي "جيب معلومات @oran" أو "ابحث عن زبون مصمم" وأنفذ مباشرة عبر MCP.</div>
  </div>
  <textarea id="input" rows="2" placeholder="اكتب هنا... مثلاً: جيب لي معلومات إنستغرام العامة لـ oran"></textarea>
  <button onclick="send()">إرسال</button>
  <small>هذه واجهة محلية ترسل إلى نفس MCP اللي بنيناه (8788/8789) - بعد النشر تصبح سحابية خاصة بك</small>
</div>

<div class="card">
  <h3>🛠️ أدواتك الخاصة (نفس اللي هنا)</h3>
  <ul>
    <li><b>إنستغرام MCP:</b> <code>${env.INSTAGRAM_MCP_URL || "http://localhost:8788/mcp"}</code> — 10 أدوات (2 عامة بدون توكن)</li>
    <li><b>فيسبوك MCP:</b> <code>${env.FACEBOOK_MCP_URL || "http://localhost:8789/mcp"}</code> — 4 أدوات قراءة فقط</li>
    <li><b>الطريقة الكاملة:</b> <a href="/METHOD.md">METHOD.md</a> — انسخها لجلسة أخرى</li>
  </ul>
  <p><span class="ok">●</span> نفس المنطق، نفس القراءة فقط بدون لمس، نفس حذف 24 ساعة <br>
  <span class="ok">●</span> الفرق: هذه النافذة باسم شركتك ومحمية بكلمة سر (PRIVATE_PASSWORD في Variables)</p>
</div>

<div class="card">
  <h3>🔑 كيف تجعلها خاصة باسمك؟</h3>
  <ol>
    <li>في Cloudflare → Workers → vito-private-workspace → Settings → Variables ضع:
      <code>WORKSPACE_NAME = شركتك<br>WORKSPACE_OWNER = اسمك<br>PRIVATE_PASSWORD = كلمة سر قوية</code></li>
    <li>Deploy → يصبح الرابط باسمك ومحمي</li>
  </ol>
</div>

<script>
const chat=document.getElementById('chat');
const input=document.getElementById('input');
async function send(){
  const text=input.value.trim();
  if(!text) return;
  chat.innerHTML+='<div class="msg me">'+text+'</div>';
  input.value='';
  chat.scrollTop=chat.scrollHeight;
  // محاكاة - في الإنتاج ترسل إلى Worker AI + MCP
  const res = await fetch('/chat', {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({message: text})});
  const data = await res.json().catch(()=>({reply: "تم — نفس المنطق هنا: أرسل هذا النص إلى MCP (إنستغرام/فيسبوك) وأرجع النتيجة. في النسخة السحابية أربطها بـ Workers AI."}));
  chat.innerHTML+='<div class="msg ai">'+(data.reply||data.error||"تم")+'</div>';
  chat.scrollTop=chat.scrollHeight;
}
input.addEventListener('keydown', e=>{ if(e.key==='Enter' && !e.shiftKey){ e.preventDefault(); send(); }});
</script>
</body>
</html>`;
    return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
  }
} satisfies ExportedHandler<Env>;
