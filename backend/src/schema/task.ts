import { GraphQLError } from 'graphql';
import type { Task } from '@prisma/client';
import type {
  TaskResolvers,
  QueryResolvers,
  MutationResolvers,
  SubscriptionResolvers,
} from '../__generated__/graphql.js';
import type { ServerContext } from '../context.js';
import {
  requireProjectAccess,
  requireTaskAccess,
  requireWorkspaceAccess,
} from '../auth/workspace.js';

export const taskResolvers = {
  Query: {
    task: async (_parent, args, context) => {
      const { task } = await requireTaskAccess(context.prisma, args.id, context.userId);
      return task;
    },
  } satisfies Pick<QueryResolvers, 'task'>,
  Mutation: {
    createTask: async (_parent, args, context) => {
      const { workspaceId } = args.input;
      await requireWorkspaceAccess(context.prisma, workspaceId, context.userId);
      const task = await context.prisma.$transaction(async (tx) => {
        // If projectId provided, validate it belongs to the workspace
        if (args.input.projectId) {
          const project = await tx.project.findUnique({
            where: { id: args.input.projectId },
          });
          if (!project || project.workspaceId !== workspaceId) {
            throw new GraphQLError('Project not found in this workspace', {
              extensions: { code: 'BAD_USER_INPUT' },
            });
          }
        }
        // Atomic increment — PostgreSQL row lock serializes concurrent updates
        const workspace = await tx.workspace.update({
          where: { id: workspaceId },
          data: { taskCounter: { increment: 1 } },
        });
        const sequenceNumber = workspace.taskCounter;
        const displayId = `${workspace.slug.toUpperCase()}-${sequenceNumber}`;
        // Validate assignee is a workspace member
        if (args.input.assigneeId) {
          const assigneeMembership = await tx.workspaceMembership.findUnique({
            where: {
              workspaceId_userId: {
                workspaceId,
                userId: args.input.assigneeId,
              },
            },
          });
          if (!assigneeMembership) {
            throw new GraphQLError('Assignee must be a workspace member', {
              extensions: { code: 'BAD_USER_INPUT' },
            });
          }
        }

        // Validate labels belong to workspace
        if (args.input.labelIds?.length) {
          const labels = await tx.label.findMany({
            where: { id: { in: args.input.labelIds }, workspaceId },
          });
          if (labels.length !== args.input.labelIds.length) {
            throw new GraphQLError('One or more labels do not belong to this workspace', {
              extensions: { code: 'BAD_USER_INPUT' },
            });
          }
        }

        return tx.task.create({
          data: {
            title: args.input.title,
            description: args.input.description,
            status: args.input.status ?? 'TODO',
            priority: args.input.priority ?? 'NONE',
            projectId: args.input.projectId ?? null,
            workspaceId,
            sequenceNumber,
            displayId,
            assigneeId: args.input.assigneeId ?? undefined,
            labels: args.input.labelIds?.length
              ? { connect: args.input.labelIds.map((id) => ({ id })) }
              : undefined,
          },
        });
      });
      context.pubsub.publish('taskChanged', task);
      return task;
    },
    updateTask: async (_parent, args, context) => {
      const { task: existingTask } = await requireTaskAccess(
        context.prisma,
        args.id,
        context.userId,
      );
      const data: Record<string, unknown> = {};
      if (args.input.title != null) data.title = args.input.title;
      if (args.input.description !== undefined) data.description = args.input.description;
      if (args.input.status != null) data.status = args.input.status;
      if (args.input.priority != null) data.priority = args.input.priority;
      if (args.input.projectId !== undefined) {
        if (args.input.projectId) {
          const { project: targetProject } = await requireProjectAccess(
            context.prisma,
            args.input.projectId,
            context.userId,
          );
          if (targetProject.workspaceId !== existingTask.workspaceId) {
            throw new GraphQLError('Cannot move task to a project in a different workspace', {
              extensions: { code: 'BAD_REQUEST' },
            });
          }
          data.projectId = args.input.projectId;
        } else {
          data.projectId = null;
        }
      }

      // Handle assignee
      if (args.input.assigneeId !== undefined) {
        if (args.input.assigneeId) {
          const assigneeMembership = await context.prisma.workspaceMembership.findUnique({
            where: {
              workspaceId_userId: {
                workspaceId: existingTask.workspaceId,
                userId: args.input.assigneeId,
              },
            },
          });
          if (!assigneeMembership) {
            throw new GraphQLError('Assignee must be a workspace member', {
              extensions: { code: 'BAD_USER_INPUT' },
            });
          }
          data.assigneeId = args.input.assigneeId;
        } else {
          data.assigneeId = null;
        }
      }

      // Handle labels
      if (args.input.labelIds !== undefined) {
        if (args.input.labelIds?.length) {
          const labels = await context.prisma.label.findMany({
            where: { id: { in: args.input.labelIds }, workspaceId: existingTask.workspaceId },
          });
          if (labels.length !== args.input.labelIds.length) {
            throw new GraphQLError('One or more labels do not belong to this workspace', {
              extensions: { code: 'BAD_USER_INPUT' },
            });
          }
          data.labels = { set: args.input.labelIds.map((id: string) => ({ id })) };
        } else {
          data.labels = { set: [] };
        }
      }

      const task = await context.prisma.task.update({
        where: { id: args.id },
        data,
      });
      context.pubsub.publish('taskChanged', task);
      return task;
    },
    archiveTask: async (_parent, args, context) => {
      await requireTaskAccess(context.prisma, args.id, context.userId);
      const task = await context.prisma.task.update({
        where: { id: args.id },
        data: { archivedAt: new Date() },
      });
      context.pubsub.publish('taskChanged', task);
      return task;
    },
  } satisfies Pick<MutationResolvers, 'createTask' | 'updateTask' | 'archiveTask'>,
  Subscription: {
    taskChanged: {
      subscribe: async (_parent: unknown, args: { workspaceId: string }, context) => {
        await requireWorkspaceAccess(context.prisma, args.workspaceId, context.userId);
        return context.pubsub.subscribe('taskChanged');
      },
      resolve: async (payload: Task, args: { workspaceId: string }, context: ServerContext) => {
        if (payload.workspaceId !== args.workspaceId) return undefined as never;

        // Re-validate membership per event
        const membership = await context.prisma.workspaceMembership.findUnique({
          where: {
            workspaceId_userId: {
              workspaceId: args.workspaceId,
              userId: context.userId,
            },
          },
        });
        if (!membership) return undefined as never;

        return payload;
      },
    },
  } satisfies Pick<SubscriptionResolvers, 'taskChanged'>,
  Task: {
    project: (parent, _args, context) => {
      if (!parent.projectId) return null;
      return context.prisma.project.findUnique({ where: { id: parent.projectId } });
    },
    assignee: (parent, _args, context) => {
      if (!parent.assigneeId) return null;
      return context.prisma.user.findUnique({ where: { id: parent.assigneeId } });
    },
    labels: async (parent, _args, context) => {
      return (await context.prisma.task.findUnique({ where: { id: parent.id } }).labels()) ?? [];
    },
  } satisfies TaskResolvers,
};
