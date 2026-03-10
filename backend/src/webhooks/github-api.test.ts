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
});
