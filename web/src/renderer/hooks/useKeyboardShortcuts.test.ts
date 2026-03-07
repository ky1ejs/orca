// @vitest-environment jsdom
import { describe, expect, it, vi, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useKeyboardShortcuts, formatShortcut } from './useKeyboardShortcuts.js';
import type { ShortcutDefinition } from './useKeyboardShortcuts.js';

afterEach(() => {
  vi.restoreAllMocks();
});

function fireKeydown(opts: {
  key: string;
  metaKey?: boolean;
  ctrlKey?: boolean;
  shiftKey?: boolean;
}) {
  const event = new KeyboardEvent('keydown', {
    key: opts.key,
    metaKey: opts.metaKey ?? false,
    ctrlKey: opts.ctrlKey ?? false,
    shiftKey: opts.shiftKey ?? false,
    bubbles: true,
    cancelable: true,
  });
  document.dispatchEvent(event);
  return event;
}

describe('useKeyboardShortcuts', () => {
  it('fires action on matching Cmd+key shortcut', () => {
    const action = vi.fn();
    const shortcuts: ShortcutDefinition[] = [
      { key: 'n', metaKey: true, label: 'New', description: 'New item', action },
    ];

    renderHook(() => useKeyboardShortcuts({ shortcuts }));

    fireKeydown({ key: 'n', metaKey: true });
    expect(action).toHaveBeenCalledTimes(1);
  });

  it('fires action on matching Cmd+Shift+key shortcut', () => {
    const action = vi.fn();
    const shortcuts: ShortcutDefinition[] = [
      {
        key: 'n',
        metaKey: true,
        shiftKey: true,
        label: 'New Project',
        description: 'New project',
        action,
      },
    ];

    renderHook(() => useKeyboardShortcuts({ shortcuts }));

    fireKeydown({ key: 'n', metaKey: true, shiftKey: true });
    expect(action).toHaveBeenCalledTimes(1);
  });

  it('does not fire action when key does not match', () => {
    const action = vi.fn();
    const shortcuts: ShortcutDefinition[] = [
      { key: 'n', metaKey: true, label: 'New', description: 'New item', action },
    ];

    renderHook(() => useKeyboardShortcuts({ shortcuts }));

    fireKeydown({ key: 'x', metaKey: true });
    expect(action).not.toHaveBeenCalled();
  });

  it('does not fire action when modifier does not match', () => {
    const action = vi.fn();
    const shortcuts: ShortcutDefinition[] = [
      { key: 'n', metaKey: true, label: 'New', description: 'New item', action },
    ];

    renderHook(() => useKeyboardShortcuts({ shortcuts }));

    // No metaKey
    fireKeydown({ key: 'n' });
    expect(action).not.toHaveBeenCalled();
  });

  it('fires Cmd+Enter shortcut', () => {
    const action = vi.fn();
    const shortcuts: ShortcutDefinition[] = [
      { key: 'Enter', metaKey: true, label: 'Launch', description: 'Launch agent', action },
    ];

    renderHook(() => useKeyboardShortcuts({ shortcuts }));

    fireKeydown({ key: 'Enter', metaKey: true });
    expect(action).toHaveBeenCalledTimes(1);
  });

  it('fires Cmd+1 through Cmd+9 shortcuts', () => {
    const actions = Array.from({ length: 9 }, () => vi.fn());
    const shortcuts: ShortcutDefinition[] = actions.map((action, i) => ({
      key: String(i + 1),
      metaKey: true,
      label: `Tab ${i + 1}`,
      description: `Switch to tab ${i + 1}`,
      action,
    }));

    renderHook(() => useKeyboardShortcuts({ shortcuts }));

    fireKeydown({ key: '1', metaKey: true });
    expect(actions[0]).toHaveBeenCalledTimes(1);

    fireKeydown({ key: '5', metaKey: true });
    expect(actions[4]).toHaveBeenCalledTimes(1);

    fireKeydown({ key: '9', metaKey: true });
    expect(actions[8]).toHaveBeenCalledTimes(1);
  });

  it('fires Cmd+W shortcut', () => {
    const action = vi.fn();
    const shortcuts: ShortcutDefinition[] = [
      { key: 'w', metaKey: true, label: 'Close', description: 'Close tab', action },
    ];

    renderHook(() => useKeyboardShortcuts({ shortcuts }));

    fireKeydown({ key: 'w', metaKey: true });
    expect(action).toHaveBeenCalledTimes(1);
  });

  it('fires Cmd+/ shortcut', () => {
    const action = vi.fn();
    const shortcuts: ShortcutDefinition[] = [
      { key: '/', metaKey: true, label: 'Help', description: 'Show shortcuts', action },
    ];

    renderHook(() => useKeyboardShortcuts({ shortcuts }));

    fireKeydown({ key: '/', metaKey: true });
    expect(action).toHaveBeenCalledTimes(1);
  });

  it('fires ? shortcut without modifier', () => {
    const action = vi.fn();
    const shortcuts: ShortcutDefinition[] = [
      { key: '?', label: 'Help', description: 'Show shortcuts', action },
    ];

    renderHook(() => useKeyboardShortcuts({ shortcuts }));

    fireKeydown({ key: '?' });
    expect(action).toHaveBeenCalledTimes(1);
  });

  it('does not intercept shortcuts when terminal is focused', () => {
    const action = vi.fn();
    const shortcuts: ShortcutDefinition[] = [
      { key: 'n', metaKey: true, label: 'New', description: 'New item', action },
    ];

    // Create a fake terminal element
    const xtermEl = document.createElement('div');
    xtermEl.classList.add('xterm');
    const textarea = document.createElement('textarea');
    xtermEl.appendChild(textarea);
    document.body.appendChild(xtermEl);
    textarea.focus();

    renderHook(() => useKeyboardShortcuts({ shortcuts }));

    fireKeydown({ key: 'n', metaKey: true });
    expect(action).not.toHaveBeenCalled();

    // Cleanup
    document.body.removeChild(xtermEl);
  });

  it('does not fire when disabled', () => {
    const action = vi.fn();
    const shortcuts: ShortcutDefinition[] = [
      { key: 'n', metaKey: true, label: 'New', description: 'New item', action },
    ];

    renderHook(() => useKeyboardShortcuts({ shortcuts, enabled: false }));

    fireKeydown({ key: 'n', metaKey: true });
    expect(action).not.toHaveBeenCalled();
  });

  it('works with ctrlKey as alternative to metaKey', () => {
    const action = vi.fn();
    const shortcuts: ShortcutDefinition[] = [
      { key: 'n', metaKey: true, label: 'New', description: 'New item', action },
    ];

    renderHook(() => useKeyboardShortcuts({ shortcuts }));

    fireKeydown({ key: 'n', ctrlKey: true });
    expect(action).toHaveBeenCalledTimes(1);
  });
});

describe('formatShortcut', () => {
  it('formats Cmd+key', () => {
    const result = formatShortcut({
      key: 'n',
      metaKey: true,
      label: 'New',
      description: 'New item',
      action: () => {},
    });
    expect(result).toBe('\u2318N');
  });

  it('formats Cmd+Shift+key', () => {
    const result = formatShortcut({
      key: 'n',
      metaKey: true,
      shiftKey: true,
      label: 'New Project',
      description: 'New project',
      action: () => {},
    });
    expect(result).toBe('\u2318\u21E7N');
  });

  it('formats Enter key with symbol', () => {
    const result = formatShortcut({
      key: 'Enter',
      metaKey: true,
      label: 'Launch',
      description: 'Launch agent',
      action: () => {},
    });
    expect(result).toBe('\u2318\u21A9');
  });

  it('formats plain key', () => {
    const result = formatShortcut({
      key: '?',
      label: 'Help',
      description: 'Show shortcuts',
      action: () => {},
    });
    expect(result).toBe('?');
  });
});
