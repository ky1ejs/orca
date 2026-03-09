import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import { iconSize } from '../../tokens/icon-size.js';
import { formatShortcut, type ShortcutDefinition } from '../../hooks/useKeyboardShortcuts.js';

interface KeyboardShortcutHelpProps {
  shortcuts: ShortcutDefinition[];
  isOpen: boolean;
  onClose: () => void;
}

export function KeyboardShortcutHelp({ shortcuts, isOpen, onClose }: KeyboardShortcutHelpProps) {
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-modal-backdrop flex items-center justify-center bg-surface-overlay animate-fade-in"
      onClick={(e) => {
        if (e.target === overlayRef.current) onClose();
      }}
      data-testid="shortcut-help-modal"
    >
      <div className="w-full max-w-md rounded-lg border border-edge-subtle bg-surface-raised shadow-2xl animate-scale-in">
        <div className="flex items-center justify-between border-b border-edge px-5 py-4">
          <h2 className="text-heading-sm font-semibold text-fg">Keyboard Shortcuts</h2>
          <button
            onClick={onClose}
            className="text-fg-muted hover:text-fg transition-colors"
            data-testid="close-shortcut-help"
          >
            <X className={iconSize.sm} />
          </button>
        </div>
        <div className="px-5 py-4 space-y-3 max-h-96 overflow-y-auto">
          {shortcuts.map((shortcut) => (
            <div
              key={`${shortcut.key}-${shortcut.metaKey}-${shortcut.shiftKey}`}
              className="flex items-center justify-between"
            >
              <span className="text-fg-muted text-body-sm">{shortcut.description}</span>
              <kbd className="ml-4 shrink-0 rounded bg-surface-overlay px-2 py-1 font-mono text-code-sm text-fg-muted border border-edge-subtle">
                {formatShortcut(shortcut)}
              </kbd>
            </div>
          ))}
        </div>
        <div className="border-t border-edge px-5 py-3">
          <p className="text-label-sm text-fg-faint">
            Shortcuts are disabled when a terminal is focused.
          </p>
        </div>
      </div>
    </div>
  );
}
