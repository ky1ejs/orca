// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

let currentWorkspace = { id: 'ws1', name: 'Cut', slug: 'cut', role: 'OWNER' };

vi.mock('../../workspace/context.js', () => ({
  useWorkspace: () => ({ currentWorkspace, switchWorkspace: vi.fn() }),
}));
vi.mock('../../hooks/useGraphQL.js', () => ({
  useUpdateWorkspace: () => ({ updateWorkspace: vi.fn(), fetching: false }),
  useDeleteWorkspace: () => ({ deleteWorkspace: vi.fn(), fetching: false }),
}));
vi.mock('../../navigation/context.js', () => ({ useNavigation: () => ({ navigate: vi.fn() }) }));
vi.mock('../members/MemberList.js', () => ({ MemberList: () => null }));
vi.mock('../labels/LabelManager.js', () => ({ LabelManager: () => null }));
vi.mock('./TerminalSettings.js', () => ({ TerminalSettings: () => null }));
vi.mock('./AppearanceSettings.js', () => ({ AppearanceSettings: () => null }));
vi.mock('./IntegrationsSettings.js', () => ({ IntegrationsSettings: () => null }));
vi.mock('./DaemonSettings.js', () => ({ DaemonSettings: () => null }));
vi.mock('./ApiKeysSettings.js', () => ({
  ApiKeysSettings: () => <div data-testid="api-keys-panel" />,
}));

afterEach(() => {
  cleanup();
  currentWorkspace = { id: 'ws1', name: 'Cut', slug: 'cut', role: 'OWNER' };
});

async function importAndRender() {
  const { WorkspaceSettings } = await import('./WorkspaceSettings.js');
  return render(<WorkspaceSettings />);
}

describe('WorkspaceSettings API Keys tab', () => {
  it('is shown to owners', async () => {
    await importAndRender();
    fireEvent.click(screen.getByRole('button', { name: 'API Keys' }));
    expect(screen.getByTestId('api-keys-panel')).toBeInTheDocument();
  });

  it('is hidden from members who are not owners', async () => {
    currentWorkspace = { ...currentWorkspace, role: 'MEMBER' };
    await importAndRender();
    expect(screen.queryByRole('button', { name: 'API Keys' })).not.toBeInTheDocument();
    expect(screen.queryByTestId('api-keys-panel')).not.toBeInTheDocument();
  });

  it('falls back to General when the user stops being an owner', async () => {
    const { rerender } = await importAndRender();
    fireEvent.click(screen.getByRole('button', { name: 'API Keys' }));
    expect(screen.getByTestId('api-keys-panel')).toBeInTheDocument();

    currentWorkspace = { id: 'ws2', name: 'Other', slug: 'other', role: 'MEMBER' };
    const { WorkspaceSettings } = await import('./WorkspaceSettings.js');
    rerender(<WorkspaceSettings />);

    expect(screen.queryByTestId('api-keys-panel')).not.toBeInTheDocument();
    expect(screen.getByText('Workspace Name')).toBeInTheDocument();
  });
});
