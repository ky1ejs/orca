import { useQuery, useMutation, useSubscription } from 'urql';
import { useCallback } from 'react';
import {
  WorkspacesDocument,
  WorkspaceDocument,
  ProjectDocument,
  TaskDocument,
  CreateWorkspaceDocument,
  UpdateWorkspaceDocument,
  DeleteWorkspaceDocument,
  CreateProjectDocument,
  UpdateProjectDocument,
  DeleteProjectDocument,
  CreateTaskDocument,
  UpdateTaskDocument,
  DeleteTaskDocument,
  ProjectChangedDocument,
  TaskChangedDocument,
} from '../graphql/__generated__/generated.js';
import type {
  CreateWorkspaceInput,
  UpdateWorkspaceInput,
  CreateProjectInput,
  UpdateProjectInput,
  CreateTaskInput,
  UpdateTaskInput,
} from '../graphql/__generated__/generated.js';

// Query hooks

export function useWorkspaces() {
  const [result, reexecute] = useQuery({ query: WorkspacesDocument });
  return { ...result, refetch: reexecute };
}

export function useWorkspaceBySlug(slug: string) {
  const [result, reexecute] = useQuery({
    query: WorkspaceDocument,
    variables: { slug },
    pause: !slug,
  });
  return { ...result, refetch: reexecute };
}

export function useProject(id: string) {
  const [result, reexecute] = useQuery({
    query: ProjectDocument,
    variables: { id },
    pause: !id,
  });
  return { ...result, refetch: reexecute };
}

export function useTask(id: string) {
  const [result, reexecute] = useQuery({
    query: TaskDocument,
    variables: { id },
    pause: !id,
  });
  return { ...result, refetch: reexecute };
}

// Mutation hooks

export function useCreateWorkspace() {
  const [result, executeMutation] = useMutation(CreateWorkspaceDocument);
  const createWorkspace = useCallback(
    (input: CreateWorkspaceInput) => executeMutation({ input }),
    [executeMutation],
  );
  return { ...result, createWorkspace };
}

export function useUpdateWorkspace() {
  const [result, executeMutation] = useMutation(UpdateWorkspaceDocument);
  const updateWorkspace = useCallback(
    (id: string, input: UpdateWorkspaceInput) => executeMutation({ id, input }),
    [executeMutation],
  );
  return { ...result, updateWorkspace };
}

export function useDeleteWorkspace() {
  const [result, executeMutation] = useMutation(DeleteWorkspaceDocument);
  const deleteWorkspace = useCallback((id: string) => executeMutation({ id }), [executeMutation]);
  return { ...result, deleteWorkspace };
}

export function useCreateProject() {
  const [result, executeMutation] = useMutation(CreateProjectDocument);
  const createProject = useCallback(
    (input: CreateProjectInput) => executeMutation({ input }),
    [executeMutation],
  );
  return { ...result, createProject };
}

export function useUpdateProject() {
  const [result, executeMutation] = useMutation(UpdateProjectDocument);
  const updateProject = useCallback(
    (id: string, input: UpdateProjectInput) => executeMutation({ id, input }),
    [executeMutation],
  );
  return { ...result, updateProject };
}

export function useDeleteProject() {
  const [result, executeMutation] = useMutation(DeleteProjectDocument);
  const deleteProject = useCallback((id: string) => executeMutation({ id }), [executeMutation]);
  return { ...result, deleteProject };
}

export function useCreateTask() {
  const [result, executeMutation] = useMutation(CreateTaskDocument);
  const createTask = useCallback(
    (input: CreateTaskInput) => executeMutation({ input }),
    [executeMutation],
  );
  return { ...result, createTask };
}

export function useUpdateTask() {
  const [result, executeMutation] = useMutation(UpdateTaskDocument);
  const updateTask = useCallback(
    (id: string, input: UpdateTaskInput) => executeMutation({ id, input }),
    [executeMutation],
  );
  return { ...result, updateTask };
}

export function useDeleteTask() {
  const [result, executeMutation] = useMutation(DeleteTaskDocument);
  const deleteTask = useCallback((id: string) => executeMutation({ id }), [executeMutation]);
  return { ...result, deleteTask };
}

// Subscription hooks — Graphcache handles cache updates automatically

export function useProjectSubscription(workspaceId: string) {
  useSubscription({
    query: ProjectChangedDocument,
    variables: { workspaceId },
    pause: !workspaceId,
  });
}

export function useTaskSubscription(workspaceId: string) {
  useSubscription({
    query: TaskChangedDocument,
    variables: { workspaceId },
    pause: !workspaceId,
  });
}
