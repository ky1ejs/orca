import { useMemo } from 'react';
import { useMe, useWorkspaceBySlug } from './useGraphQL.js';
import { useWorkspace } from '../workspace/context.js';
import type { TaskStatus, TaskPriority } from '../graphql/__generated__/generated.js';

export interface MyTask {
  id: string;
  displayId: string;
  title: string;
  status: TaskStatus;
  priority: TaskPriority;
  assignee?: { id: string; name: string } | null;
  labels: { id: string; name: string; color: string }[];
  pullRequestCount?: number;
  projectId?: string;
  projectName?: string;
}

export function useMyTasks() {
  const { data: meData } = useMe();
  const { currentWorkspace } = useWorkspace();
  const { data, fetching } = useWorkspaceBySlug(currentWorkspace?.slug ?? '');

  const currentUserId = meData?.me?.id;

  const tasks = useMemo((): MyTask[] => {
    if (!currentUserId || !data?.workspace) return [];

    const result: MyTask[] = [];

    // Collect from all projects (workspace.projects includes both initiative and standalone)
    for (const project of data.workspace.projects) {
      if (project.archivedAt) continue;
      for (const task of project.tasks) {
        if (task.assignee?.id === currentUserId) {
          result.push({
            id: task.id,
            displayId: task.displayId,
            title: task.title,
            status: task.status,
            priority: task.priority,
            assignee: task.assignee,
            labels: task.labels,
            pullRequestCount: task.pullRequestCount,
            projectId: project.id,
            projectName: project.name,
          });
        }
      }
    }

    // Collect from inbox (unassociated tasks)
    for (const task of data.workspace.tasks) {
      if (task.assignee?.id === currentUserId) {
        result.push({
          id: task.id,
          displayId: task.displayId,
          title: task.title,
          status: task.status,
          priority: task.priority,
          assignee: task.assignee,
          labels: task.labels,
          pullRequestCount: task.pullRequestCount,
        });
      }
    }

    return result;
  }, [currentUserId, data]);

  return { tasks, count: tasks.length, loading: fetching };
}
