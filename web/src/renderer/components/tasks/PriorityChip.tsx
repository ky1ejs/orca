import { Check } from 'lucide-react';
import { iconSize } from '../../tokens/icon-size.js';
import { TaskPriority } from '../../graphql/__generated__/generated.js';
import { PRIORITY_LABELS, PRIORITY_ORDER } from '../../utils/task-status.js';
import { PriorityIcon } from '../shared/PriorityIcon.js';
import { ChipPopover, ChipPopoverItem, type ChipPopoverVariant } from './ChipPopover.js';

interface PriorityChipProps {
  priority: TaskPriority;
  onChange: (priority: TaskPriority) => void | Promise<void>;
  variant?: ChipPopoverVariant;
  testId?: string;
}

export function PriorityChip({
  priority,
  onChange,
  variant = 'default',
  testId,
}: PriorityChipProps) {
  const isNone = priority === TaskPriority.None;

  const trigger = (
    <>
      <PriorityIcon priority={priority} className={iconSize.sm} />
      <span className={`truncate ${isNone ? 'text-fg-muted' : ''}`}>
        {PRIORITY_LABELS[priority]}
      </span>
    </>
  );

  return (
    <ChipPopover
      trigger={trigger}
      triggerLabel="Change priority"
      variant={variant}
      triggerTestId={testId ?? 'priority-chip'}
    >
      {(close) => (
        <>
          {PRIORITY_ORDER.map((p) => (
            <ChipPopoverItem
              key={p}
              selected={p === priority}
              onSelect={() => {
                void onChange(p);
                close();
              }}
              testId={`priority-option-${p}`}
            >
              <PriorityIcon priority={p} className={iconSize.sm} />
              <span className="flex-1">{PRIORITY_LABELS[p]}</span>
              {p === priority && <Check className={`${iconSize.xs} text-fg-muted`} />}
            </ChipPopoverItem>
          ))}
        </>
      )}
    </ChipPopover>
  );
}
