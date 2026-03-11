export function renderPage(title: string, body: string, extraCss = ''): Response {
  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Orca — ${title}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; display: flex; justify-content: center; align-items: center; min-height: 100vh; margin: 0; background: #0e0d0c; color: #e5e3de; }
    .card { text-align: center; max-width: 480px; padding: 2rem; }
    h1 { font-size: 1.25rem; margin-bottom: 0.5rem; }
    p { color: #9b9a97; font-size: 0.875rem; line-height: 1.5; }
    code { background: #1c1b1a; padding: 0.2rem 0.5rem; border-radius: 4px; font-size: 0.875rem; user-select: all; }
    .error { color: #e55; }
    .spinner { margin: 1rem auto; width: 24px; height: 24px; border: 2px solid #333; border-top-color: #e5e3de; border-radius: 50%; animation: spin 0.6s linear infinite; }
    @keyframes spin { to { transform: rotate(360deg); } }
    ${extraCss}
  </style>
</head>
<body>
  <div class="card">
    ${body}
  </div>
</body>
</html>`;
  return new Response(html, {
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
}

export function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
