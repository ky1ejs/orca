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
      <div className="w-full max-w-md rounded-lg border border-gray-700 bg-surface-primary shadow-modal animate-scale-in">
        <div className="flex items-center justify-between border-b border-gray-800 px-5 py-4">
          <h2 className="text-heading-sm font-semibold text-white">Keyboard Shortcuts</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors"
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
              <span className="text-gray-300 text-body-sm">{shortcut.description}</span>
              <kbd className="ml-4 shrink-0 rounded bg-gray-800 px-2 py-1 font-mono text-label-sm text-gray-300 border border-gray-700">
                {formatShortcut(shortcut)}
              </kbd>
            </div>
          ))}
        </div>
        <div className="border-t border-gray-800 px-5 py-3">
          <p className="text-label-sm text-gray-500">
            Shortcuts are disabled when a terminal is focused.
          </p>
        </div>
      </div>
    </div>
  );
}
