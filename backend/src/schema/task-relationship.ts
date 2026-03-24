import { GraphQLError } from 'graphql';
import type { Task, TaskRelationship, TaskRelationshipType } from '@prisma/client';
import {
  TaskRelationshipDisplayType,
  type QueryResolvers,
  type MutationResolvers,
  type TaskResolvers,
  type TaskRelationshipResolvers,
} from '../__generated__/graphql.js';
import { requireTaskAccess, requireWorkspaceAccess } from '../auth/workspace.js';
import { recordAuditEvent } from '../audit/record-event.js';

/** @public Referenced by codegen mapper in codegen.ts */
export type TaskRelationshipParent = TaskRelationship & {
  _viewingSide: 'source' | 'target';
  _relatedTask?: Task;
};

const DT = TaskRelationshipDisplayType;

const SOURCE_DISPLAY_MAP: Record<TaskRelationshipType, TaskRelationshipDisplayType> = {
  BLOCKS: DT.Blocks,
  RELATES_TO: DT.RelatesTo,
  DUPLICATES: DT.Duplicates,
  CREATED_FROM: DT.CreatedFrom,
};

const TARGET_DISPLAY_MAP: Record<TaskRelationshipType, TaskRelationshipDisplayType> = {
  BLOCKS: DT.BlockedBy,
  RELATES_TO: DT.RelatesTo,
  DUPLICATES: DT.DuplicatedBy,
  CREATED_FROM: DT.Created,
};

export function computeDisplayType(
  type: TaskRelationshipType,
  viewingSide: 'source' | 'target',
): TaskRelationshipDisplayType {
  return viewingSide === 'source' ? SOURCE_DISPLAY_MAP[type] : TARGET_DISPLAY_MAP[type];
}

export const DISPLAY_LABELS: Record<TaskRelationshipDisplayType, string> = {
  [DT.Blocks]: 'blocks',
  [DT.BlockedBy]: 'blocked by',
  [DT.RelatesTo]: 'relates to',
  [DT.Duplicates]: 'duplicates',
  [DT.DuplicatedBy]: 'duplicated by',
  [DT.CreatedFrom]: 'created from',
  [DT.Created]: 'created',
};

export const taskRelationshipQueryResolvers = {
  taskByDisplayId: async (_parent, args, context) => {
    await requireWorkspaceAccess(context.prisma, args.workspaceId, context.userId);
    const task = await context.prisma.task.findFirst({
      where: { displayId: args.displayId, workspaceId: args.workspaceId },
    });
    return task ?? null;
  },
} satisfies Pick<QueryResolvers, 'taskByDisplayId'>;

export const taskRelationshipMutationResolvers = {
  createTaskRelationship: async (_parent, args, context) => {
    const { sourceTaskId, targetTaskId, type } = args.input;

    if (sourceTaskId === targetTaskId) {
      throw new GraphQLError('Cannot create a relationship between a task and itself', {
        extensions: { code: 'BAD_USER_INPUT' },
      });
    }

    const [{ task: sourceTask }, { task: targetTask }] = await Promise.all([
      requireTaskAccess(context.prisma, sourceTaskId, context.userId),
      requireTaskAccess(context.prisma, targetTaskId, context.userId),
    ]);

    if (sourceTask.workspaceId !== targetTask.workspaceId) {
      throw new GraphQLError('Tasks must be in the same workspace', {
        extensions: { code: 'BAD_USER_INPUT' },
      });
    }

    const existing = await context.prisma.taskRelationship.findFirst({
      where: {
        OR: [
          { sourceTaskId, targetTaskId, type },
          { sourceTaskId: targetTaskId, targetTaskId: sourceTaskId, type },
        ],
      },
    });
    if (existing) {
      throw new GraphQLError('This relationship already exists', {
        extensions: { code: 'BAD_USER_INPUT' },
      });
    }

    const relationship = await context.prisma.taskRelationship.create({
      data: {
        type,
        sourceTaskId,
        targetTaskId,
        workspaceId: sourceTask.workspaceId,
      },
    });

    context.pubsub.publish('taskChanged', sourceTask);
    context.pubsub.publish('taskChanged', targetTask);

    const sourceDisplayType = computeDisplayType(type, 'source');
    const targetDisplayType = computeDisplayType(type, 'target');

    recordAuditEvent(context.prisma, {
      entityType: 'TASK',
      entityId: sourceTaskId,
      action: 'UPDATED',
      actorType: 'USER',
      actorId: context.userId,
      workspaceId: sourceTask.workspaceId,
      changes: [
        {
          field: 'relationshipAdded',
          oldValue: null,
          newValue: `${DISPLAY_LABELS[sourceDisplayType]} ${targetTask.displayId}`,
        },
      ],
    });
    recordAuditEvent(context.prisma, {
      entityType: 'TASK',
      entityId: targetTaskId,
      action: 'UPDATED',
      actorType: 'USER',
      actorId: context.userId,
      workspaceId: targetTask.workspaceId,
      changes: [
        {
          field: 'relationshipAdded',
          oldValue: null,
          newValue: `${DISPLAY_LABELS[targetDisplayType]} ${sourceTask.displayId}`,
        },
      ],
    });

    return { ...relationship, _viewingSide: 'source' as const };
  },
  removeTaskRelationship: async (_parent, args, context) => {
    const relationship = await context.prisma.taskRelationship.findUnique({
      where: { id: args.id },
    });
    if (!relationship) {
      throw new GraphQLError('Relationship not found', {
        extensions: { code: 'NOT_FOUND' },
      });
    }

    const { task: sourceTask } = await requireTaskAccess(
      context.prisma,
      relationship.sourceTaskId,
      context.userId,
    );

    await context.prisma.taskRelationship.delete({ where: { id: args.id } });

    const targetTask = await context.prisma.task.findUnique({
      where: { id: relationship.targetTaskId },
    });

    if (sourceTask) context.pubsub.publish('taskChanged', sourceTask);
    if (targetTask) context.pubsub.publish('taskChanged', targetTask);

    const sourceDisplayType = computeDisplayType(relationship.type, 'source');
    const targetDisplayType = computeDisplayType(relationship.type, 'target');

    if (sourceTask && targetTask) {
      recordAuditEvent(context.prisma, {
        entityType: 'TASK',
        entityId: relationship.sourceTaskId,
        action: 'UPDATED',
        actorType: 'USER',
        actorId: context.userId,
        workspaceId: relationship.workspaceId,
        changes: [
          {
            field: 'relationshipRemoved',
            oldValue: `${DISPLAY_LABELS[sourceDisplayType]} ${targetTask.displayId}`,
            newValue: null,
          },
        ],
      });
      recordAuditEvent(context.prisma, {
        entityType: 'TASK',
        entityId: relationship.targetTaskId,
        action: 'UPDATED',
        actorType: 'USER',
        actorId: context.userId,
        workspaceId: relationship.workspaceId,
        changes: [
          {
            field: 'relationshipRemoved',
            oldValue: `${DISPLAY_LABELS[targetDisplayType]} ${sourceTask.displayId}`,
            newValue: null,
          },
        ],
      });
    }

    return true;
  },
} satisfies Pick<MutationResolvers, 'createTaskRelationship' | 'removeTaskRelationship'>;

export const taskRelationshipFieldResolvers = {
  relationships: async (parent, _args, context) => {
    const [asSource, asTarget] = await Promise.all([
      context.prisma.taskRelationship.findMany({
        where: { sourceTaskId: parent.id },
        include: { targetTask: true },
        orderBy: { createdAt: 'desc' },
      }),
      context.prisma.taskRelationship.findMany({
        where: { targetTaskId: parent.id },
        include: { sourceTask: true },
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    return [
      ...asSource.map((r) => ({
        ...r,
        _viewingSide: 'source' as const,
        _relatedTask: r.targetTask,
      })),
      ...asTarget.map((r) => ({
        ...r,
        _viewingSide: 'target' as const,
        _relatedTask: r.sourceTask,
      })),
    ].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  },
} satisfies Pick<TaskResolvers, 'relationships'>;

export const taskRelationshipTypeResolvers = {
  relatedTask: (parent, _args, context) => {
    // Use eagerly loaded task from field resolver when available
    if (parent._relatedTask) return parent._relatedTask;
    const relatedId = parent._viewingSide === 'source' ? parent.targetTaskId : parent.sourceTaskId;
    return context.prisma.task.findUniqueOrThrow({ where: { id: relatedId } });
  },
  displayType: (parent) => {
    return computeDisplayType(parent.type, parent._viewingSide);
  },
  type: (parent) => parent.type,
} satisfies TaskRelationshipResolvers;
