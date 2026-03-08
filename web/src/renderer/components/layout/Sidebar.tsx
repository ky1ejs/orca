import { useState } from 'react';
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

  if (collapsed) {
    return (
      <aside
        className="w-12 bg-gray-900 border-r border-gray-800 flex flex-col items-center"
        data-testid="sidebar-collapsed"
      >
        <div className="py-4 flex flex-col items-center gap-2">
          <button
            onClick={onToggleCollapse}
            className="text-gray-400 hover:text-white transition-colors p-1"
            aria-label="Expand sidebar"
            data-testid="sidebar-expand-btn"
          >
            <svg
              className="h-5 w-5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M13 5l7 7-7 7M5 5l7 7-7 7" />
            </svg>
          </button>
          <NotificationBell collapsed />
        </div>
      </aside>
    );
  }

  return (
    <aside
      className="w-64 bg-gray-900 border-r border-gray-800 flex flex-col"
      data-testid="sidebar"
    >
      <div className="p-4 border-b border-gray-800 flex items-center justify-between">
        <button
          onClick={() => navigate({ view: 'projects' })}
          className="text-lg font-semibold text-white hover:text-blue-400 transition-colors"
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
            <svg
              className="h-4 w-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M11 19l-7-7 7-7m8 14l-7-7 7-7"
              />
            </svg>
          </button>
        </div>
      </div>
      <WorkspaceSwitcher />
      <nav className="flex-1 p-2 overflow-y-auto min-h-0">
        {fetching && projects.length === 0 ? (
          <SidebarSkeleton />
        ) : projects.length === 0 ? (
          <div className="px-3 py-2 text-sm text-gray-500">No projects yet</div>
        ) : (
          <ul className="space-y-0.5">
            {projects.map((project) => {
              const isExpanded = expandedProjects.has(project.id);
              const isActive = current.view === 'project' && current.id === project.id;

              return (
                <li key={project.id}>
                  <div className="flex items-center">
                    <button
                      onClick={() => toggleExpand(project.id)}
                      className="p-1 text-gray-500 hover:text-gray-300 transition-colors"
                      aria-label={isExpanded ? 'Collapse' : 'Expand'}
                    >
                      <span className="text-xs">{isExpanded ? '\u25BC' : '\u25B6'}</span>
                    </button>
                    <button
                      onClick={() => navigate({ view: 'project', id: project.id })}
                      className={`flex-1 text-left px-2 py-1.5 text-sm rounded transition-colors ${
                        isActive
                          ? 'bg-gray-800 text-white'
                          : 'text-gray-300 hover:bg-gray-800 hover:text-white'
                      }`}
                    >
                      {project.name}
                    </button>
                  </div>

                  {isExpanded && project.tasks.length > 0 && (
                    <ul className="ml-6 mt-0.5 space-y-0.5">
                      {project.tasks.map((task) => {
                        const isTaskActive = current.view === 'task' && current.id === task.id;
                        return (
                          <li key={task.id}>
                            <button
                              onClick={() => navigate({ view: 'task', id: task.id })}
                              className={`w-full text-left px-2 py-1 text-xs rounded flex items-center justify-between gap-1 transition-colors ${
                                isTaskActive
                                  ? 'bg-gray-800 text-white'
                                  : 'text-gray-400 hover:bg-gray-800 hover:text-white'
                              }`}
                            >
                              <StatusIcon status={task.status} className="w-3 h-3 flex-shrink-0" />
                              <span className="truncate">{task.title}</span>
                            </button>
                          </li>
                        );
                      })}
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
            className={`w-full text-left px-3 py-1.5 text-sm rounded transition-colors ${
              current.view === 'settings' || current.view === 'members'
                ? 'bg-gray-800 text-white'
                : 'text-gray-400 hover:bg-gray-800 hover:text-white'
            }`}
          >
            Settings
          </button>
        </div>
        <div className="p-2 pt-0">
          <button
            onClick={onLogout}
            className="w-full text-left px-3 py-1.5 text-xs text-gray-500 hover:text-gray-300 hover:bg-gray-800 rounded transition-colors"
          >
            Sign out
          </button>
        </div>
        <div className="px-3 py-2 border-t border-gray-800 text-[10px] text-gray-600">
          v{__APP_VERSION__} ({__GIT_HASH__})
        </div>
      </div>
    </aside>
  );
}
