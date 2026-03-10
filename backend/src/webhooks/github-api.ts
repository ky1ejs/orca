import { SignJWT, importPKCS8 } from 'jose';

function getAppConfig() {
  const appId = process.env.GITHUB_APP_ID;
  const privateKey = process.env.GITHUB_APP_PRIVATE_KEY;
  if (!appId || !privateKey) return null;
  // Handle PEM newline encoding from env vars
  const pem = privateKey.replace(/\\n/g, '\n');
  return { appId, privateKey: pem };
}

async function createAppJwt(): Promise<string> {
  const config = getAppConfig();
  if (!config) throw new Error('GitHub App not configured');

  const key = await importPKCS8(config.privateKey, 'RS256');
  const now = Math.floor(Date.now() / 1000);

  return new SignJWT({})
    .setProtectedHeader({ alg: 'RS256' })
    .setIssuer(config.appId)
    .setIssuedAt(now - 60)
    .setExpirationTime(now + 10 * 60)
    .sign(key);
}

function githubHeaders(token?: string): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  return headers;
}

interface GitHubInstallationDetails {
  id: number;
  account: { login: string; type: string };
}

export async function getInstallationDetails(
  installationId: number,
): Promise<GitHubInstallationDetails> {
  const jwt = await createAppJwt();
  const response = await fetch(`https://api.github.com/app/installations/${installationId}`, {
    headers: githubHeaders(jwt),
  });

  if (!response.ok) {
    throw new Error(`GitHub API error: ${response.status} ${response.statusText}`);
  }

  return response.json();
}

export async function getInstallationAccessToken(installationId: number): Promise<string> {
  const jwt = await createAppJwt();
  const tokenResponse = await fetch(
    `https://api.github.com/app/installations/${installationId}/access_tokens`,
    {
      method: 'POST',
      headers: githubHeaders(jwt),
    },
  );

  if (!tokenResponse.ok) {
    throw new Error(`GitHub API error getting access token: ${tokenResponse.status}`);
  }

  const { token } = (await tokenResponse.json()) as { token: string };
  return token;
}

export async function getInstallationRepositories(installationId: number): Promise<string[]> {
  const token = await getInstallationAccessToken(installationId);

  const reposResponse = await fetch('https://api.github.com/installation/repositories', {
    headers: githubHeaders(token),
  });

  if (!reposResponse.ok) {
    throw new Error(`GitHub API error getting repos: ${reposResponse.status}`);
  }

  const data = (await reposResponse.json()) as {
    repositories: Array<{ full_name: string }>;
  };

  return data.repositories.map((r) => r.full_name);
}

interface GitHubPullRequest {
  id: number;
  number: number;
  title: string;
  html_url: string;
  state: 'open' | 'closed';
  draft: boolean;
  merged: boolean;
  head: { ref: string };
  user: { login: string };
}

export async function fetchPullRequest(
  owner: string,
  repo: string,
  number: number,
  token?: string,
): Promise<GitHubPullRequest> {
  const url = `https://api.github.com/repos/${owner}/${repo}/pulls/${number}`;
  const response = await fetch(url, { headers: githubHeaders(token) });

  if (!response.ok) {
    if (response.status === 404) {
      throw new Error('Pull request not found');
    }
    throw new Error(`GitHub API error: ${response.status} ${response.statusText}`);
  }

  return response.json();
}
