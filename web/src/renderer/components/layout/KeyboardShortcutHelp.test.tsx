// @vitest-environment jsdom
import { describe, expect, it, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { KeyboardShortcutHelp } from './KeyboardShortcutHelp.js';
import type { ShortcutDefinition } from '../../hooks/useKeyboardShortcuts.js';

afterEach(cleanup);

const sampleShortcuts: ShortcutDefinition[] = [
  { key: 'n', metaKey: true, label: 'New Task', description: 'New task', action: vi.fn() },
  {
    key: 'n',
    metaKey: true,
    shiftKey: true,
    label: 'New Project',
    description: 'New project',
    action: vi.fn(),
  },
  { key: '/', metaKey: true, label: 'Help', description: 'Show shortcuts', action: vi.fn() },
];

describe('KeyboardShortcutHelp', () => {
  it('does not render when closed', () => {
    render(<KeyboardShortcutHelp shortcuts={sampleShortcuts} isOpen={false} onClose={vi.fn()} />);

    expect(screen.queryByTestId('shortcut-help-modal')).not.toBeInTheDocument();
  });

  it('renders when open', () => {
    render(<KeyboardShortcutHelp shortcuts={sampleShortcuts} isOpen={true} onClose={vi.fn()} />);

    expect(screen.getByTestId('shortcut-help-modal')).toBeInTheDocument();
    expect(screen.getByText('Keyboard Shortcuts')).toBeInTheDocument();
  });

  it('displays all shortcut descriptions', () => {
    render(<KeyboardShortcutHelp shortcuts={sampleShortcuts} isOpen={true} onClose={vi.fn()} />);

    expect(screen.getByText('New task')).toBeInTheDocument();
    expect(screen.getByText('New project')).toBeInTheDocument();
    expect(screen.getByText('Show shortcuts')).toBeInTheDocument();
  });

  it('calls onClose when close button is clicked', () => {
    const onClose = vi.fn();
    render(<KeyboardShortcutHelp shortcuts={sampleShortcuts} isOpen={true} onClose={onClose} />);

    fireEvent.click(screen.getByTestId('close-shortcut-help'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('calls onClose when Escape is pressed', () => {
    const onClose = vi.fn();
    render(<KeyboardShortcutHelp shortcuts={sampleShortcuts} isOpen={true} onClose={onClose} />);

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('calls onClose when overlay is clicked', () => {
    const onClose = vi.fn();
    render(<KeyboardShortcutHelp shortcuts={sampleShortcuts} isOpen={true} onClose={onClose} />);

    fireEvent.click(screen.getByTestId('shortcut-help-modal'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('shows terminal hint', () => {
    render(<KeyboardShortcutHelp shortcuts={sampleShortcuts} isOpen={true} onClose={vi.fn()} />);

    expect(
      screen.getByText('Shortcuts are disabled when a terminal is focused.'),
    ).toBeInTheDocument();
  });
});
