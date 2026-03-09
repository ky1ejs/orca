import { useEffect, useCallback, useRef } from 'react';

export interface ShortcutDefinition {
  key: string;
  metaKey?: boolean;
  shiftKey?: boolean;
  label: string;
  description: string;
  action: () => void;
}

interface KeyboardShortcutsOptions {
  shortcuts: ShortcutDefinition[];
  enabled?: boolean;
}

/**
 * Returns true if the active element is inside an xterm.js terminal,
 * meaning we should NOT intercept keyboard events.
 */
function isTerminalFocused(): boolean {
  const active = document.activeElement;
  if (!active) return false;
  return !!active.closest('.xterm');
}

/**
 * Returns true if the active element is an editable field (input, textarea, contenteditable),
 * meaning bare-key shortcuts should not fire.
 */
function isEditableElementFocused(): boolean {
  const active = document.activeElement;
  if (!active) return false;
  const tag = active.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA') return true;
  if ((active as HTMLElement).isContentEditable) return true;
  return false;
}

/**
 * Global keyboard shortcut handler.
 * Registers shortcuts on the document and fires actions on match.
 * Skips shortcuts when an xterm.js terminal element is focused,
 * so terminal input is never intercepted.
 */
export function useKeyboardShortcuts({ shortcuts, enabled = true }: KeyboardShortcutsOptions) {
  const shortcutsRef = useRef(shortcuts);
  shortcutsRef.current = shortcuts;

  const handler = useCallback(
    (e: KeyboardEvent) => {
      if (!enabled) return;
      if (isTerminalFocused()) return;

      for (const shortcut of shortcutsRef.current) {
        const metaMatch = shortcut.metaKey ? e.metaKey || e.ctrlKey : !e.metaKey && !e.ctrlKey;
        const shiftMatch = shortcut.shiftKey ? e.shiftKey : !e.shiftKey;
        const keyMatch = e.key.toLowerCase() === shortcut.key.toLowerCase();
        const hasModifier = shortcut.metaKey || false;

        // Skip bare-key shortcuts when an editable element is focused
        if (!hasModifier && isEditableElementFocused()) continue;

        if (metaMatch && shiftMatch && keyMatch) {
          e.preventDefault();
          e.stopPropagation();
          shortcut.action();
          return;
        }
      }
    },
    [enabled],
  );

  useEffect(() => {
    document.addEventListener('keydown', handler, true);
    return () => {
      document.removeEventListener('keydown', handler, true);
    };
  }, [handler]);
}

/**
 * Format a shortcut for display.
 * Uses Mac-style symbols (assumes Mac since this is an Electron app on macOS).
 */
export function formatShortcut(shortcut: ShortcutDefinition): string {
  const parts: string[] = [];
  if (shortcut.metaKey) parts.push('\u2318');
  if (shortcut.shiftKey) parts.push('\u21E7');

  const keyDisplay = shortcut.key === 'Enter' ? '\u21A9' : shortcut.key.toUpperCase();
  parts.push(keyDisplay);

  return parts.join('');
}
