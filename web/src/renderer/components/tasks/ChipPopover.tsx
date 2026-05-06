import { useState, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
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

const CONTENT_CLASSES =
  'bg-surface-hover border border-edge rounded-md shadow-dropdown z-dropdown min-w-[200px] max-h-[280px] overflow-y-auto animate-slide-up py-1 focus:outline-none';

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
  const close = () => setOpen(false);

  return (
    <DropdownMenu.Root open={open} onOpenChange={setOpen}>
      <div
        className={variant === 'inline' ? 'inline-flex' : 'inline-flex w-full'}
        style={maxWidth ? { maxWidth } : undefined}
      >
        <DropdownMenu.Trigger
          aria-label={triggerLabel}
          data-testid={triggerTestId}
          className={VARIANT_TRIGGER_CLASSES[variant]}
        >
          <span className="inline-flex items-center gap-1.5 min-w-0 flex-1">{trigger}</span>
          <ChevronDown
            className={`${iconSize.xs} text-fg-faint group-hover:text-fg-muted flex-shrink-0 transition-colors`}
          />
        </DropdownMenu.Trigger>
      </div>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align={align === 'right' ? 'end' : 'start'}
          sideOffset={4}
          collisionPadding={8}
          className={CONTENT_CLASSES}
        >
          {children(close)}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
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
    <DropdownMenu.Item
      onSelect={onSelect}
      data-testid={testId}
      className={`w-full flex items-center gap-2 px-3 py-1.5 text-body-sm text-left cursor-pointer outline-none transition-colors ${
        selected ? 'bg-surface-active text-fg' : 'text-fg data-[highlighted]:bg-surface-active'
      }`}
    >
      {children}
    </DropdownMenu.Item>
  );
}
