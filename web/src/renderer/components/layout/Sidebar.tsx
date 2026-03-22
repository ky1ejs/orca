import { useState, useRef, useCallback } from 'react';
import {
  Box,
  PanelLeft,
  ChevronRight,
  ChevronDown,
  SquareTerminal,
  Settings,
  LogOut,
  Target,
  User,
} from 'lucide-react';
import {
  useWorkspaceBySlug,
  useInitiativeSubscription,
  useProjectSubscription,
  useTaskSubscription,
} from '../../hooks/useGraphQL.js';
import { useNavigation } from '../../navigation/context.js';
import { useWorkspace } from '../../workspace/context.js';
import { useMyTasks } from '../../hooks/useMyTasks.js';
import { StatusIcon } from '../shared/StatusIcon.js';
import { SidebarSkeleton } from './Skeleton.js';
import { WorkspaceSwitcher } from '../workspace/WorkspaceSwitcher.js';
import { NotificationBell } from '../notifications/NotificationBell.js';
import { ActiveTerminals } from './ActiveTerminals.js';
import { useActiveTerminals, type ActiveTerminalEntry } from '../../hooks/useActiveTerminals.js';
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
          isActive
            ? 'bg-surface-inset text-fg'
            : 'text-fg-muted hover:bg-surface-hover hover:text-fg'
        }`}
      >
        <StatusIcon status={task.status} className="w-3 h-3 flex-shrink-0" />
        <span className="text-fg-faint font-mono text-code-xs mr-1">{task.displayId}</span>
        <span className="truncate">{task.title}</span>
      </button>
    </li>
  );
}

function collapsedBadgeColor(statuses: string[]): string {
  const set = new Set(statuses);
  if (set.has(SessionStatus.AwaitingPermission)) return 'bg-permission-dot animate-pulse';
  return 'bg-info-strong';
}

function ExpandToggle({ isExpanded, onToggle }: { isExpanded: boolean; onToggle: () => void }) {
  return (
    <span
      role="button"
      tabIndex={0}
      onClick={(e) => {
        e.stopPropagation();
        e.preventDefault();
        onToggle();
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.stopPropagation();
          e.preventDefault();
          onToggle();
        }
      }}
      className="p-0.5 hover:text-fg-muted transition-colors flex-shrink-0"
      aria-label={isExpanded ? 'Collapse' : 'Expand'}
    >
      {isExpanded ? (
        <ChevronDown className={iconSize.xs} />
      ) : (
        <ChevronRight className={iconSize.xs} />
      )}
    </span>
  );
}

function toggleSetItem(prev: Set<string>, id: string): Set<string> {
  const next = new Set(prev);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  return next;
}

interface SidebarProjectItemProps {
  project: {
    id: string;
    name: string;
    tasks: SidebarTask[];
  };
  isExpanded: boolean;
  isActive: boolean;
  isAncestor: boolean;
  onToggle: () => void;
  onNavigate: () => void;
  onTaskClick: (task: SidebarTask) => void;
  activeTaskId?: string;
  indent?: boolean;
}

function SidebarProjectItem({
  project,
  isExpanded,
  isActive,
  isAncestor,
  onToggle,
  onNavigate,
  onTaskClick,
  activeTaskId,
  indent,
}: SidebarProjectItemProps) {
  return (
    <li>
      <button
        onClick={onNavigate}
        className={`w-full flex items-center px-2 py-1.5 text-body-sm rounded transition-colors text-left ${indent ? 'ml-4' : ''} ${
          isActive
            ? 'bg-surface-inset text-fg'
            : isAncestor
              ? 'bg-surface-inset text-fg-muted'
              : 'text-fg-muted hover:bg-surface-hover hover:text-fg'
        }`}
      >
        <span className="flex-1 truncate">{project.name}</span>
        <ExpandToggle isExpanded={isExpanded} onToggle={onToggle} />
      </button>
      {isExpanded && project.tasks.length > 0 && (
        <ul className={`${indent ? 'ml-10' : 'ml-6'} mt-0.5 space-y-0.5`}>
          {project.tasks.map((task) => (
            <SidebarTaskItem
              key={task.id}
              task={task}
              isActive={activeTaskId === task.id}
              onClick={() => onTaskClick(task)}
            />
          ))}
        </ul>
      )}
    </li>
  );
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
  const [expandedInitiatives, setExpandedInitiatives] = useState<Set<string>>(new Set());
  const [expandedProjects, setExpandedProjects] = useState<Set<string>>(new Set());
  const [inboxExpanded, setInboxExpanded] = useState(false);

  useInitiativeSubscription(currentWorkspace?.id ?? '');
  useProjectSubscription(currentWorkspace?.id ?? '');
  useTaskSubscription(currentWorkspace?.id ?? '');

  const toggleInitiative = (id: string) =>
    setExpandedInitiatives((prev) => toggleSetItem(prev, id));

  const toggleProject = (id: string) => setExpandedProjects((prev) => toggleSetItem(prev, id));

  const initiatives = data?.workspace?.initiatives ?? [];
  const allProjects = data?.workspace?.projects ?? [];
  const standaloneProjects = allProjects.filter((p) => !p.initiativeId);
  const inboxTasks = data?.workspace?.tasks ?? [];
  const activeTaskId = current.view === 'task' ? current.id : undefined;
  const { count: myTaskCount } = useMyTasks();

  // Preserve last-known projects/inbox so active terminals don't disappear
  // while workspace data is being refetched after cache invalidation.
  // Only use fallback when refetching the same workspace (not on workspace switch).
  const prevProjectsRef = useRef(allProjects);
  const prevInboxTasksRef = useRef(inboxTasks);
  const prevSlugRef = useRef(currentWorkspace?.slug);
  const hasWorkspaceData = !!data?.workspace;
  const sameWorkspace = currentWorkspace?.slug === prevSlugRef.current;
  if (hasWorkspaceData) {
    prevProjectsRef.current = allProjects;
    prevInboxTasksRef.current = inboxTasks;
    prevSlugRef.current = currentWorkspace?.slug;
  }
  const useFallback = !hasWorkspaceData && sameWorkspace;
  const { entries: activeTerminals, refreshSessions } = useActiveTerminals(
    useFallback ? prevProjectsRef.current : allProjects,
    useFallback ? prevInboxTasksRef.current : inboxTasks,
  );
  const activeSessionIds = useSessionActivity();

  const handleCloseActiveTerminal = useCallback(
    async (entry: ActiveTerminalEntry) => {
      for (const sessionId of entry.sessionIds) {
        await window.orca.agent.stop(sessionId);
        await window.orca.db.deleteSession(sessionId);
      }
      refreshSessions();
    },
    [refreshSessions],
  );

  if (collapsed) {
    return (
      <aside
        className="w-12 bg-surface-raised border-r border-edge flex flex-col items-center"
        data-testid="sidebar-collapsed"
      >
        <div className="py-4 flex flex-col items-center gap-2">
          <button
            onClick={onToggleCollapse}
            className="text-fg-muted hover:text-fg transition-colors p-1"
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
      className="w-64 bg-surface-raised border-r border-edge flex flex-col"
      data-testid="sidebar"
    >
      <div className="p-4 border-b border-edge flex items-center justify-between">
        <button
          onClick={() => navigate({ view: 'initiatives' })}
          className="text-heading-sm font-semibold text-fg hover:text-fg transition-colors"
        >
          Orca
        </button>
        <div className="flex items-center gap-1">
          <NotificationBell />
          <button
            onClick={onToggleCollapse}
            className="text-fg-faint hover:text-fg-muted transition-colors p-1"
            aria-label="Collapse sidebar"
            data-testid="sidebar-collapse-btn"
          >
            <PanelLeft className={iconSize.sm} />
          </button>
        </div>
      </div>
      <WorkspaceSwitcher />
      <ActiveTerminals
        entries={activeTerminals}
        activeSessionIds={activeSessionIds}
        onClose={handleCloseActiveTerminal}
      />
      <nav className="flex-1 p-2 overflow-y-auto min-h-0">
        <div className="mb-2">
          <button
            onClick={() => navigate({ view: 'my-tasks' })}
            className={`w-full text-left px-3 py-1.5 text-body-sm rounded transition-colors flex items-center justify-between ${
              current.view === 'my-tasks'
                ? 'bg-surface-inset text-fg'
                : 'text-fg-muted hover:bg-surface-hover hover:text-fg'
            }`}
            data-testid="sidebar-my-tasks-btn"
          >
            <span className="flex items-center gap-1.5">
              <User className={iconSize.sm} />
              My Tasks
            </span>
            {myTaskCount > 0 && (
              <span className="text-label-xs text-fg-faint bg-surface-inset rounded-full px-1.5 py-0.5">
                {myTaskCount}
              </span>
            )}
          </button>
        </div>
        {inboxTasks.length > 0 && (
          <div className="mb-2">
            <button
              onClick={() => setInboxExpanded((v) => !v)}
              className="w-full text-left px-3 py-1.5 text-body-sm rounded transition-colors text-fg-muted hover:bg-surface-hover hover:text-fg flex items-center justify-between"
              data-testid="sidebar-inbox-btn"
            >
              <span className="flex items-center gap-1">
                <span className="text-label-sm">{inboxExpanded ? '\u25BC' : '\u25B6'}</span>
                Inbox
              </span>
              <span className="text-label-xs text-fg-faint bg-surface-inset rounded-full px-1.5 py-0.5">
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
                    onClick={() =>
                      navigate({
                        view: 'task',
                        id: task.id,
                        taskName: task.title,
                      })
                    }
                  />
                ))}
              </ul>
            )}
          </div>
        )}

        {/* Initiatives */}
        {initiatives.length > 0 && (
          <>
            <div className="px-2 py-2.5 flex items-center gap-2 text-fg-faint">
              <Target className={iconSize.sm} />
              <span className="text-label-sm font-medium">Initiatives</span>
            </div>
            {fetching && initiatives.length === 0 ? (
              <SidebarSkeleton />
            ) : (
              <ul className="space-y-0.5">
                {initiatives.map((initiative) => {
                  const isExpanded = expandedInitiatives.has(initiative.id);
                  const isActive = current.view === 'initiative' && current.id === initiative.id;

                  return (
                    <li key={initiative.id}>
                      <button
                        onClick={() => navigate({ view: 'initiative', id: initiative.id })}
                        className={`w-full flex items-center px-2 py-1.5 text-body-sm rounded transition-colors text-left ${
                          isActive
                            ? 'bg-surface-inset text-fg'
                            : 'text-fg-muted hover:bg-surface-hover hover:text-fg'
                        }`}
                      >
                        <span className="flex-1 truncate">{initiative.name}</span>
                        <ExpandToggle
                          isExpanded={isExpanded}
                          onToggle={() => toggleInitiative(initiative.id)}
                        />
                      </button>
                      {isExpanded && initiative.projects.length > 0 && (
                        <ul className="mt-0.5 space-y-0.5">
                          {initiative.projects.map((project) => (
                            <SidebarProjectItem
                              key={project.id}
                              project={project}
                              isExpanded={expandedProjects.has(project.id)}
                              isActive={current.view === 'project' && current.id === project.id}
                              isAncestor={
                                current.view === 'task' && current.projectId === project.id
                              }
                              onToggle={() => toggleProject(project.id)}
                              onNavigate={() =>
                                navigate({
                                  view: 'project',
                                  id: project.id,
                                  projectName: project.name,
                                })
                              }
                              onTaskClick={(task) =>
                                navigate({
                                  view: 'task',
                                  id: task.id,
                                  projectId: project.id,
                                  projectName: project.name,
                                  taskName: task.title,
                                })
                              }
                              activeTaskId={activeTaskId}
                              indent
                            />
                          ))}
                        </ul>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </>
        )}

        {/* Standalone Projects */}
        <button
          onClick={() => navigate({ view: 'initiatives' })}
          className="w-full px-2 py-2.5 flex items-center gap-2 text-fg-faint hover:text-fg-muted transition-colors"
        >
          <Box className={iconSize.sm} />
          <span className="text-label-sm font-medium">Projects</span>
        </button>
        {fetching && standaloneProjects.length === 0 ? (
          <SidebarSkeleton />
        ) : standaloneProjects.length === 0 ? (
          <div className="px-3 py-2 text-body-sm text-fg-faint">No standalone projects</div>
        ) : (
          <ul className="space-y-0.5">
            {standaloneProjects.map((project) => (
              <SidebarProjectItem
                key={project.id}
                project={project}
                isExpanded={expandedProjects.has(project.id)}
                isActive={current.view === 'project' && current.id === project.id}
                isAncestor={current.view === 'task' && current.projectId === project.id}
                onToggle={() => toggleProject(project.id)}
                onNavigate={() =>
                  navigate({
                    view: 'project',
                    id: project.id,
                    projectName: project.name,
                  })
                }
                onTaskClick={(task) =>
                  navigate({
                    view: 'task',
                    id: task.id,
                    projectId: project.id,
                    projectName: project.name,
                    taskName: task.title,
                  })
                }
                currentView={current.view}
                currentId={current.id}
              />
            ))}
          </ul>
        )}
      </nav>
      <div className="border-t border-edge">
        <div className="p-2">
          <button
            onClick={() => navigate({ view: 'settings' })}
            className={`w-full text-left px-3 py-1.5 text-body-sm rounded transition-colors ${
              current.view === 'settings' || current.view === 'members'
                ? 'bg-surface-inset text-fg'
                : 'text-fg-muted hover:bg-surface-hover hover:text-fg'
            }`}
          >
            <Settings className={`${iconSize.sm} inline-block mr-2`} />
            Settings
          </button>
        </div>
        <div className="p-2 pt-0">
          <button
            onClick={onLogout}
            className="w-full text-left px-3 py-1.5 text-label-sm text-fg-faint hover:text-fg-muted hover:bg-surface-hover rounded transition-colors"
          >
            <LogOut className={`${iconSize.sm} inline-block mr-2`} />
            Sign out
          </button>
        </div>
        <div className="px-3 py-2 border-t border-edge text-label-xs text-fg-faint">
          v{__APP_VERSION__} ({__GIT_HASH__})
        </div>
      </div>
    </aside>
  );
}
