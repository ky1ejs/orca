import { verifyOAuthState } from '../auth/oauth-state.js';
import { renderPage, escapeHtml } from './render-page.js';

interface GitHubInstallation {
  id: number;
  account: {
    login: string;
    type: string;
  };
}

const PICKER_CSS = `
    .installations { margin-top: 1.5rem; text-align: left; }
    .installation { display: flex; align-items: center; justify-content: space-between; padding: 0.75rem 1rem; border: 1px solid #2a2928; border-radius: 8px; margin-bottom: 0.5rem; }
    .installation:hover { border-color: #3a3938; }
    .install-info { display: flex; flex-direction: column; }
    .install-name { color: #e5e3de; font-size: 0.875rem; font-weight: 500; }
    .install-type { color: #9b9a97; font-size: 0.75rem; }
    .select-btn { padding: 0.375rem 1rem; background: #e5e3de; color: #0e0d0c; border: none; border-radius: 6px; font-size: 0.8125rem; font-weight: 500; cursor: pointer; }
    .select-btn:hover { background: #cfcdc8; }`;

export async function handleGitHubOAuthCallback(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const error = url.searchParams.get('error');

  if (error) {
    return renderPage(
      'Authorization Denied',
      `<h1 class="error">Authorization denied</h1>
       <p>You denied the authorization request. Close this tab and try again from Orca if needed.</p>`,
    );
  }

  if (!code || !state) {
    return renderPage(
      'Error',
      `<h1 class="error">Missing parameters</h1>
       <p>The authorization request is missing required parameters. Please try again from Orca.</p>`,
    );
  }

  let workspaceId: string;
  try {
    const payload = await verifyOAuthState(state);
    workspaceId = payload.workspaceId;
  } catch {
    return renderPage(
      'Error',
      `<h1 class="error">Invalid or expired link</h1>
       <p>This authorization link has expired. Please go back to Orca and click "Use existing installation" again.</p>`,
    );
  }

  const clientId = process.env.GITHUB_APP_CLIENT_ID;
  const clientSecret = process.env.GITHUB_APP_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return renderPage(
      'Error',
      `<h1 class="error">Server configuration error</h1>
       <p>GitHub OAuth is not configured on the server.</p>`,
    );
  }

  // Exchange code for user access token
  const tokenResponse = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      code,
    }),
  });

  const tokenData = (await tokenResponse.json()) as {
    access_token?: string;
    error?: string;
    error_description?: string;
  };

  if (!tokenData.access_token) {
    return renderPage(
      'Error',
      `<h1 class="error">Authorization failed</h1>
       <p>${escapeHtml(tokenData.error_description ?? 'Could not complete authorization with GitHub.')} Please try again from Orca.</p>`,
    );
  }

  // Fetch user's accessible installations
  const installationsResponse = await fetch('https://api.github.com/user/installations', {
    headers: {
      Authorization: `Bearer ${tokenData.access_token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'Orca-App',
    },
  });

  if (!installationsResponse.ok) {
    return renderPage(
      'Error',
      `<h1 class="error">Failed to fetch installations</h1>
       <p>Could not retrieve your GitHub App installations. Please try again.</p>`,
    );
  }

  const installationsData = (await installationsResponse.json()) as {
    installations: GitHubInstallation[];
  };
  const installations = installationsData.installations;

  // Token used once — not stored

  if (installations.length === 0) {
    return renderPage(
      'No installations found',
      `<h1>No installations found</h1>
       <p>You don't have access to any installations of the Orca GitHub App. Install it first using "Connect GitHub" in Orca, then use "Use existing installation" to link it to another workspace.</p>`,
    );
  }

  const installationItems = installations
    .map(
      (inst) => `
      <div class="installation">
        <div class="install-info">
          <span class="install-name">${escapeHtml(inst.account.login)}</span>
          <span class="install-type">${inst.account.type === 'Organization' ? 'Organization' : 'User'}</span>
        </div>
        <button class="select-btn" onclick="selectInstallation(${inst.id})">Select</button>
      </div>`,
    )
    .join('');

  return renderPage(
    'Select Installation',
    `<h1>Select a GitHub installation</h1>
     <p>Choose which GitHub account to connect to your workspace.</p>
     <div class="installations">
       ${installationItems}
     </div>
     <script>
       function selectInstallation(installationId) {
         window.location.href = 'orca://github/callback?installation_id=' + installationId + '&workspaceId=' + ${JSON.stringify(workspaceId)};
       }
     </script>`,
    PICKER_CSS,
  );
}
