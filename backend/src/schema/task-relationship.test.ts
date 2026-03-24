import { describe, expect, it, vi } from 'vitest';
import {
  taskRelationshipQueryResolvers,
  taskRelationshipMutationResolvers,
  taskRelationshipFieldResolvers,
  taskRelationshipTypeResolvers,
} from './task-relationship.js';

const WORKSPACE = {
  id: 'ws1',
  name: 'Personal',
  slug: 'personal',
  taskCounter: 5,
  createdById: 'user1',
  deletedAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const MEMBERSHIP = {
  id: 'mem1',
  workspaceId: 'ws1',
  userId: 'user1',
  role: 'OWNER' as const,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const TASK_A = {
  id: 'task-a',
  title: 'Task A',
  displayId: 'PERSONAL-1',
  workspaceId: 'ws1',
  status: 'TODO' as const,
  priority: 'NONE' as const,
  sequenceNumber: 1,
  projectId: null,
  assigneeId: null,
  description: null,
  archivedAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const TASK_B = {
  id: 'task-b',
  title: 'Task B',
  displayId: 'PERSONAL-2',
  workspaceId: 'ws1',
  status: 'TODO' as const,
  priority: 'NONE' as const,
  sequenceNumber: 2,
  projectId: null,
  assigneeId: null,
  description: null,
  archivedAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

function createMockContext() {
  const prisma = {
    task: {
      findUnique: vi.fn(),
      findUniqueOrThrow: vi.fn(),
      findFirst: vi.fn(),
    },
    taskRelationship: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      delete: vi.fn(),
    },
    workspace: {
      findUnique: vi.fn().mockResolvedValue(WORKSPACE),
    },
    workspaceMembership: {
      findUnique: vi.fn().mockResolvedValue(MEMBERSHIP),
    },
    auditEvent: {
      create: vi.fn(),
    },
  };
  return {
    prisma,
    pubsub: {
      publish: vi.fn(),
      subscribe: vi.fn(),
    },
    userId: 'user1',
  };
}

describe('task relationship resolvers', () => {
  describe('Query.taskByDisplayId', () => {
    it('returns a task by displayId within a workspace', async () => {
      const ctx = createMockContext();
      ctx.prisma.task.findFirst.mockResolvedValue(TASK_A);

      const result = await taskRelationshipQueryResolvers.taskByDisplayId(
        {} as never,
        { displayId: 'PERSONAL-1', workspaceId: 'ws1' },
        ctx as never,
      );
      expect(result).toEqual(TASK_A);
      expect(ctx.prisma.task.findFirst).toHaveBeenCalledWith({
        where: { displayId: 'PERSONAL-1', workspaceId: 'ws1' },
      });
    });

    it('returns null when task not found', async () => {
      const ctx = createMockContext();
      ctx.prisma.task.findFirst.mockResolvedValue(null);

      const result = await taskRelationshipQueryResolvers.taskByDisplayId(
        {} as never,
        { displayId: 'PERSONAL-999', workspaceId: 'ws1' },
        ctx as never,
      );
      expect(result).toBeNull();
    });
  });

  describe('Mutation.createTaskRelationship', () => {
    it('creates a relationship and publishes events for both tasks', async () => {
      const ctx = createMockContext();
      ctx.prisma.task.findUnique.mockResolvedValueOnce(TASK_A).mockResolvedValueOnce(TASK_B);
      ctx.prisma.taskRelationship.findFirst.mockResolvedValue(null);
      const relationship = {
        id: 'rel1',
        type: 'BLOCKS' as const,
        sourceTaskId: 'task-a',
        targetTaskId: 'task-b',
        workspaceId: 'ws1',
        createdAt: new Date(),
      };
      ctx.prisma.taskRelationship.create.mockResolvedValue(relationship);

      const result = await taskRelationshipMutationResolvers.createTaskRelationship(
        {} as never,
        { input: { sourceTaskId: 'task-a', targetTaskId: 'task-b', type: 'BLOCKS' } },
        ctx as never,
      );

      expect(result.id).toBe('rel1');
      expect(result._viewingSide).toBe('source');
      expect(ctx.pubsub.publish).toHaveBeenCalledWith('taskChanged', TASK_A);
      expect(ctx.pubsub.publish).toHaveBeenCalledWith('taskChanged', TASK_B);
      expect(ctx.prisma.auditEvent.create).toHaveBeenCalledTimes(2);
    });

    it('rejects self-referencing relationships', async () => {
      const ctx = createMockContext();

      await expect(
        taskRelationshipMutationResolvers.createTaskRelationship(
          {} as never,
          { input: { sourceTaskId: 'task-a', targetTaskId: 'task-a', type: 'BLOCKS' } },
          ctx as never,
        ),
      ).rejects.toThrow('Cannot create a relationship between a task and itself');
    });

    it('rejects cross-workspace relationships', async () => {
      const ctx = createMockContext();
      const taskOtherWs = { ...TASK_B, workspaceId: 'ws2' };
      ctx.prisma.task.findUnique.mockResolvedValueOnce(TASK_A).mockResolvedValueOnce(taskOtherWs);

      await expect(
        taskRelationshipMutationResolvers.createTaskRelationship(
          {} as never,
          { input: { sourceTaskId: 'task-a', targetTaskId: 'task-b', type: 'BLOCKS' } },
          ctx as never,
        ),
      ).rejects.toThrow('Tasks must be in the same workspace');
    });

    it('rejects duplicate relationships (same direction)', async () => {
      const ctx = createMockContext();
      ctx.prisma.task.findUnique.mockResolvedValueOnce(TASK_A).mockResolvedValueOnce(TASK_B);
      ctx.prisma.taskRelationship.findFirst.mockResolvedValue({ id: 'existing' });

      await expect(
        taskRelationshipMutationResolvers.createTaskRelationship(
          {} as never,
          { input: { sourceTaskId: 'task-a', targetTaskId: 'task-b', type: 'BLOCKS' } },
          ctx as never,
        ),
      ).rejects.toThrow('This relationship already exists');
    });

    it('rejects duplicate relationships (reverse direction)', async () => {
      const ctx = createMockContext();
      ctx.prisma.task.findUnique.mockResolvedValueOnce(TASK_A).mockResolvedValueOnce(TASK_B);
      // The findFirst checks both directions
      ctx.prisma.taskRelationship.findFirst.mockResolvedValue({ id: 'existing-reverse' });

      await expect(
        taskRelationshipMutationResolvers.createTaskRelationship(
          {} as never,
          { input: { sourceTaskId: 'task-a', targetTaskId: 'task-b', type: 'BLOCKS' } },
          ctx as never,
        ),
      ).rejects.toThrow('This relationship already exists');
    });

    it('rejects unauthorized access', async () => {
      const ctx = createMockContext();
      ctx.prisma.task.findUnique.mockResolvedValue(TASK_A);
      ctx.prisma.workspaceMembership.findUnique.mockResolvedValue(null);

      await expect(
        taskRelationshipMutationResolvers.createTaskRelationship(
          {} as never,
          { input: { sourceTaskId: 'task-a', targetTaskId: 'task-b', type: 'BLOCKS' } },
          ctx as never,
        ),
      ).rejects.toThrow();
    });
  });

  describe('Mutation.removeTaskRelationship', () => {
    it('removes a relationship and publishes events', async () => {
      const ctx = createMockContext();
      const relationship = {
        id: 'rel1',
        type: 'BLOCKS' as const,
        sourceTaskId: 'task-a',
        targetTaskId: 'task-b',
        workspaceId: 'ws1',
        createdAt: new Date(),
      };
      ctx.prisma.taskRelationship.findUnique.mockResolvedValue(relationship);
      ctx.prisma.task.findUnique
        .mockResolvedValueOnce(TASK_A) // requireTaskAccess (returns source task)
        .mockResolvedValueOnce(TASK_B); // fetch target after delete

      const result = await taskRelationshipMutationResolvers.removeTaskRelationship(
        {} as never,
        { id: 'rel1' },
        ctx as never,
      );

      expect(result).toBe(true);
      expect(ctx.prisma.taskRelationship.delete).toHaveBeenCalledWith({ where: { id: 'rel1' } });
      expect(ctx.pubsub.publish).toHaveBeenCalledWith('taskChanged', TASK_A);
      expect(ctx.pubsub.publish).toHaveBeenCalledWith('taskChanged', TASK_B);
    });

    it('throws when relationship not found', async () => {
      const ctx = createMockContext();
      ctx.prisma.taskRelationship.findUnique.mockResolvedValue(null);

      await expect(
        taskRelationshipMutationResolvers.removeTaskRelationship(
          {} as never,
          { id: 'nonexistent' },
          ctx as never,
        ),
      ).rejects.toThrow('Relationship not found');
    });
  });

  describe('Task.relationships field resolver', () => {
    it('returns relationships from both directions sorted by createdAt desc', async () => {
      const ctx = createMockContext();
      const now = new Date();
      const earlier = new Date(now.getTime() - 1000);

      const asSource = [
        {
          id: 'rel1',
          type: 'BLOCKS' as const,
          sourceTaskId: 'task-a',
          targetTaskId: 'task-b',
          workspaceId: 'ws1',
          createdAt: earlier,
        },
      ];
      const asTarget = [
        {
          id: 'rel2',
          type: 'RELATES_TO' as const,
          sourceTaskId: 'task-c',
          targetTaskId: 'task-a',
          workspaceId: 'ws1',
          createdAt: now,
        },
      ];

      ctx.prisma.taskRelationship.findMany
        .mockResolvedValueOnce(asSource)
        .mockResolvedValueOnce(asTarget);

      const result = await taskRelationshipFieldResolvers.relationships!(
        { id: 'task-a' } as never,
        {} as never,
        ctx as never,
      );

      expect(result).toHaveLength(2);
      // Most recent first
      expect(result[0]._viewingSide).toBe('target');
      expect(result[0].id).toBe('rel2');
      expect(result[1]._viewingSide).toBe('source');
      expect(result[1].id).toBe('rel1');
    });
  });

  describe('TaskRelationship type resolvers', () => {
    it('relatedTask returns target task when viewing from source', async () => {
      const ctx = createMockContext();
      ctx.prisma.task.findUniqueOrThrow.mockResolvedValue(TASK_B);

      const parent = {
        id: 'rel1',
        type: 'BLOCKS' as const,
        sourceTaskId: 'task-a',
        targetTaskId: 'task-b',
        workspaceId: 'ws1',
        createdAt: new Date(),
        _viewingSide: 'source' as const,
      };

      const result = await taskRelationshipTypeResolvers.relatedTask!(
        parent as never,
        {} as never,
        ctx as never,
      );
      expect(result).toEqual(TASK_B);
      expect(ctx.prisma.task.findUniqueOrThrow).toHaveBeenCalledWith({
        where: { id: 'task-b' },
      });
    });

    it('relatedTask returns source task when viewing from target', async () => {
      const ctx = createMockContext();
      ctx.prisma.task.findUniqueOrThrow.mockResolvedValue(TASK_A);

      const parent = {
        id: 'rel1',
        type: 'BLOCKS' as const,
        sourceTaskId: 'task-a',
        targetTaskId: 'task-b',
        workspaceId: 'ws1',
        createdAt: new Date(),
        _viewingSide: 'target' as const,
      };

      const result = await taskRelationshipTypeResolvers.relatedTask!(
        parent as never,
        {} as never,
        ctx as never,
      );
      expect(result).toEqual(TASK_A);
      expect(ctx.prisma.task.findUniqueOrThrow).toHaveBeenCalledWith({
        where: { id: 'task-a' },
      });
    });

    it('displayType computes correctly for each type and side', () => {
      const base = {
        id: 'r1',
        sourceTaskId: 'a',
        targetTaskId: 'b',
        workspaceId: 'ws1',
        createdAt: new Date(),
      };

      const cases: Array<{
        type: 'BLOCKS' | 'RELATES_TO' | 'DUPLICATES' | 'CREATED_FROM';
        side: 'source' | 'target';
        expected: string;
      }> = [
        { type: 'BLOCKS', side: 'source', expected: 'BLOCKS' },
        { type: 'BLOCKS', side: 'target', expected: 'BLOCKED_BY' },
        { type: 'RELATES_TO', side: 'source', expected: 'RELATES_TO' },
        { type: 'RELATES_TO', side: 'target', expected: 'RELATES_TO' },
        { type: 'DUPLICATES', side: 'source', expected: 'DUPLICATES' },
        { type: 'DUPLICATES', side: 'target', expected: 'DUPLICATED_BY' },
        { type: 'CREATED_FROM', side: 'source', expected: 'CREATED_FROM' },
        { type: 'CREATED_FROM', side: 'target', expected: 'CREATED' },
      ];

      for (const { type, side, expected } of cases) {
        const parent = { ...base, type, _viewingSide: side };
        const result = taskRelationshipTypeResolvers.displayType!(parent as never);
        expect(result).toBe(expected);
      }
    });
  });
});
