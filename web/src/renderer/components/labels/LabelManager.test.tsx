// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

const mockCreateLabel = vi.fn().mockResolvedValue({ data: { createLabel: {} } });
const mockUpdateLabel = vi.fn().mockResolvedValue({ data: { updateLabel: {} } });
const mockDeleteLabel = vi.fn().mockResolvedValue({ data: { deleteLabel: true } });

vi.mock('../../hooks/useGraphQL.js', () => ({
  useLabels: () => ({
    data: {
      labels: [
        { id: 'l1', name: 'Bug', color: '#FF0000', workspaceId: 'ws1' },
        { id: 'l2', name: 'Feature', color: '#00FF00', workspaceId: 'ws1' },
      ],
    },
    fetching: false,
  }),
  useCreateLabel: () => ({ createLabel: mockCreateLabel }),
  useUpdateLabel: () => ({ updateLabel: mockUpdateLabel }),
  useDeleteLabel: () => ({ deleteLabel: mockDeleteLabel }),
}));

vi.mock('../../workspace/context.js', () => ({
  useWorkspace: () => ({ currentWorkspace: { id: 'ws1', slug: 'test-ws' } }),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

async function importAndRender() {
  const { LabelManager } = await import('./LabelManager.js');
  return render(<LabelManager />);
}

describe('LabelManager', () => {
  it('renders label list', async () => {
    await importAndRender();
    expect(screen.getByText('Bug')).toBeInTheDocument();
    expect(screen.getByText('Feature')).toBeInTheDocument();
    expect(screen.getByText('2 labels')).toBeInTheDocument();
  });

  it('submits create form', async () => {
    await importAndRender();
    const nameInput = screen.getByTestId('label-name-input');
    fireEvent.change(nameInput, { target: { value: 'Enhancement' } });
    fireEvent.click(screen.getByTestId('label-create-button'));
    expect(mockCreateLabel).toHaveBeenCalledWith({
      name: 'Enhancement',
      color: '#6366F1',
      workspaceId: 'ws1',
    });
  });

  it('shows delete confirmation', async () => {
    await importAndRender();
    fireEvent.click(screen.getByTestId('label-delete-l1'));
    expect(screen.getByTestId('label-confirm-delete-l1')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('label-confirm-delete-l1'));
    expect(mockDeleteLabel).toHaveBeenCalledWith('l1');
  });
});
