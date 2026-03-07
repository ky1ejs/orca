import { useState } from 'react';
import {
  useProjects,
  useProjectSubscription,
  useTaskSubscription,
} from '../../hooks/useGraphQL.js';
import { useNavigation } from '../../navigation/context.js';
import { TaskStatusBadge } from '../tasks/TaskStatusBadge.js';

export function Sidebar() {
  const { data, refetch } = useProjects();
  const { navigate, current } = useNavigation();
  const [expandedProjects, setExpandedProjects] = useState<Set<string>>(new Set());

  useProjectSubscription(() => {
    refetch({ requestPolicy: 'network-only' });
  });

  useTaskSubscription(() => {
    refetch({ requestPolicy: 'network-only' });
  });

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

  const projects = data?.projects ?? [];

  return (
    <aside className="w-64 bg-gray-900 border-r border-gray-800 flex flex-col">
      <div className="p-4 border-b border-gray-800">
        <button
          onClick={() => navigate({ view: 'projects' })}
          className="text-lg font-semibold text-white hover:text-blue-400 transition-colors"
        >
          Orca
        </button>
      </div>
      <nav className="flex-1 p-2 overflow-y-auto">
        {projects.length === 0 ? (
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
                              <span className="truncate">{task.title}</span>
                              <TaskStatusBadge status={task.status} />
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
    </aside>
  );
}
