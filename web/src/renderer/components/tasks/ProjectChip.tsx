import { Check, FolderKanban, Inbox } from 'lucide-react';
import { iconSize } from '../../tokens/icon-size.js';
import { ChipPopover, ChipPopoverItem, type ChipPopoverVariant } from './ChipPopover.js';

interface ProjectChipProps {
  projectId: string | null | undefined;
  projects: { id: string; name: string }[];
  onChange: (projectId: string | null) => void | Promise<void>;
  variant?: ChipPopoverVariant;
  testId?: string;
}

export function ProjectChip({
  projectId,
  projects,
  onChange,
  variant = 'default',
  testId,
}: ProjectChipProps) {
  const current = projectId ? projects.find((p) => p.id === projectId) : null;
  const isInbox = !current;

  const trigger = (
    <>
      {isInbox ? (
        <Inbox className={`${iconSize.sm} text-fg-faint`} />
      ) : (
        <FolderKanban className={`${iconSize.sm} text-fg-muted`} />
      )}
      <span className={`truncate ${isInbox ? 'text-fg-muted' : ''}`}>
        {current?.name ?? 'Inbox'}
      </span>
    </>
  );

  return (
    <ChipPopover
      trigger={trigger}
      triggerLabel="Change project"
      variant={variant}
      triggerTestId={testId ?? 'project-chip'}
      maxWidth={variant === 'inline' ? '180px' : undefined}
    >
      {(close) => (
        <>
          <ChipPopoverItem
            selected={isInbox}
            onSelect={() => {
              void onChange(null);
              close();
            }}
            testId="project-option-inbox"
          >
            <Inbox className={`${iconSize.sm} text-fg-faint`} />
            <span className="flex-1">Inbox (no project)</span>
            {isInbox && <Check className={`${iconSize.xs} text-fg-muted`} />}
          </ChipPopoverItem>
          {projects.length > 0 && <div className="my-1 border-t border-edge-subtle" />}
          {projects.map((p) => (
            <ChipPopoverItem
              key={p.id}
              selected={p.id === projectId}
              onSelect={() => {
                void onChange(p.id);
                close();
              }}
              testId={`project-option-${p.id}`}
            >
              <FolderKanban className={`${iconSize.sm} text-fg-muted`} />
              <span className="flex-1 truncate">{p.name}</span>
              {p.id === projectId && <Check className={`${iconSize.xs} text-fg-muted`} />}
            </ChipPopoverItem>
          ))}
        </>
      )}
    </ChipPopover>
  );
}
