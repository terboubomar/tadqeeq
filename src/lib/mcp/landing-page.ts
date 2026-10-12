// Friendly HTML shown when a person opens /mcp in a browser.
// MCP clients (POST, bearer token, event-stream) never match isMcpBrowserVisit.

export function isMcpBrowserVisit(request: Request): boolean {
  if (new URL(request.url).pathname !== "/mcp") return false;
  if (request.method !== "GET") return false;
  if (request.headers.get("authorization")) return false;
  const accept = request.headers.get("accept") ?? "";
  return accept.includes("text/html") && !accept.includes("text/event-stream");
}

export function renderMcpLandingPage(origin: string): string {
  const url = `${origin}/mcp`;
  return `<!doctype html>
<html lang="ar" dir="rtl"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>ربط تدقيق مع Claude و ChatGPT</title>
<meta name="description" content="هذا الرابط مخصص لمساعدات الذكاء الاصطناعي مثل Claude و ChatGPT. اتبع الخطوات لربط حساب تدقيق بأمان.">
<meta name="robots" content="noindex">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@400;600&family=Noto+Kufi+Arabic:wght@700&family=IBM+Plex+Mono&display=swap">
<style>
*{box-sizing:border-box}body{margin:0;font-family:"IBM Plex Sans Arabic",sans-serif;background:#f4f6f3;color:#0f2a22;line-height:1.7}
header{background:#0f2a22;color:#f4f6f3;padding:48px 20px 40px;text-align:center}
h1{font-family:"Noto Kufi Arabic",sans-serif;font-size:28px;margin:12px 0 8px}
header p{margin:0 auto;max-width:560px;color:#c9d3d6}
.badge{display:inline-block;background:#22b573;color:#0f2a22;border-radius:999px;padding:4px 14px;font-size:13px;font-weight:600}
main{max-width:760px;margin:-24px auto 40px;padding:0 16px}
.card{background:#fff;border:1px solid #e5e1d6;border-radius:12px;padding:24px;margin-bottom:16px}
h2{font-family:"Noto Kufi Arabic",sans-serif;font-size:18px;margin:0 0 12px}
.url{display:flex;gap:8px;align-items:center;background:#f4f6f3;border-radius:9px;padding:10px 12px;direction:ltr}
.url code{flex:1;font-family:"IBM Plex Mono",monospace;font-size:14px;overflow-wrap:anywhere}
button{font:inherit;background:#0f2a22;color:#f4f6f3;border:0;border-radius:9px;padding:6px 14px;cursor:pointer}
ol{margin:0;padding-inline-start:20px}li{margin-bottom:6px}
.grid{display:grid;gap:16px;grid-template-columns:repeat(auto-fit,minmax(260px,1fr))}
.grid .card{margin:0}
.safe li::marker{color:#2f8a5b}
a{color:#8a5d14}footer{text-align:center;font-size:13px;color:#5b6a70;padding-bottom:32px}
</style></head><body>
<header>
<span class="badge">للمساعدات الذكية فقط</span>
<h1>هذا الرابط لربط تدقيق مع Claude و ChatGPT</h1>
<p>لا يُفتح من المتصفح مباشرة. أضفه داخل مساعدك الذكي ليقرأ تدقيقاتك وفروعك بعد موافقتك.</p>
</header>
<main>
<div class="card">
<h2>رابط الربط</h2>
<div class="url"><code id="u">${url}</code><button onclick="navigator.clipboard.writeText(document.getElementById('u').textContent);this.textContent='تم النسخ'">نسخ</button></div>
</div>
<div class="grid">
<div class="card"><h2>Claude</h2><ol>
<li>افتح الإعدادات ← Connectors.</li>
<li>اضغط Add custom connector.</li>
<li>الاسم: <b>Tadqeeq</b>، والرابط أعلاه.</li>
<li>سجّل الدخول في صفحة تدقيق واضغط موافقة.</li>
</ol></div>
<div class="card"><h2>ChatGPT</h2><ol>
<li>افتح الإعدادات ← Connectors (وضع المطوّر).</li>
<li>اضغط Create.</li>
<li>الاسم: <b>Tadqeeq</b>، والرابط أعلاه.</li>
<li>سجّل الدخول في صفحة تدقيق واضغط موافقة.</li>
</ol></div>
</div>
<div class="card safe" style="margin-top:16px"><h2>بيانات منشأتك محمية</h2><ul>
<li>لا يصل أي مساعد إلى بياناتك إلا بعد تسجيل دخولك وموافقتك الصريحة.</li>
<li>يرى المساعد بيانات منشأتك فقط وبنفس صلاحياتك، لا أكثر.</li>
<li>الأرقام تأتي من محرك تدقيق كما هي، ولا يمكن للمساعد تعديلها.</li>
<li>يمكنك إلغاء الربط في أي وقت من إعدادات المساعد.</li>
</ul></div>
</main>
<footer><a href="/">العودة إلى تدقيق</a></footer>
</body></html>`;
}

