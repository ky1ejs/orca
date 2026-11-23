import { GraphQLError } from 'graphql';
import { pipe, filter } from 'graphql-yoga';
import type {
  ApiKey,
  PrismaClient,
  Workspace,
  Initiative,
  Project,
  Task,
  WorkspaceRole,
} from '@prisma/client';

/**
 * Verifies that the given workspace exists, is not soft-deleted,
 * and the requesting user is a member.
 *
 * Returns the workspace and the user's role.
 * Throws NOT_FOUND for missing, deleted, or unauthorized workspaces.
 */
export async function requireWorkspaceAccess(
  prisma: PrismaClient,
  workspaceId: string,
  userId: string,
): Promise<{ workspace: Workspace; role: WorkspaceRole }> {
  const workspace = await prisma.workspace.findUnique({
    where: { id: workspaceId },
  });

  if (!workspace || workspace.deletedAt) {
    throw new GraphQLError('Workspace not found', {
      extensions: { code: 'NOT_FOUND' },
    });
  }

  const membership = await prisma.workspaceMembership.findUnique({
    where: { workspaceId_userId: { workspaceId, userId } },
  });

  if (!membership) {
    throw new GraphQLError('Workspace not found', {
      extensions: { code: 'NOT_FOUND' },
    });
  }

  return { workspace, role: membership.role };
}

/**
 * Same as requireWorkspaceAccess but looks up workspace by slug.
 */
export async function requireWorkspaceAccessBySlug(
  prisma: PrismaClient,
  slug: string,
  userId: string,
): Promise<{ workspace: Workspace; role: WorkspaceRole }> {
  const workspace = await prisma.workspace.findUnique({
    where: { slug },
  });

  if (!workspace || workspace.deletedAt) {
    throw new GraphQLError('Workspace not found', {
      extensions: { code: 'NOT_FOUND' },
    });
  }

  const membership = await prisma.workspaceMembership.findUnique({
    where: { workspaceId_userId: { workspaceId: workspace.id, userId } },
  });

  if (!membership) {
    throw new GraphQLError('Workspace not found', {
      extensions: { code: 'NOT_FOUND' },
    });
  }

  return { workspace, role: membership.role };
}

/**
 * Same as requireWorkspaceAccess but additionally requires the OWNER role.
 */
export async function requireWorkspaceOwner(
  prisma: PrismaClient,
  workspaceId: string,
  userId: string,
): Promise<{ workspace: Workspace; role: WorkspaceRole }> {
  const result = await requireWorkspaceAccess(prisma, workspaceId, userId);

  if (result.role !== 'OWNER') {
    throw new GraphQLError('Workspace not found', {
      extensions: { code: 'NOT_FOUND' },
    });
  }

  return result;
}

/**
 * Checks membership for an initiative's workspace.
 */
export async function requireInitiativeAccess(
  prisma: PrismaClient,
  initiativeId: string,
  userId: string,
): Promise<{ initiative: Initiative & { workspace: Workspace }; role: WorkspaceRole }> {
  const initiative = await prisma.initiative.findUnique({
    where: { id: initiativeId },
    include: { workspace: true },
  });

  if (!initiative || !initiative.workspace || initiative.workspace.deletedAt) {
    throw new GraphQLError('Initiative not found', {
      extensions: { code: 'NOT_FOUND' },
    });
  }

  const membership = await prisma.workspaceMembership.findUnique({
    where: {
      workspaceId_userId: { workspaceId: initiative.workspaceId, userId },
    },
  });

  if (!membership) {
    throw new GraphQLError('Initiative not found', {
      extensions: { code: 'NOT_FOUND' },
    });
  }

  return { initiative, role: membership.role };
}

/**
 * Checks membership for a project's workspace.
 */
export async function requireProjectAccess(
  prisma: PrismaClient,
  projectId: string,
  userId: string,
): Promise<{ project: Project & { workspace: Workspace }; role: WorkspaceRole }> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: { workspace: true },
  });

  if (!project || !project.workspace || project.workspace.deletedAt) {
    throw new GraphQLError('Project not found', {
      extensions: { code: 'NOT_FOUND' },
    });
  }

  const membership = await prisma.workspaceMembership.findUnique({
    where: {
      workspaceId_userId: { workspaceId: project.workspaceId, userId },
    },
  });

  if (!membership) {
    throw new GraphQLError('Project not found', {
      extensions: { code: 'NOT_FOUND' },
    });
  }

  return { project, role: membership.role };
}

/**
 * Checks membership for a task's workspace.
 * Uses the denormalized workspaceId on Task.
 */
export async function requireTaskAccess(
  prisma: PrismaClient,
  taskId: string,
  userId: string,
): Promise<{ task: Task; role: WorkspaceRole }> {
  const task = await prisma.task.findUnique({
    where: { id: taskId },
  });

  if (!task) {
    throw new GraphQLError('Task not found', {
      extensions: { code: 'NOT_FOUND' },
    });
  }

  const membership = await prisma.workspaceMembership.findUnique({
    where: {
      workspaceId_userId: { workspaceId: task.workspaceId, userId },
    },
  });

  if (!membership) {
    throw new GraphQLError('Task not found', {
      extensions: { code: 'NOT_FOUND' },
    });
  }

  // Verify workspace isn't soft-deleted
  const workspace = await prisma.workspace.findUnique({
    where: { id: task.workspaceId },
    select: { deletedAt: true },
  });

  if (!workspace || workspace.deletedAt) {
    throw new GraphQLError('Task not found', {
      extensions: { code: 'NOT_FOUND' },
    });
  }

  return { task, role: membership.role };
}

/**
 * Wraps a pubsub subscription iterator with workspace-scoped filtering.
 * Silently drops events that don't match the workspace or where the user
 * has lost membership, avoiding the non-nullable GraphQL error that occurs
 * when a resolve function returns undefined for a non-null return type.
 */
export function workspaceScopedSubscription<T extends { workspaceId: string }>(
  subscription: AsyncIterable<T>,
  prisma: PrismaClient,
  workspaceId: string,
  userId: string,
) {
  return pipe(
    subscription,
    filter(async (payload: T) => {
      if (payload.workspaceId !== workspaceId) return false;
      const membership = await prisma.workspaceMembership.findUnique({
        where: { workspaceId_userId: { workspaceId, userId } },
      });
      return !!membership;
    }),
  );
}

/**
 * Checks that the user owns the workspace an API key belongs to.
 * Missing keys, keys in deleted workspaces and keys the user can't manage
 * all give the same NOT_FOUND, so the response never shows whether a key
 * id exists.
 */
export async function requireApiKeyOwner(
  prisma: PrismaClient,
  apiKeyId: string,
  userId: string,
): Promise<{ apiKey: ApiKey }> {
  const notFound = new GraphQLError('API key not found', {
    extensions: { code: 'NOT_FOUND' },
  });

  const apiKey = await prisma.apiKey.findUnique({
    where: { id: apiKeyId },
    include: { workspace: { select: { deletedAt: true } } },
  });
  if (!apiKey || apiKey.workspace.deletedAt) throw notFound;

  const membership = await prisma.workspaceMembership.findUnique({
    where: { workspaceId_userId: { workspaceId: apiKey.workspaceId, userId } },
  });
  if (membership?.role !== 'OWNER') throw notFound;

  const { workspace: _workspace, ...key } = apiKey;
  return { apiKey: key };
}
