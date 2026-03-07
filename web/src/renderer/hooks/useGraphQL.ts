import { useQuery, useMutation, useSubscription } from 'urql';
import { useCallback } from 'react';
import {
  ProjectsDocument,
  ProjectDocument,
  TasksDocument,
  TaskDocument,
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
  CreateProjectInput,
  UpdateProjectInput,
  CreateTaskInput,
  UpdateTaskInput,
} from '../graphql/__generated__/generated.js';

// Query hooks

export function useProjects() {
  const [result, reexecute] = useQuery({ query: ProjectsDocument });
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

export function useTasks(projectId: string) {
  const [result, reexecute] = useQuery({
    query: TasksDocument,
    variables: { projectId },
    pause: !projectId,
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

// Subscription hooks that trigger refetches

export function useProjectSubscription(onData?: () => void) {
  useSubscription({ query: ProjectChangedDocument }, (_prev, data) => {
    onData?.();
    return data;
  });
}

export function useTaskSubscription(onData?: () => void) {
  useSubscription({ query: TaskChangedDocument }, (_prev, data) => {
    onData?.();
    return data;
  });
}
