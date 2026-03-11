import { renderPage } from './render-page.js';

export function handleGitHubCallback(request: Request): Response {
  const url = new URL(request.url);
  const installationId = url.searchParams.get('installation_id');
  const workspaceId = url.searchParams.get('state');

  // When state (workspaceId) is missing but installation_id is present,
  // show the installation ID and guide the user to use "Use existing installation"
  if (installationId && !workspaceId) {
    return renderPage(
      'GitHub Setup',
      `<h1>GitHub App already installed</h1>
       <p>This GitHub App is already installed on your account. To connect it to a workspace, go to Orca and click <strong>"Use existing installation"</strong> in Integrations settings.</p>
       <p style="margin-top: 1rem; color: #6b6a67; font-size: 0.75rem;">Installation ID: <code>${installationId}</code></p>`,
    );
  }

  return renderPage(
    'GitHub Setup',
    `<div class="spinner" id="spinner"></div>
     <h1 id="title">Returning to Orca...</h1>
     <p id="message">If Orca doesn't open automatically, copy this installation ID and paste it in the Integrations settings:</p>
     <p><code id="installation-id">${installationId ?? 'unknown'}</code></p>
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
     </script>`,
  );
}
