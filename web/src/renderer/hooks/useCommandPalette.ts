import { useMemo } from 'react';
import { useWorkspaceBySlug } from './useGraphQL.js';
import { useWorkspace } from '../workspace/context.js';
import { fuzzyMatch, type SearchableItem } from '../utils/fuzzyMatch.js';
import type { TaskStatus } from '../graphql/__generated__/generated.js';

export interface TaskItem extends SearchableItem {
  type: 'task';
  displayId: string;
  status: TaskStatus;
  projectId?: string;
  projectName?: string;
}

export interface ProjectItem extends SearchableItem {
  type: 'project';
}

export interface InitiativeItem extends SearchableItem {
  type: 'initiative';
}

export type ActionId =
  | 'create-task'
  | 'create-project'
  | 'my-tasks'
  | 'settings'
  | 'members'
  | 'keyboard-shortcuts';

export interface ActionItem extends SearchableItem {
  type: 'action';
  actionId: ActionId;
  shortcut?: string;
}

export type PaletteItem = TaskItem | ProjectItem | InitiativeItem | ActionItem;

interface PaletteResults {
  actions: ActionItem[];
  tasks: TaskItem[];
  projects: ProjectItem[];
  initiatives: InitiativeItem[];
}

const staticActions: ActionItem[] = [
  {
    id: 'action:create-task',
    type: 'action',
    actionId: 'create-task',
    label: 'Create Task',
    searchFields: ['Create Task', 'new task'],
    shortcut: 'C',
  },
  {
    id: 'action:create-project',
    type: 'action',
    actionId: 'create-project',
    label: 'Create Project',
    searchFields: ['Create Project', 'new project'],
  },
  {
    id: 'action:my-tasks',
    type: 'action',
    actionId: 'my-tasks',
    label: 'Go to My Tasks',
    searchFields: ['Go to My Tasks', 'assigned', 'my tasks'],
  },
  {
    id: 'action:settings',
    type: 'action',
    actionId: 'settings',
    label: 'Go to Settings',
    searchFields: ['Go to Settings', 'preferences'],
  },
  {
    id: 'action:members',
    type: 'action',
    actionId: 'members',
    label: 'Go to Members',
    searchFields: ['Go to Members', 'team', 'people'],
  },
  {
    id: 'action:keyboard-shortcuts',
    type: 'action',
    actionId: 'keyboard-shortcuts',
    label: 'Keyboard Shortcuts',
    searchFields: ['Keyboard Shortcuts', 'hotkeys', 'keybindings'],
    shortcut: '?',
  },
];

export function useCommandPalette(query: string): PaletteResults {
  const { currentWorkspace } = useWorkspace();
  const { data } = useWorkspaceBySlug(currentWorkspace?.slug ?? '');

  const allItems = useMemo((): PaletteItem[] => {
    const workspace = data?.workspace;
    if (!workspace) return [...staticActions];

    const items: PaletteItem[] = [...staticActions];

    // Projects and their tasks
    for (const project of workspace.projects) {
      if (project.archivedAt) continue;
      items.push({
        id: project.id,
        type: 'project',
        label: project.name,
        searchFields: [project.name],
      });

      for (const task of project.tasks) {
        items.push({
          id: task.id,
          type: 'task',
          label: task.title,
          displayId: task.displayId,
          status: task.status,
          projectId: project.id,
          projectName: project.name,
          searchFields: [task.displayId, task.title, project.name],
        });
      }
    }

    // Inbox tasks (workspace.tasks — unassociated)
    for (const task of workspace.tasks) {
      items.push({
        id: task.id,
        type: 'task',
        label: task.title,
        displayId: task.displayId,
        status: task.status,
        searchFields: [task.displayId, task.title, 'Inbox'],
      });
    }

    // Initiatives
    for (const initiative of workspace.initiatives) {
      if (initiative.archivedAt) continue;
      items.push({
        id: initiative.id,
        type: 'initiative',
        label: initiative.name,
        searchFields: [initiative.name],
      });
    }

    return items;
  }, [data]);

  return useMemo(() => {
    const scored = fuzzyMatch(allItems, query);

    const results: PaletteResults = {
      actions: [],
      tasks: [],
      projects: [],
      initiatives: [],
    };

    for (const { item } of scored) {
      switch (item.type) {
        case 'action':
          results.actions.push(item);
          break;
        case 'task':
          results.tasks.push(item);
          break;
        case 'project':
          results.projects.push(item);
          break;
        case 'initiative':
          results.initiatives.push(item);
          break;
      }
    }

    return results;
  }, [allItems, query]);
}
