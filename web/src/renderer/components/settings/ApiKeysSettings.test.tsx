// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

const NEW_KEY = 'orca_abcdefghijklmnopqrstuvwxyz0123456789ABCDEFG';

const mockRefetch = vi.fn();
const mockCreateApiKey = vi.fn().mockResolvedValue({
  data: {
    createApiKey: {
      key: NEW_KEY,
      apiKey: { id: 'k3', name: 'cut-api', displayHint: 'DEFG', scopes: ['TASKS_CREATE'] },
    },
  },
});
const mockRevokeApiKey = vi.fn().mockResolvedValue({ data: { revokeApiKey: { id: 'k1' } } });

vi.mock('../../hooks/useGraphQL.js', () => ({
  useApiKeys: () => ({
    data: {
      apiKeys: [
        {
          id: 'k1',
          name: 'cut-api',
          displayHint: 'wxyz',
          scopes: ['TASKS_CREATE', 'TASKS_DELETE_EXTERNAL'],
          revokedAt: null,
          createdAt: '2026-11-20T10:00:00.000Z',
          createdBy: { id: 'u1', name: 'Kyle' },
        },
        {
          id: 'k2',
          name: 'old-key',
          displayHint: '1234',
          scopes: ['TASKS_CREATE'],
          revokedAt: '2026-11-21T10:00:00.000Z',
          createdAt: '2026-11-01T10:00:00.000Z',
          createdBy: null,
        },
      ],
    },
    fetching: false,
    refetch: mockRefetch,
  }),
  useCreateApiKey: () => ({ createApiKey: mockCreateApiKey, fetching: false }),
  useRevokeApiKey: () => ({ revokeApiKey: mockRevokeApiKey }),
}));

vi.mock('../../workspace/context.js', () => ({
  useWorkspace: () => ({ currentWorkspace: { id: 'ws1', slug: 'cut', role: 'OWNER' } }),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

async function importAndRender() {
  const { ApiKeysSettings } = await import('./ApiKeysSettings.js');
  return render(<ApiKeysSettings />);
}

describe('ApiKeysSettings', () => {
  it('lists keys with their hint, scopes and status, never a full key', async () => {
    await importAndRender();
    expect(screen.getByText('…wxyz')).toBeInTheDocument();
    expect(screen.getByText(/Create tasks · Delete tasks it created/)).toBeInTheDocument();
    expect(screen.getByText(/by Kyle/)).toBeInTheDocument();
    expect(screen.getByText('Revoked')).toBeInTheDocument();
    expect(screen.queryByTestId('api-key-revoke-k2')).not.toBeInTheDocument();
  });

  it('creates a key with the chosen scopes and shows it once', async () => {
    await importAndRender();
    fireEvent.change(screen.getByTestId('api-key-name-input'), {
      target: { value: ' cut-api ' },
    });
    fireEvent.click(screen.getByTestId('api-key-scope-TASKS_DELETE_EXTERNAL'));
    fireEvent.click(screen.getByTestId('api-key-create-button'));

    await waitFor(() => expect(screen.getByTestId('api-key-value')).toHaveValue(NEW_KEY));
    expect(mockCreateApiKey).toHaveBeenCalledWith({
      workspaceId: 'ws1',
      name: 'cut-api',
      scopes: ['TASKS_CREATE', 'TASKS_DELETE_EXTERNAL'],
    });
    expect(screen.getByText(/can't show it again/)).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('api-key-done'));
    expect(screen.queryByTestId('api-key-value')).not.toBeInTheDocument();
    expect(screen.queryByDisplayValue(NEW_KEY)).not.toBeInTheDocument();
  });

  it('copies the new key', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    await importAndRender();
    fireEvent.change(screen.getByTestId('api-key-name-input'), { target: { value: 'cut-api' } });
    fireEvent.click(screen.getByTestId('api-key-create-button'));
    await waitFor(() => screen.getByTestId('api-key-copy'));

    fireEvent.click(screen.getByTestId('api-key-copy'));

    expect(writeText).toHaveBeenCalledWith(NEW_KEY);
    await waitFor(() => expect(screen.getByTestId('api-key-copy')).toHaveTextContent('Copied'));
  });

  it('disables Create when no scope is chosen', async () => {
    await importAndRender();
    fireEvent.change(screen.getByTestId('api-key-name-input'), { target: { value: 'cut-api' } });
    fireEvent.click(screen.getByTestId('api-key-scope-TASKS_CREATE'));
    expect(screen.getByTestId('api-key-create-button')).toBeDisabled();
  });

  it('revokes only after confirmation', async () => {
    await importAndRender();
    fireEvent.click(screen.getByTestId('api-key-revoke-k1'));
    expect(mockRevokeApiKey).not.toHaveBeenCalled();
    expect(screen.getByText('Services using it stop working.')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('api-key-confirm-revoke-k1'));

    await waitFor(() => expect(mockRevokeApiKey).toHaveBeenCalledWith('k1'));
    expect(mockRefetch).toHaveBeenCalledWith({ requestPolicy: 'network-only' });
  });

  it('shows a server error', async () => {
    mockCreateApiKey.mockResolvedValueOnce({
      error: { graphQLErrors: [{ message: 'Workspace not found' }] },
    });
    await importAndRender();
    fireEvent.change(screen.getByTestId('api-key-name-input'), { target: { value: 'cut-api' } });
    fireEvent.click(screen.getByTestId('api-key-create-button'));
    await waitFor(() => expect(screen.getByText('Workspace not found')).toBeInTheDocument());
  });
});
