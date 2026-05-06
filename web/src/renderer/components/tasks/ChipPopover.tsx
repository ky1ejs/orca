import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
import { iconSize } from '../../tokens/icon-size.js';

export type ChipPopoverVariant = 'default' | 'inline';

interface ChipPopoverProps {
  trigger: ReactNode;
  triggerLabel?: string;
  children: (close: () => void) => ReactNode;
  align?: 'left' | 'right';
  variant?: ChipPopoverVariant;
  triggerTestId?: string;
  maxWidth?: string;
}

const VARIANT_TRIGGER_CLASSES: Record<ChipPopoverVariant, string> = {
  default:
    'group inline-flex w-full items-center gap-1.5 px-1.5 py-1 -mx-1.5 rounded-md text-body-sm text-fg hover:bg-surface-hover focus:outline-none focus:ring-1 focus:ring-edge transition-colors',
  inline:
    'group inline-flex items-center gap-1.5 px-2 py-1 rounded-full bg-surface-inset border border-edge-subtle text-label-md text-fg hover:bg-surface-hover focus:outline-none focus:ring-1 focus:ring-edge transition-colors',
};

export function ChipPopover({
  trigger,
  triggerLabel,
  children,
  align = 'left',
  variant = 'default',
  triggerTestId,
  maxWidth,
}: ChipPopoverProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const handleEscape = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [open]);

  const close = () => setOpen(false);

  const handleTriggerKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      setOpen((prev) => !prev);
    }
  };

  const wrapperClass =
    variant === 'inline' ? 'relative inline-flex' : 'relative inline-flex w-full';

  return (
    <div className={wrapperClass} ref={ref} style={maxWidth ? { maxWidth } : undefined}>
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        onKeyDown={handleTriggerKeyDown}
        aria-haspopup="true"
        aria-expanded={open}
        aria-label={triggerLabel}
        data-testid={triggerTestId}
        className={VARIANT_TRIGGER_CLASSES[variant]}
      >
        <span className="inline-flex items-center gap-1.5 min-w-0 flex-1">{trigger}</span>
        <ChevronDown
          className={`${iconSize.xs} text-fg-faint group-hover:text-fg-muted flex-shrink-0 transition-colors`}
        />
      </button>
      {open && (
        <div
          className={`absolute top-full mt-1 ${align === 'right' ? 'right-0' : 'left-0'} bg-surface-overlay border border-edge-subtle rounded-md shadow-dropdown z-dropdown min-w-[200px] max-h-[280px] overflow-y-auto animate-slide-up py-1`}
        >
          {children(close)}
        </div>
      )}
    </div>
  );
}

interface ChipPopoverItemProps {
  selected?: boolean;
  onSelect: () => void;
  children: ReactNode;
  testId?: string;
}

export function ChipPopoverItem({ selected, onSelect, children, testId }: ChipPopoverItemProps) {
  return (
    <button
      type="button"
      onClick={onSelect}
      data-testid={testId}
      className={`w-full flex items-center gap-2 px-3 py-1.5 text-body-sm text-left transition-colors ${
        selected ? 'bg-surface-hover text-fg' : 'text-fg hover:bg-surface-hover'
      }`}
    >
      {children}
    </button>
  );
}
