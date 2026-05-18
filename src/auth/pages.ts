export function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

const STYLE = `*, *::before, *::after { box-sizing: border-box; }
body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, sans-serif; background: #0f0f0f; color: #e5e5e5; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; padding: 20px; }
.card { background: #1a1a1a; border: 1px solid #2a2a2a; border-radius: 14px; padding: 40px; width: 100%; max-width: 420px; }
.logo { font-size: 24px; margin-bottom: 4px; }
h1 { font-size: 20px; font-weight: 600; margin: 0 0 8px; color: #fff; }
.sub { color: #888; font-size: 14px; margin: 0 0 32px; line-height: 1.5; }
label { display: block; font-size: 13px; color: #aaa; margin-bottom: 8px; font-weight: 500; }
input[type="password"] { width: 100%; padding: 11px 14px; background: #111; border: 1px solid #333; border-radius: 8px; color: #fff; font-size: 14px; font-family: monospace; outline: none; transition: border-color 0.15s; }
input[type="password"]:focus { border-color: #4a4a4a; }
button { width: 100%; padding: 13px; background: #2563eb; border: none; border-radius: 8px; color: #fff; font-size: 15px; font-weight: 500; cursor: pointer; margin-top: 16px; transition: background 0.15s; }
button:hover { background: #1d4ed8; }
.hint { font-size: 12px; color: #555; margin-top: 24px; text-align: center; line-height: 1.5; }
code { background: #222; padding: 2px 5px; border-radius: 4px; font-size: 11px; }`;

export function approvePage(safeParams: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Authorise — GHL MCP Server</title>
  <style>${STYLE}</style>
</head>
<body>
  <div class="card">
    <div class="logo">🔐</div>
    <h1>Authorise GHL MCP Server</h1>
    <p class="sub">Claude is requesting access to your GoHighLevel account. Enter the one-time approval code to continue.</p>
    <form method="POST" action="/approve" autocomplete="off">
      <input type="hidden" name="params" value="${safeParams}">
      <label for="code">Approval code</label>
      <input type="password" id="code" name="code" autocomplete="one-time-code" autofocus required>
      <button type="submit">Approve access</button>
    </form>
    <p class="hint">This is the value of <code>MCP_APPROVAL_CODE</code> set via <code>wrangler secret put</code>. It is <strong>not</strong> a stored bearer token — it only gates this one approval.</p>
  </div>
</body>
</html>`;
}

export function deniedPage(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Access denied</title>
  <style>body{font-family:-apple-system,sans-serif;background:#0f0f0f;color:#e5e5e5;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0}div{text-align:center}h2{color:#ef4444}a{color:#2563eb}</style>
</head>
<body>
  <div>
    <h2>Incorrect approval code</h2>
    <p><a href="javascript:history.back()">← Try again</a></p>
  </div>
</body>
</html>`;
}
