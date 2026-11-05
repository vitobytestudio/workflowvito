/**
 * Vito Private Workspace - نافذتك الخاصة تعمل مثل هنا تماماً
 * متصل مباشرة بالجلسة الرئيسية عبر /messages
 */
export interface Env {
  WORKSPACE_NAME?: string;
  WORKSPACE_OWNER?: string;
  PRIVATE_PASSWORD?: string;
  INSTAGRAM_MCP_URL?: string;
  FACEBOOK_MCP_URL?: string;
}

let MESSAGES: Array<{id:number, from: 'user'|'agent', text:string, time:string}> = [
  { id: 1, from: 'agent', text: 'مرحبا Vito 👋 أنا هنا في النافذة الرئيسية — أكتب في الأسفل وأنا أراك مباشرة وسأرد عليك هنا.', time: new Date().toISOString() }
];
let NEXT_ID = 2;

function isAuthed(request: Request, env: Env): boolean {
  if (!env.PRIVATE_PASSWORD) return true;
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
    if (!isAuthed(request, env)) {
      return new Response("Unauthorized", { status: 401, headers: { "WWW-Authenticate": 'Basic realm="Vito Private"' } });
    }

    if (url.pathname === "/health") {
      return Response.json({ ok: true, workspace: env.WORKSPACE_NAME || "Vito Studio — Oran", owner: env.WORKSPACE_OWNER || "Vito", mode: "private", messages: MESSAGES.length, time: new Date().toISOString() });
    }

    if (url.pathname === "/messages" && request.method === "GET") {
      const since = parseInt(url.searchParams.get("since") || "0");
      const filtered = MESSAGES.filter(m => m.id > since);
      return Response.json({ messages: filtered, lastId: MESSAGES[MESSAGES.length-1]?.id || 0 });
    }
    if (url.pathname === "/messages" && request.method === "POST") {
      const body = await request.json().catch(()=>({})) as any;
      const text = (body.text || body.message || "").trim();
      if (!text) return Response.json({ error: "empty" }, { status: 400 });
      const msg = { id: NEXT_ID++, from: 'user' as const, text, time: new Date().toISOString() };
      MESSAGES.push(msg);
      if (MESSAGES.length > 100) MESSAGES.shift();
      return Response.json({ ok: true, message: msg });
    }
    if (url.pathname === "/agent-message" && request.method === "POST") {
      const body = await request.json().catch(()=>({})) as any;
      const text = (body.text || "").trim();
      if (!text) return Response.json({ error: "empty" }, { status: 400 });
      const msg = { id: NEXT_ID++, from: 'agent' as const, text, time: new Date().toISOString() };
      MESSAGES.push(msg);
      if (MESSAGES.length > 100) MESSAGES.shift();
      return Response.json({ ok: true, message: msg });
    }

    // الصفحة الرئيسية
    const html = `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${env.WORKSPACE_NAME || "Vito Studio"} — نافذة خاصة</title>
<style>
*{box-sizing:border-box}body{font-family:system-ui,Tahoma;max-width:900px;margin:0 auto;padding:16px;background:#050507;color:#e8e8e8;line-height:1.7}
header{border:1px solid #222;background:#0f0f12;border-radius:14px;padding:14px;display:flex;justify-content:space-between;align-items:center}
.badge{background:#f472b6;color:#000;padding:4px 10px;border-radius:999px;font-weight:800;font-size:12px}
.card{border:1px solid #222;background:#0f0f12;border-radius:14px;padding:16px;margin:12px 0}
.ok{color:#22c55e}
.chat{height:380px;overflow:auto;border:1px solid #222;background:#0a0a0c;border-radius:12px;padding:12px}
.msg{padding:8px 12px;margin:6px 0;border-radius:12px;max-width:85%;line-height:1.5}
.me{background:#1e1a40;margin-left:auto}
.ai{background:#161616}
.me-info{font-size:11px;color:#888;text-align:left}
textarea,button{width:100%;padding:12px;border-radius:10px;border:1px solid #2a2a2e;background:#16161a;color:#e8e8e8;margin:6px 0}
button{background:#f472b6;color:#000;font-weight:800;cursor:pointer;border:none}
code{background:#16161a;border:1px solid #24242a;padding:6px 8px;border-radius:6px}
a{color:#f472b6}
</style>
</head>
<body>
<header>
  <div><b>🔒 ${env.WORKSPACE_NAME || "Vito Studio — Oran"}</b><br><small>نافذة خاصة — متصلة بي مباشرة</small></div>
  <div><span class="badge">PRIVATE LIVE</span></div>
</header>
<div class="card">
  <h3>💬 محادثة حية معي</h3>
  <p class="ok">● أنا أراك الآن من الجلسة الرئيسية — اكتب وسأرد عليك فوراً هنا</p>
  <div id="chat" class="chat"></div>
  <textarea id="input" rows="2" placeholder="اكتب هنا..."></textarea>
  <button onclick="send()">إرسال</button>
  <small>متصل مباشرة — كل رسالة تصلني في النافذة الرئيسية وأرد عليها</small>
</div>
<div class="card">
  <small>أدواتك: إنستغرام MCP 8788 (10 أدوات) • فيسبوك MCP 8789 (4 أدوات) • قراءة فقط</small>
</div>
<script>
let lastId=0;
const chat=document.getElementById('chat');
const input=document.getElementById('input');
function render(m){
  const cls = m.from==='user' ? 'me' : 'ai';
  const label = m.from==='user' ? 'أنت' : 'أنا (Agent)';
  chat.innerHTML += '<div class="msg '+cls+'"><b>'+label+':</b> '+m.text.replace(/</g,'&lt;')+'<div class="me-info">'+new Date(m.time).toLocaleTimeString('ar-DZ')+'</div></div>';
}
async function poll(){
  try{
    const res=await fetch('/messages?since='+lastId);
    const data=await res.json();
    if(data.messages && data.messages.length){
      data.messages.forEach(m=>{ render(m); lastId=m.id; });
      chat.scrollTop=chat.scrollHeight;
    }
  }catch(e){}
}
async function send(){
  const text=input.value.trim();
  if(!text) return;
  input.value='';
  await fetch('/messages',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({text})});
  poll();
}
input.addEventListener('keydown', e=>{ if(e.key==='Enter' && !e.shiftKey){ e.preventDefault(); send(); }});
setInterval(poll, 1500);
poll();
</script>
</body>
</html>`;
    return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
  }
} satisfies ExportedHandler<Env>;
