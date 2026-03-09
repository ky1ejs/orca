import type { ActiveTerminalEntry } from '../../hooks/useActiveTerminals.js';
import {
  SessionStatus,
  type SessionStatus as SessionStatusType,
  getStatusDotClasses,
  isNeedsAttentionStatus,
} from '../../../shared/session-status.js';
import { useNavigation } from '../../navigation/context.js';

const attentionLabel: Partial<Record<SessionStatusType, { text: string; className: string }>> = {
  [SessionStatus.AwaitingPermission]: {
    text: 'Needs Permission',
    className: 'bg-warning-muted text-warning',
  },
  [SessionStatus.WaitingForInput]: {
    text: 'Waiting',
    className: 'bg-warning-muted text-warning',
  },
};

interface ActiveTerminalsProps {
  entries: ActiveTerminalEntry[];
  activeSessionIds?: Set<string>;
}

export function ActiveTerminals({ entries, activeSessionIds }: ActiveTerminalsProps) {
  const { navigate, current } = useNavigation();

  if (entries.length === 0) return null;

  const needsAttentionCount = entries.filter((e) => isNeedsAttentionStatus(e.status)).length;

  return (
    <div className="border-b border-edge p-2" data-testid="active-terminals">
      <h3 className="px-2 pb-1.5 text-label-sm font-medium text-fg-faint uppercase tracking-wide flex items-center gap-2">
        Active Terminals
        {needsAttentionCount > 0 && (
          <span className="rounded-full bg-permission-dot px-1.5 py-0.5 text-[9px] font-bold text-white leading-none">
            {needsAttentionCount}
          </span>
        )}
      </h3>
      <ul className="space-y-0.5 max-h-40 overflow-y-auto">
        {entries.map((entry) => {
          const isActive = current.view === 'task' && current.id === entry.taskId;
          const hasActivity = activeSessionIds
            ? entry.sessionIds.some((id) => activeSessionIds.has(id))
            : false;
          const dotClass = getStatusDotClasses(entry.status as SessionStatusType, hasActivity);
          const label = attentionLabel[entry.status as SessionStatusType];

          return (
            <li key={entry.taskId}>
              <button
                onClick={() =>
                  navigate({
                    view: 'task',
                    id: entry.taskId,
                    projectId: entry.projectId,
                    projectName: entry.projectName,
                    taskName: entry.taskTitle,
                  })
                }
                className={`w-full text-left px-2 py-1 text-label-sm rounded flex items-center gap-2 transition-colors ${
                  isActive
                    ? 'bg-surface-inset text-fg'
                    : 'text-fg-muted hover:bg-surface-hover hover:text-fg'
                }`}
                data-testid={`active-terminal-${entry.taskId}`}
              >
                <span className={`inline-block h-2 w-2 flex-shrink-0 rounded-full ${dotClass}`} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate">
                    <span className="text-fg-faint font-mono text-code-xs">{entry.displayId}</span>{' '}
                    {entry.taskTitle}
                  </span>
                  {label ? (
                    <span
                      className={`inline-block mt-0.5 rounded px-1 py-0.5 text-[10px] font-medium leading-none ${label.className}`}
                    >
                      {label.text}
                    </span>
                  ) : (
                    <span className="block truncate text-[10px] text-fg-faint">
                      {entry.projectName}
                    </span>
                  )}
                </span>
                {entry.sessionCount > 1 && (
                  <span className="flex-shrink-0 rounded bg-surface-hover px-1.5 py-0.5 text-label-xs text-fg-muted">
                    {entry.sessionCount}
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
