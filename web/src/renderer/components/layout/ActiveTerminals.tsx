import type { ActiveTerminalEntry } from '../../hooks/useActiveTerminals.js';
import { type SessionStatus, statusDotClass } from '../../../shared/session-status.js';
import { useNavigation } from '../../navigation/context.js';

interface ActiveTerminalsProps {
  entries: ActiveTerminalEntry[];
}

export function ActiveTerminals({ entries }: ActiveTerminalsProps) {
  const { navigate, current } = useNavigation();

  if (entries.length === 0) return null;

  return (
    <div className="border-b border-gray-800 p-2" data-testid="active-terminals">
      <h3 className="px-2 pb-1.5 text-xs font-medium text-gray-500 uppercase tracking-wide">
        Active Terminals
      </h3>
      <ul className="space-y-0.5 max-h-40 overflow-y-auto">
        {entries.map((entry) => {
          const isActive = current.view === 'task' && current.id === entry.taskId;
          const dotClass = statusDotClass[entry.status as SessionStatus] ?? 'bg-gray-500';

          return (
            <li key={entry.taskId}>
              <button
                onClick={() => navigate({ view: 'task', id: entry.taskId })}
                className={`w-full text-left px-2 py-1 text-xs rounded flex items-center gap-2 transition-colors ${
                  isActive
                    ? 'bg-gray-800 text-white'
                    : 'text-gray-300 hover:bg-gray-800 hover:text-white'
                }`}
                data-testid={`active-terminal-${entry.taskId}`}
              >
                <span className={`inline-block h-2 w-2 flex-shrink-0 rounded-full ${dotClass}`} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate">{entry.taskTitle}</span>
                  <span className="block truncate text-[10px] text-gray-500">
                    {entry.projectName}
                  </span>
                </span>
                {entry.sessionCount > 1 && (
                  <span className="flex-shrink-0 rounded bg-gray-700 px-1.5 py-0.5 text-[10px] text-gray-300">
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
