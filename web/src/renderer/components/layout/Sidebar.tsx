import { useState } from 'react';
import {
  Box,
  PanelLeft,
  ChevronRight,
  ChevronDown,
  SquareTerminal,
  Settings,
  LogOut,
} from 'lucide-react';
import {
  useWorkspaceBySlug,
  useProjectSubscription,
  useTaskSubscription,
} from '../../hooks/useGraphQL.js';
import { useNavigation } from '../../navigation/context.js';
import { useWorkspace } from '../../workspace/context.js';
import { StatusIcon } from '../shared/StatusIcon.js';
import { SidebarSkeleton } from './Skeleton.js';
import { WorkspaceSwitcher } from '../workspace/WorkspaceSwitcher.js';
import { NotificationBell } from '../notifications/NotificationBell.js';
import { ActiveTerminals } from './ActiveTerminals.js';
import { useActiveTerminals } from '../../hooks/useActiveTerminals.js';
import { useSessionActivity } from '../../hooks/useSessionActivity.js';
import { SessionStatus } from '../../../shared/session-status.js';
import { iconSize } from '../../tokens/icon-size.js';

interface SidebarTask {
  id: string;
  displayId: string;
  title: string;
  status: string;
}

function SidebarTaskItem({
  task,
  isActive,
  onClick,
}: {
  task: SidebarTask;
  isActive: boolean;
  onClick: () => void;
}) {
  return (
    <li>
      <button
        onClick={onClick}
        className={`w-full text-left px-2 py-1 text-label-sm rounded flex items-center justify-between gap-1 transition-colors ${
          isActive ? 'bg-gray-800 text-white' : 'text-gray-400 hover:bg-gray-800 hover:text-white'
        }`}
      >
        <StatusIcon status={task.status} className="w-3 h-3 flex-shrink-0" />
        <span className="text-gray-500 font-mono mr-1">{task.displayId}</span>
        <span className="truncate">{task.title}</span>
      </button>
    </li>
  );
}

function collapsedBadgeColor(statuses: string[]): string {
  const set = new Set(statuses);
  if (set.has(SessionStatus.AwaitingPermission)) return 'bg-warning animate-pulse';
  if (set.has(SessionStatus.WaitingForInput)) return 'bg-warning animate-pulse';
  return 'bg-info';
}

interface SidebarProps {
  collapsed: boolean;
  onToggleCollapse: () => void;
  onLogout: () => void;
}

export function Sidebar({ collapsed, onToggleCollapse, onLogout }: SidebarProps) {
  const { currentWorkspace } = useWorkspace();
  const { data, fetching } = useWorkspaceBySlug(currentWorkspace?.slug ?? '');
  const { navigate, current } = useNavigation();
  const [expandedProjects, setExpandedProjects] = useState<Set<string>>(new Set());
  const [inboxExpanded, setInboxExpanded] = useState(false);

  useProjectSubscription(currentWorkspace?.id ?? '');
  useTaskSubscription(currentWorkspace?.id ?? '');

  const toggleExpand = (projectId: string) => {
    setExpandedProjects((prev) => {
      const next = new Set(prev);
      if (next.has(projectId)) {
        next.delete(projectId);
      } else {
        next.add(projectId);
      }
      return next;
    });
  };

  const projects = data?.workspace?.projects ?? [];
  const inboxTasks = data?.workspace?.tasks ?? [];
  const activeTerminals = useActiveTerminals(projects, inboxTasks);
  const activeSessionIds = useSessionActivity();

  if (collapsed) {
    return (
      <aside
        className="w-12 bg-surface-primary border-r border-gray-800 flex flex-col items-center"
        data-testid="sidebar-collapsed"
      >
        <div className="py-4 flex flex-col items-center gap-2">
          <button
            onClick={onToggleCollapse}
            className="text-gray-400 hover:text-white transition-colors p-1"
            aria-label="Expand sidebar"
            data-testid="sidebar-expand-btn"
          >
            <PanelLeft className={iconSize.sm} />
          </button>
          <NotificationBell />
        </div>
        {activeTerminals.length > 0 && (
          <div className="py-2" data-testid="active-terminals-collapsed">
            <div className="relative flex justify-center">
              <SquareTerminal className={`${iconSize.md} text-success`} />
              <span
                className={`absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full text-label-xs font-bold text-white ${collapsedBadgeColor(activeTerminals.map((t) => t.status))}`}
              >
                {activeTerminals.length}
              </span>
            </div>
          </div>
        )}
      </aside>
    );
  }

  return (
    <aside
      className="w-64 bg-surface-primary border-r border-gray-800 flex flex-col"
      data-testid="sidebar"
    >
      <div className="p-4 border-b border-gray-800 flex items-center justify-between">
        <button
          onClick={() => navigate({ view: 'projects' })}
          className="text-heading-sm font-semibold text-white hover:text-gray-200 transition-colors"
        >
          Orca
        </button>
        <div className="flex items-center gap-1">
          <NotificationBell />
          <button
            onClick={onToggleCollapse}
            className="text-gray-500 hover:text-gray-300 transition-colors p-1"
            aria-label="Collapse sidebar"
            data-testid="sidebar-collapse-btn"
          >
            <PanelLeft className={iconSize.sm} />
          </button>
        </div>
      </div>
      <WorkspaceSwitcher />
      <ActiveTerminals entries={activeTerminals} activeSessionIds={activeSessionIds} />
      <nav className="flex-1 p-2 overflow-y-auto min-h-0">
        {inboxTasks.length > 0 && (
          <div className="mb-2">
            <button
              onClick={() => setInboxExpanded((v) => !v)}
              className="w-full text-left px-3 py-1.5 text-body-sm rounded transition-colors text-gray-400 hover:bg-gray-800 hover:text-white flex items-center justify-between"
              data-testid="sidebar-inbox-btn"
            >
              <span className="flex items-center gap-1">
                <span className="text-label-sm">{inboxExpanded ? '\u25BC' : '\u25B6'}</span>
                Inbox
              </span>
              <span className="text-label-xs text-gray-500 bg-gray-800 rounded-full px-1.5 py-0.5">
                {inboxTasks.length}
              </span>
            </button>
            {inboxExpanded && (
              <ul className="ml-6 mt-0.5 space-y-0.5">
                {inboxTasks.map((task) => (
                  <SidebarTaskItem
                    key={task.id}
                    task={task}
                    isActive={current.view === 'task' && current.id === task.id}
                    onClick={() => navigate({ view: 'task', id: task.id })}
                  />
                ))}
              </ul>
            )}
          </div>
        )}
        <div className="px-2 py-2.5 flex items-center gap-2 text-gray-500">
          <Box className={iconSize.sm} />
          <span className="text-label-sm font-medium">Projects</span>
        </div>
        {fetching && projects.length === 0 ? (
          <SidebarSkeleton />
        ) : projects.length === 0 ? (
          <div className="px-3 py-2 text-body-sm text-gray-500">No projects yet</div>
        ) : (
          <ul className="space-y-0.5">
            {projects.map((project) => {
              const isExpanded = expandedProjects.has(project.id);
              const isActive = current.view === 'project' && current.id === project.id;

              return (
                <li key={project.id}>
                  <button
                    onClick={() => navigate({ view: 'project', id: project.id })}
                    className={`w-full flex items-center px-2 py-1.5 text-body-sm rounded transition-colors text-left ${
                      isActive
                        ? 'bg-gray-800 text-white'
                        : 'text-gray-300 hover:bg-gray-800 hover:text-white'
                    }`}
                  >
                    <span className="flex-1 truncate">{project.name}</span>
                    <span
                      role="button"
                      tabIndex={0}
                      onClick={(e) => {
                        e.stopPropagation();
                        e.preventDefault();
                        toggleExpand(project.id);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.stopPropagation();
                          e.preventDefault();
                          toggleExpand(project.id);
                        }
                      }}
                      className="p-0.5 hover:text-gray-300 transition-colors flex-shrink-0"
                      aria-label={isExpanded ? 'Collapse' : 'Expand'}
                    >
                      {isExpanded ? (
                        <ChevronDown className={iconSize.xs} />
                      ) : (
                        <ChevronRight className={iconSize.xs} />
                      )}
                    </span>
                  </button>

                  {isExpanded && project.tasks.length > 0 && (
                    <ul className="ml-6 mt-0.5 space-y-0.5">
                      {project.tasks.map((task) => (
                        <SidebarTaskItem
                          key={task.id}
                          task={task}
                          isActive={current.view === 'task' && current.id === task.id}
                          onClick={() => navigate({ view: 'task', id: task.id })}
                        />
                      ))}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </nav>
      <div className="border-t border-gray-800">
        <div className="p-2">
          <button
            onClick={() => navigate({ view: 'settings' })}
            className={`w-full text-left px-3 py-1.5 text-body-sm rounded transition-colors ${
              current.view === 'settings' || current.view === 'members'
                ? 'bg-gray-800 text-white'
                : 'text-gray-400 hover:bg-gray-800 hover:text-white'
            }`}
          >
            <Settings className={`${iconSize.sm} inline-block mr-2`} />
            Settings
          </button>
        </div>
        <div className="p-2 pt-0">
          <button
            onClick={onLogout}
            className="w-full text-left px-3 py-1.5 text-label-sm text-gray-500 hover:text-gray-300 hover:bg-gray-800 rounded transition-colors"
          >
            <LogOut className={`${iconSize.sm} inline-block mr-2`} />
            Sign out
          </button>
        </div>
        <div className="px-3 py-2 border-t border-gray-800 text-label-xs text-gray-600">
          v{__APP_VERSION__} ({__GIT_HASH__})
        </div>
      </div>
    </aside>
  );
}
