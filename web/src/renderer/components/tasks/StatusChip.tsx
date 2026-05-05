import { Check } from 'lucide-react';
import { iconSize } from '../../tokens/icon-size.js';
import { TaskStatus } from '../../graphql/__generated__/generated.js';
import { STATUS_ORDER, STATUS_LABELS } from '../../utils/task-status.js';
import { StatusIcon } from '../shared/StatusIcon.js';
import { ChipPopover, ChipPopoverItem, type ChipPopoverVariant } from './ChipPopover.js';

interface StatusChipProps {
  status: TaskStatus;
  onChange: (status: TaskStatus) => void | Promise<void>;
  variant?: ChipPopoverVariant;
  testId?: string;
}

export function StatusChip({ status, onChange, variant = 'default', testId }: StatusChipProps) {
  const trigger = (
    <>
      <StatusIcon status={status} className={iconSize.sm} />
      <span className="truncate">{STATUS_LABELS[status]}</span>
    </>
  );

  return (
    <ChipPopover
      trigger={trigger}
      triggerLabel="Change status"
      variant={variant}
      triggerTestId={testId ?? 'status-chip'}
    >
      {(close) => (
        <>
          {STATUS_ORDER.map((s) => (
            <ChipPopoverItem
              key={s}
              selected={s === status}
              onSelect={() => {
                void onChange(s);
                close();
              }}
              testId={`status-option-${s}`}
            >
              <StatusIcon status={s} className={iconSize.sm} />
              <span className="flex-1">{STATUS_LABELS[s]}</span>
              {s === status && <Check className={`${iconSize.xs} text-fg-muted`} />}
            </ChipPopoverItem>
          ))}
        </>
      )}
    </ChipPopover>
  );
}
