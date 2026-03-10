import { useQuery, useMutation, useSubscription } from 'urql';
import { useCallback, useEffect } from 'react';
import {
  MeDocument,
  WorkspaceDocument,
  InitiativeDocument,
  ProjectDocument,
  TaskDocument,
  WorkspaceMembersDocument,
  PendingInvitationsDocument,
  LabelsDocument,
  CreateWorkspaceDocument,
  UpdateWorkspaceDocument,
  DeleteWorkspaceDocument,
  CreateInitiativeDocument,
  UpdateInitiativeDocument,
  ArchiveInitiativeDocument,
  CreateProjectDocument,
  UpdateProjectDocument,
  ArchiveProjectDocument,
  CreateTaskDocument,
  UpdateTaskDocument,
  ArchiveTaskDocument,
  AddMemberDocument,
  RemoveMemberDocument,
  UpdateMemberRoleDocument,
  CancelInvitationDocument,
  AcceptInvitationDocument,
  DeclineInvitationDocument,
  CreateLabelDocument,
  UpdateLabelDocument,
  DeleteLabelDocument,
  WorkspaceIntegrationsDocument,
  GitHubAppInstallUrlDocument,
  CompleteGitHubInstallationDocument,
  RemoveGitHubInstallationDocument,
  UpdateObservedRepositoriesDocument,
  UpdateWorkspaceSettingsDocument,
  InitiativeChangedDocument,
  ProjectChangedDocument,
  TaskChangedDocument,
} from '../graphql/__generated__/generated.js';
import type {
  UpdateWorkspaceSettingsInput,
  CreateWorkspaceInput,
  UpdateWorkspaceInput,
  CreateInitiativeInput,
  UpdateInitiativeInput,
  CreateProjectInput,
  UpdateProjectInput,
  CreateTaskInput,
  UpdateTaskInput,
  CreateLabelInput,
  UpdateLabelInput,
  AddMemberInput,
  UpdateMemberRoleInput,
} from '../graphql/__generated__/generated.js';

// Query hooks

export function useMe() {
  const [result, reexecute] = useQuery({ query: MeDocument });
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

export function useInitiative(id: string) {
  const [result, reexecute] = useQuery({
    query: InitiativeDocument,
    variables: { id },
    pause: !id,
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
  useEffect(() => {
    const interval = setInterval(() => {
      reexecute({ requestPolicy: 'network-only' });
    }, 60_000);
    return () => clearInterval(interval);
  }, [reexecute]);
  return { ...result, refetch: reexecute };
}

export function useLabels(workspaceId: string) {
  const [result, reexecute] = useQuery({
    query: LabelsDocument,
    variables: { workspaceId },
    pause: !workspaceId,
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

export function useCreateInitiative() {
  const [result, executeMutation] = useMutation(CreateInitiativeDocument);
  const createInitiative = useCallback(
    (input: CreateInitiativeInput) => executeMutation({ input }),
    [executeMutation],
  );
  return { ...result, createInitiative };
}

export function useUpdateInitiative() {
  const [result, executeMutation] = useMutation(UpdateInitiativeDocument);
  const updateInitiative = useCallback(
    (id: string, input: UpdateInitiativeInput) => executeMutation({ id, input }),
    [executeMutation],
  );
  return { ...result, updateInitiative };
}

export function useArchiveInitiative() {
  const [result, executeMutation] = useMutation(ArchiveInitiativeDocument);
  const archiveInitiative = useCallback((id: string) => executeMutation({ id }), [executeMutation]);
  return { ...result, archiveInitiative };
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

export function useArchiveProject() {
  const [result, executeMutation] = useMutation(ArchiveProjectDocument);
  const archiveProject = useCallback((id: string) => executeMutation({ id }), [executeMutation]);
  return { ...result, archiveProject };
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

export function useArchiveTask() {
  const [result, executeMutation] = useMutation(ArchiveTaskDocument);
  const archiveTask = useCallback((id: string) => executeMutation({ id }), [executeMutation]);
  return { ...result, archiveTask };
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

export function useCreateLabel() {
  const [result, executeMutation] = useMutation(CreateLabelDocument);
  const createLabel = useCallback(
    (input: CreateLabelInput) => executeMutation({ input }),
    [executeMutation],
  );
  return { ...result, createLabel };
}

export function useUpdateLabel() {
  const [result, executeMutation] = useMutation(UpdateLabelDocument);
  const updateLabel = useCallback(
    (id: string, input: UpdateLabelInput) => executeMutation({ id, input }),
    [executeMutation],
  );
  return { ...result, updateLabel };
}

export function useDeleteLabel() {
  const [result, executeMutation] = useMutation(DeleteLabelDocument);
  const deleteLabel = useCallback((id: string) => executeMutation({ id }), [executeMutation]);
  return { ...result, deleteLabel };
}

// Integrations hooks

export function useWorkspaceIntegrations(slug: string) {
  const [result, reexecute] = useQuery({
    query: WorkspaceIntegrationsDocument,
    variables: { slug },
    pause: !slug,
  });
  return { ...result, refetch: reexecute };
}

export function useGitHubAppInstallUrl(workspaceId: string) {
  const [result, reexecute] = useQuery({
    query: GitHubAppInstallUrlDocument,
    variables: { workspaceId },
    pause: !workspaceId,
  });
  return { ...result, refetch: reexecute };
}

export function useCompleteGitHubInstallation() {
  const [result, executeMutation] = useMutation(CompleteGitHubInstallationDocument);
  const completeGitHubInstallation = useCallback(
    (workspaceId: string, installationId: number) =>
      executeMutation({ workspaceId, installationId }),
    [executeMutation],
  );
  return { ...result, completeGitHubInstallation };
}

export function useRemoveGitHubInstallation() {
  const [result, executeMutation] = useMutation(RemoveGitHubInstallationDocument);
  const removeGitHubInstallation = useCallback(
    (workspaceId: string) => executeMutation({ workspaceId }),
    [executeMutation],
  );
  return { ...result, removeGitHubInstallation };
}

export function useUpdateObservedRepositories() {
  const [result, executeMutation] = useMutation(UpdateObservedRepositoriesDocument);
  const updateObservedRepositories = useCallback(
    (workspaceId: string, repositories: string[]) => executeMutation({ workspaceId, repositories }),
    [executeMutation],
  );
  return { ...result, updateObservedRepositories };
}

export function useUpdateWorkspaceSettings() {
  const [result, executeMutation] = useMutation(UpdateWorkspaceSettingsDocument);
  const updateWorkspaceSettings = useCallback(
    (workspaceId: string, input: UpdateWorkspaceSettingsInput) =>
      executeMutation({ workspaceId, input }),
    [executeMutation],
  );
  return { ...result, updateWorkspaceSettings };
}

// Subscription hooks — Graphcache handles cache updates automatically

export function useInitiativeSubscription(workspaceId: string) {
  useSubscription({
    query: InitiativeChangedDocument,
    variables: { workspaceId },
    pause: !workspaceId,
  });
}

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
