export function handleGitHubCallback(request: Request): Response {
  const url = new URL(request.url);
  const installationId = url.searchParams.get('installation_id');
  const workspaceId = url.searchParams.get('state');

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Orca — GitHub Setup</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; display: flex; justify-content: center; align-items: center; min-height: 100vh; margin: 0; background: #0e0d0c; color: #e5e3de; }
    .card { text-align: center; max-width: 420px; padding: 2rem; }
    h1 { font-size: 1.25rem; margin-bottom: 0.5rem; }
    p { color: #9b9a97; font-size: 0.875rem; line-height: 1.5; }
    code { background: #1c1b1a; padding: 0.2rem 0.5rem; border-radius: 4px; font-size: 0.875rem; user-select: all; }
    .spinner { margin: 1rem auto; width: 24px; height: 24px; border: 2px solid #333; border-top-color: #e5e3de; border-radius: 50%; animation: spin 0.6s linear infinite; }
    @keyframes spin { to { transform: rotate(360deg); } }
  </style>
</head>
<body>
  <div class="card">
    <div class="spinner" id="spinner"></div>
    <h1 id="title">Returning to Orca...</h1>
    <p id="message">If Orca doesn't open automatically, copy this installation ID and paste it in the Integrations settings:</p>
    <p><code id="installation-id">${installationId ?? 'unknown'}</code></p>
  </div>
  <script>
    (function() {
      var installationId = ${JSON.stringify(installationId)};
      var workspaceId = ${JSON.stringify(workspaceId)};
      if (installationId && workspaceId) {
        var deepLink = 'orca://github/callback?installation_id=' + installationId + '&workspaceId=' + workspaceId;
        window.location.href = deepLink;
      } else {
        document.getElementById('spinner').style.display = 'none';
        document.getElementById('title').textContent = 'Setup incomplete';
        document.getElementById('message').textContent = 'Missing installation or workspace information. Please try again from Orca.';
      }
    })();
  </script>
</body>
</html>`;

  return new Response(html, {
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
}
