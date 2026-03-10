import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

// Must mock before importing the module
const originalEnv = { ...process.env };

beforeEach(() => {
  process.env.GITHUB_APP_ID = '12345';
  process.env.GITHUB_APP_SLUG = 'orca-test';
  // A valid-looking PEM for testing (the actual signing will be tested via jose)
  process.env.GITHUB_APP_PRIVATE_KEY = 'test-key';
});

afterEach(() => {
  process.env = { ...originalEnv };
  vi.restoreAllMocks();
});

describe('github-api', () => {
  describe('getInstallationDetails', () => {
    it('throws when private key is missing', async () => {
      delete process.env.GITHUB_APP_PRIVATE_KEY;

      const { getInstallationDetails } = await import('./github-api.js');
      await expect(getInstallationDetails(42)).rejects.toThrow('GitHub App not configured');
    });

    it('throws when GitHub App env vars are missing', async () => {
      delete process.env.GITHUB_APP_ID;
      delete process.env.GITHUB_APP_PRIVATE_KEY;

      const { getInstallationDetails } = await import('./github-api.js');
      await expect(getInstallationDetails(42)).rejects.toThrow('GitHub App not configured');
    });
  });

  describe('getInstallationRepositories', () => {
    it('throws when GitHub App is not configured', async () => {
      delete process.env.GITHUB_APP_ID;

      const { getInstallationRepositories } = await import('./github-api.js');
      await expect(getInstallationRepositories(42)).rejects.toThrow('GitHub App not configured');
    });
  });

  describe('fetchPullRequest', () => {
    it('fetches a pull request from GitHub API', async () => {
      const prData = {
        id: 123,
        number: 1,
        title: 'Test PR',
        html_url: 'https://github.com/owner/repo/pull/1',
        state: 'open',
        draft: false,
        merged: false,
        head: { ref: 'feature-branch' },
        user: { login: 'testuser' },
      };

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(prData),
      });
      vi.stubGlobal('fetch', mockFetch);

      const { fetchPullRequest } = await import('./github-api.js');
      const result = await fetchPullRequest('owner', 'repo', 1);

      expect(result).toEqual(prData);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.github.com/repos/owner/repo/pulls/1',
        expect.objectContaining({
          headers: expect.not.objectContaining({ Authorization: expect.any(String) }),
        }),
      );
    });

    it('includes auth header when token is provided', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            id: 1,
            number: 1,
            title: 'PR',
            html_url: '',
            state: 'open',
            draft: false,
            merged: false,
            head: { ref: 'main' },
            user: { login: 'user' },
          }),
      });
      vi.stubGlobal('fetch', mockFetch);

      const { fetchPullRequest } = await import('./github-api.js');
      await fetchPullRequest('owner', 'repo', 1, 'ghs_token');

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.github.com/repos/owner/repo/pulls/1',
        expect.objectContaining({
          headers: expect.objectContaining({ Authorization: 'Bearer ghs_token' }),
        }),
      );
    });

    it('throws on 404', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({ ok: false, status: 404, statusText: 'Not Found' }),
      );

      const { fetchPullRequest } = await import('./github-api.js');
      await expect(fetchPullRequest('owner', 'repo', 999)).rejects.toThrow(
        'Pull request not found',
      );
    });
  });
});
