import { GraphQLError } from 'graphql';
import type { Task, Prisma } from '@prisma/client';
import type {
  TaskResolvers,
  QueryResolvers,
  MutationResolvers,
  SubscriptionResolvers,
} from '../__generated__/graphql.js';
import {
  requireProjectAccess,
  requireTaskAccess,
  requireWorkspaceAccess,
  workspaceScopedSubscription,
} from '../auth/workspace.js';
import { recordAuditEvent } from '../audit/record-event.js';
import { diffFields } from '../audit/diff.js';
import { computeDisplayType, DISPLAY_LABELS } from './task-relationship.js';

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
      // Best-effort: auto-create CREATED_FROM relationship if sourceTaskId provided.
      // Failures here should not cause the task creation mutation to fail.
      if (args.input.sourceTaskId) {
        try {
          const sourceTask = await context.prisma.task.findUnique({
            where: { id: args.input.sourceTaskId },
          });
          if (sourceTask && sourceTask.workspaceId === task.workspaceId) {
            await context.prisma.taskRelationship.create({
              data: {
                type: 'CREATED_FROM',
                sourceTaskId: task.id,
                targetTaskId: sourceTask.id,
                workspaceId: task.workspaceId,
              },
            });
            context.pubsub.publish('taskChanged', sourceTask);
            const srcLabel = DISPLAY_LABELS[computeDisplayType('CREATED_FROM', 'source')];
            const tgtLabel = DISPLAY_LABELS[computeDisplayType('CREATED_FROM', 'target')];
            recordAuditEvent(context.prisma, {
              entityType: 'TASK',
              entityId: task.id,
              action: 'UPDATED',
              actorType: 'SYSTEM',
              workspaceId: task.workspaceId,
              changes: [
                {
                  field: 'relationshipAdded',
                  oldValue: null,
                  newValue: `${srcLabel} ${sourceTask.displayId}`,
                },
              ],
            });
            recordAuditEvent(context.prisma, {
              entityType: 'TASK',
              entityId: sourceTask.id,
              action: 'UPDATED',
              actorType: 'SYSTEM',
              workspaceId: task.workspaceId,
              changes: [
                {
                  field: 'relationshipAdded',
                  oldValue: null,
                  newValue: `${tgtLabel} ${task.displayId}`,
                },
              ],
            });
          }
        } catch (error) {
          console.error('Failed to auto-create CREATED_FROM relationship', {
            taskId: task.id,
            sourceTaskId: args.input.sourceTaskId,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }

      context.pubsub.publish('taskChanged', task);
      recordAuditEvent(context.prisma, {
        entityType: 'TASK',
        entityId: task.id,
        action: 'CREATED',
        actorType: 'USER',
        actorId: context.userId,
        workspaceId: task.workspaceId,
      });
      return task;
    },
    updateTask: async (_parent, args, context) => {
      const { task: existingTask } = await requireTaskAccess(
        context.prisma,
        args.id,
        context.userId,
      );
      const data: Prisma.TaskUncheckedUpdateInput = {};
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

      let validatedNewLabels: Array<{ id: string; name: string }> = [];
      if (args.input.labelIds !== undefined) {
        if (args.input.labelIds?.length) {
          validatedNewLabels = await context.prisma.label.findMany({
            where: { id: { in: args.input.labelIds }, workspaceId: existingTask.workspaceId },
            select: { id: true, name: true },
          });
          if (validatedNewLabels.length !== args.input.labelIds.length) {
            throw new GraphQLError('One or more labels do not belong to this workspace', {
              extensions: { code: 'BAD_USER_INPUT' },
            });
          }
          data.labels = { set: args.input.labelIds.map((id: string) => ({ id })) };
        } else {
          data.labels = { set: [] };
        }
      }

      const auditChanges: Array<{
        field: string;
        oldValue: string | null;
        newValue: string | null;
      }> = [];

      const scalarDiff = diffFields(
        existingTask,
        {
          ...(args.input.title != null && { title: args.input.title }),
          ...(args.input.description !== undefined && { description: args.input.description }),
          ...(args.input.status != null && { status: args.input.status }),
          ...(args.input.priority != null && { priority: args.input.priority }),
        },
        ['title', 'description', 'status', 'priority'],
      );
      auditChanges.push(...scalarDiff);

      if (
        args.input.assigneeId !== undefined &&
        args.input.assigneeId !== existingTask.assigneeId
      ) {
        const [oldUser, newUser] = await Promise.all([
          existingTask.assigneeId
            ? context.prisma.user.findUnique({ where: { id: existingTask.assigneeId } })
            : null,
          args.input.assigneeId
            ? context.prisma.user.findUnique({ where: { id: args.input.assigneeId } })
            : null,
        ]);
        auditChanges.push(
          {
            field: 'assigneeId',
            oldValue: existingTask.assigneeId ?? null,
            newValue: args.input.assigneeId ?? null,
          },
          { field: 'assignee', oldValue: oldUser?.name ?? null, newValue: newUser?.name ?? null },
        );
      }

      if (args.input.projectId !== undefined && args.input.projectId !== existingTask.projectId) {
        const [oldProject, newProject] = await Promise.all([
          existingTask.projectId
            ? context.prisma.project.findUnique({ where: { id: existingTask.projectId } })
            : null,
          args.input.projectId
            ? context.prisma.project.findUnique({ where: { id: args.input.projectId } })
            : null,
        ]);
        auditChanges.push(
          {
            field: 'projectId',
            oldValue: existingTask.projectId ?? null,
            newValue: args.input.projectId ?? null,
          },
          {
            field: 'project',
            oldValue: oldProject?.name ?? null,
            newValue: newProject?.name ?? null,
          },
        );
      }

      if (args.input.labelIds !== undefined) {
        const existingLabels = await context.prisma.task
          .findUnique({ where: { id: existingTask.id } })
          .labels();
        const oldLabelIds = new Set((existingLabels ?? []).map((l) => l.id));
        const newLabelIds = new Set(args.input.labelIds ?? []);

        const addedIds = [...newLabelIds].filter((id) => !oldLabelIds.has(id));
        const removedIds = [...oldLabelIds].filter((id) => !newLabelIds.has(id));

        if (addedIds.length > 0) {
          const addedLabels = validatedNewLabels.filter((l) => addedIds.includes(l.id));
          auditChanges.push({
            field: 'labelsAdded',
            oldValue: null,
            newValue: addedLabels.map((l) => l.name).join(', '),
          });
        }
        if (removedIds.length > 0) {
          const removedLabels = (existingLabels ?? []).filter((l) => removedIds.includes(l.id));
          auditChanges.push({
            field: 'labelsRemoved',
            oldValue: removedLabels.map((l) => l.name).join(', '),
            newValue: null,
          });
        }
      }

      const task = await context.prisma.task.update({
        where: { id: args.id },
        data,
      });
      context.pubsub.publish('taskChanged', task);

      if (auditChanges.length > 0) {
        recordAuditEvent(context.prisma, {
          entityType: 'TASK',
          entityId: task.id,
          action: 'UPDATED',
          actorType: 'USER',
          actorId: context.userId,
          workspaceId: task.workspaceId,
          changes: auditChanges,
        });
      }

      return task;
    },
    archiveTask: async (_parent, args, context) => {
      await requireTaskAccess(context.prisma, args.id, context.userId);
      const task = await context.prisma.task.update({
        where: { id: args.id },
        data: { archivedAt: new Date() },
      });
      context.pubsub.publish('taskChanged', task);
      recordAuditEvent(context.prisma, {
        entityType: 'TASK',
        entityId: task.id,
        action: 'ARCHIVED',
        actorType: 'USER',
        actorId: context.userId,
        workspaceId: task.workspaceId,
      });
      return task;
    },
  } satisfies Pick<MutationResolvers, 'createTask' | 'updateTask' | 'archiveTask'>,
  Subscription: {
    taskChanged: {
      subscribe: async (_parent: unknown, args: { workspaceId: string }, context) => {
        await requireWorkspaceAccess(context.prisma, args.workspaceId, context.userId);
        return workspaceScopedSubscription(
          context.pubsub.subscribe('taskChanged'),
          context.prisma,
          args.workspaceId,
          context.userId,
        );
      },
      resolve: (payload: Task) => payload,
    },
  } satisfies Pick<SubscriptionResolvers, 'taskChanged'>,
  Task: {
    project: (parent, _args, context) => {
      if (!parent.projectId) return null;
      return context.loaders.projectById.load(parent.projectId);
    },
    workspace: async (parent, _args, context) => {
      const ws = await context.loaders.workspaceById.load(parent.workspaceId);
      if (!ws) {
        throw new GraphQLError(`Workspace ${parent.workspaceId} not found`, {
          extensions: { code: 'NOT_FOUND' },
        });
      }
      return ws;
    },
    assignee: (parent, _args, context) => {
      if (!parent.assigneeId) return null;
      return context.loaders.userById.load(parent.assigneeId);
    },
    labels: (parent, _args, context) => {
      return context.loaders.labelsByTaskId.load(parent.id);
    },
  } satisfies TaskResolvers,
};
