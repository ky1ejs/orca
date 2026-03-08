import { useQuery, useMutation, useSubscription } from 'urql';
import { useCallback } from 'react';
import {
  MeDocument,
  WorkspacesDocument,
  WorkspaceDocument,
  ProjectDocument,
  TaskDocument,
  WorkspaceMembersDocument,
  PendingInvitationsDocument,
  CreateWorkspaceDocument,
  UpdateWorkspaceDocument,
  DeleteWorkspaceDocument,
  CreateProjectDocument,
  UpdateProjectDocument,
  DeleteProjectDocument,
  CreateTaskDocument,
  UpdateTaskDocument,
  DeleteTaskDocument,
  AddMemberDocument,
  RemoveMemberDocument,
  UpdateMemberRoleDocument,
  CancelInvitationDocument,
  AcceptInvitationDocument,
  DeclineInvitationDocument,
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
  AddMemberInput,
  UpdateMemberRoleInput,
  WorkspaceRole,
} from '../graphql/__generated__/generated.js';

// Query hooks

export function useMe() {
  const [result, reexecute] = useQuery({ query: MeDocument });
  return { ...result, refetch: reexecute };
}

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

export function useWorkspaceMembers(slug: string) {
  const [result, reexecute] = useQuery({
    query: WorkspaceMembersDocument,
    variables: { slug },
    pause: !slug,
  });
  return { ...result, refetch: reexecute };
}

export function usePendingInvitations() {
  const [result, reexecute] = useQuery({ query: PendingInvitationsDocument });
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

export function useAddMember() {
  const [result, executeMutation] = useMutation(AddMemberDocument);
  const addMember = useCallback(
    (input: AddMemberInput) => executeMutation({ input }),
    [executeMutation],
  );
  return { ...result, addMember };
}

export function useRemoveMember() {
  const [result, executeMutation] = useMutation(RemoveMemberDocument);
  const removeMember = useCallback(
    (workspaceId: string, userId: string) => executeMutation({ workspaceId, userId }),
    [executeMutation],
  );
  return { ...result, removeMember };
}

export function useUpdateMemberRole() {
  const [result, executeMutation] = useMutation(UpdateMemberRoleDocument);
  const updateMemberRole = useCallback(
    (input: UpdateMemberRoleInput) => executeMutation({ input }),
    [executeMutation],
  );
  return { ...result, updateMemberRole };
}

export function useCancelInvitation() {
  const [result, executeMutation] = useMutation(CancelInvitationDocument);
  const cancelInvitation = useCallback((id: string) => executeMutation({ id }), [executeMutation]);
  return { ...result, cancelInvitation };
}

export function useAcceptInvitation() {
  const [result, executeMutation] = useMutation(AcceptInvitationDocument);
  const acceptInvitation = useCallback((id: string) => executeMutation({ id }), [executeMutation]);
  return { ...result, acceptInvitation };
}

export function useDeclineInvitation() {
  const [result, executeMutation] = useMutation(DeclineInvitationDocument);
  const declineInvitation = useCallback((id: string) => executeMutation({ id }), [executeMutation]);
  return { ...result, declineInvitation };
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

// Re-export types for convenience
export type { WorkspaceRole };
