import { GraphQLError } from 'graphql';
import type { PrismaClient } from '@prisma/client';

/**
 * Verifies that the given workspace exists, is not soft-deleted,
 * and is owned by the requesting user.
 *
 * Returns the workspace if valid. Throws NOT_FOUND for both
 * missing and unauthorized workspaces (prevents IDOR leaks).
 */
export async function requireWorkspaceAccess(
  prisma: PrismaClient,
  workspaceId: string,
  userId: string,
) {
  const workspace = await prisma.workspace.findUnique({
    where: { id: workspaceId },
  });

  if (!workspace || workspace.deletedAt || workspace.ownerId !== userId) {
    throw new GraphQLError('Workspace not found', {
      extensions: { code: 'NOT_FOUND' },
    });
  }

  return workspace;
}

/**
 * Same as requireWorkspaceAccess but looks up workspace by slug.
 */
export async function requireWorkspaceAccessBySlug(
  prisma: PrismaClient,
  slug: string,
  userId: string,
) {
  const workspace = await prisma.workspace.findUnique({
    where: { slug },
  });

  if (!workspace || workspace.deletedAt || workspace.ownerId !== userId) {
    throw new GraphQLError('Workspace not found', {
      extensions: { code: 'NOT_FOUND' },
    });
  }

  return workspace;
}

/**
 * Same as requireWorkspaceAccess but looks up workspace
 * from a project ID (for project/task mutations).
 */
export async function requireProjectAccess(
  prisma: PrismaClient,
  projectId: string,
  userId: string,
) {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: { workspace: true },
  });

  if (
    !project ||
    !project.workspace ||
    project.workspace.deletedAt ||
    project.workspace.ownerId !== userId
  ) {
    throw new GraphQLError('Project not found', {
      extensions: { code: 'NOT_FOUND' },
    });
  }

  return project;
}

/**
 * Same pattern for task access — resolves task -> project -> workspace.
 */
export async function requireTaskAccess(prisma: PrismaClient, taskId: string, userId: string) {
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    include: { project: { include: { workspace: true } } },
  });

  if (
    !task ||
    !task.project.workspace ||
    task.project.workspace.deletedAt ||
    task.project.workspace.ownerId !== userId
  ) {
    throw new GraphQLError('Task not found', {
      extensions: { code: 'NOT_FOUND' },
    });
  }

  return task;
}
