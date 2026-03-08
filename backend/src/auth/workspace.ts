import { GraphQLError } from 'graphql';
import type { PrismaClient, Workspace, Project, Task, WorkspaceRole } from '@prisma/client';

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
