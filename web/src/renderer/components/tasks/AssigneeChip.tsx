import { Check, UserCircle2 } from 'lucide-react';
import { iconSize } from '../../tokens/icon-size.js';
import { ChipPopover, ChipPopoverItem, type ChipPopoverVariant } from './ChipPopover.js';

interface AssigneeChipProps {
  assignee: { id: string; name: string } | null | undefined;
  members: { user: { id: string; name: string } }[];
  onChange: (userId: string | null) => void | Promise<void>;
  variant?: ChipPopoverVariant;
  testId?: string;
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
}

function Avatar({ name, size = 'sm' }: { name: string; size?: 'xs' | 'sm' }) {
  const dim = size === 'xs' ? 'w-4 h-4 text-[9px]' : 'w-5 h-5 text-[10px]';
  return (
    <span
      className={`inline-flex items-center justify-center rounded-full bg-accent-muted text-fg-muted font-mono font-medium uppercase flex-shrink-0 ${dim}`}
      aria-hidden
    >
      {initials(name)}
    </span>
  );
}

export function AssigneeChip({
  assignee,
  members,
  onChange,
  variant = 'default',
  testId,
}: AssigneeChipProps) {
  const isUnassigned = !assignee;

  const trigger = (
    <>
      {isUnassigned ? (
        <UserCircle2 className={`${iconSize.sm} text-fg-faint`} />
      ) : (
        <Avatar name={assignee.name} />
      )}
      <span className={`truncate ${isUnassigned ? 'text-fg-muted' : ''}`}>
        {assignee?.name ?? 'Unassigned'}
      </span>
    </>
  );

  return (
    <ChipPopover
      trigger={trigger}
      triggerLabel="Change assignee"
      variant={variant}
      triggerTestId={testId ?? 'assignee-chip'}
      maxWidth={variant === 'inline' ? '180px' : undefined}
    >
      {(close) => (
        <>
          <ChipPopoverItem
            selected={isUnassigned}
            onSelect={() => {
              void onChange(null);
              close();
            }}
            testId="assignee-option-unassigned"
          >
            <UserCircle2 className={`${iconSize.sm} text-fg-faint`} />
            <span className="flex-1">Unassigned</span>
            {isUnassigned && <Check className={`${iconSize.xs} text-fg-muted`} />}
          </ChipPopoverItem>
          {members.length > 0 && <div className="my-1 border-t border-edge-subtle" />}
          {members.map((m) => (
            <ChipPopoverItem
              key={m.user.id}
              selected={m.user.id === assignee?.id}
              onSelect={() => {
                void onChange(m.user.id);
                close();
              }}
              testId={`assignee-option-${m.user.id}`}
            >
              <Avatar name={m.user.name} />
              <span className="flex-1 truncate">{m.user.name}</span>
              {m.user.id === assignee?.id && <Check className={`${iconSize.xs} text-fg-muted`} />}
            </ChipPopoverItem>
          ))}
        </>
      )}
    </ChipPopover>
  );
}
