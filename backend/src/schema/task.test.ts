import { describe, expect, it, vi } from 'vitest';
import { TaskStatus } from '../__generated__/graphql.js';
import { taskResolvers } from './task.js';

const WORKSPACE = {
  id: 'ws1',
  name: 'Personal',
  slug: 'personal',
  taskCounter: 0,
  createdById: 'user1',
  deletedAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const PROJECT = {
  id: 'p1',
  name: 'Test Project',
  workspaceId: 'ws1',
  workspace: WORKSPACE,
};

const MEMBERSHIP = {
  id: 'mem1',
  workspaceId: 'ws1',
  userId: 'user1',
  role: 'OWNER' as const,
  createdAt: new Date(),
  updatedAt: new Date(),
};

function createMockContext() {
  const prisma = {
    task: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    project: {
      findUnique: vi.fn().mockResolvedValue(PROJECT),
      findUniqueOrThrow: vi.fn().mockResolvedValue(PROJECT),
    },
    workspace: {
      findUnique: vi.fn().mockResolvedValue(WORKSPACE),
      update: vi.fn().mockResolvedValue({ ...WORKSPACE, taskCounter: 1 }),
    },
    workspaceMembership: {
      findUnique: vi.fn().mockResolvedValue(MEMBERSHIP),
    },
    user: {
      findUnique: vi.fn(),
    },
    label: {
      findMany: vi.fn(),
    },
    auditEvent: {
      create: vi.fn(),
    },
    $transaction: vi.fn((cb: (tx: typeof prisma) => Promise<unknown>) => cb(prisma)),
  };
  const loaders = {
    userById: { load: vi.fn(), clear: vi.fn() },
    projectById: { load: vi.fn().mockResolvedValue(PROJECT), clear: vi.fn() },
    initiativeById: { load: vi.fn(), clear: vi.fn() },
    workspaceById: { load: vi.fn(), clear: vi.fn() },
    labelsByTaskId: { load: vi.fn().mockResolvedValue([]), clear: vi.fn() },
    pullRequestsByTaskId: { load: vi.fn().mockResolvedValue([]), clear: vi.fn() },
    tasksByProjectId: { load: vi.fn(), clear: vi.fn() },
    projectsByInitiativeId: { load: vi.fn(), clear: vi.fn() },
  };
  return {
    prisma,
    pubsub: {
      publish: vi.fn(),
      subscribe: vi.fn(),
    },
    userId: 'user1',
    loaders,
  };
}

describe('task resolvers', () => {
  describe('Query', () => {
    it('task returns a single task by id with access check', async () => {
      const ctx = createMockContext();
      const task = {
        id: '1',
        title: 'Task 1',
        projectId: 'p1',
        workspaceId: 'ws1',
      };
      ctx.prisma.task.findUnique.mockResolvedValue(task);

      const result = await taskResolvers.Query.task({} as never, { id: '1' }, ctx as never);
      expect(result).toEqual(task);
      expect(ctx.prisma.task.findUnique).toHaveBeenCalledWith({
        where: { id: '1' },
      });
    });

    it('task throws NOT_FOUND for non-member', async () => {
      const ctx = createMockContext();
      const task = {
        id: '1',
        title: 'Task 1',
        projectId: 'p1',
        workspaceId: 'ws1',
      };
      ctx.prisma.task.findUnique.mockResolvedValue(task);
      ctx.prisma.workspaceMembership.findUnique.mockResolvedValue(null);

      await expect(
        taskResolvers.Query.task({} as never, { id: '1' }, ctx as never),
      ).rejects.toThrow('Task not found');
    });
  });

  describe('Mutation', () => {
    it('createTask creates with default status, workspaceId, displayId, and publishes', async () => {
      const ctx = createMockContext();
      const task = {
        id: '1',
        title: 'New Task',
        status: 'TODO',
        projectId: 'p1',
        workspaceId: 'ws1',
        sequenceNumber: 1,
        displayId: 'PERSONAL-1',
      };
      ctx.prisma.task.create.mockResolvedValue(task);

      const result = await taskResolvers.Mutation.createTask(
        {} as never,
        { input: { title: 'New Task', projectId: 'p1', workspaceId: 'ws1' } },
        ctx as never,
      );
      expect(result).toEqual(task);
      expect(ctx.prisma.workspace.update).toHaveBeenCalledWith({
        where: { id: 'ws1' },
        data: { taskCounter: { increment: 1 } },
      });
      expect(ctx.prisma.task.create).toHaveBeenCalledWith({
        data: {
          title: 'New Task',
          description: undefined,
          status: 'TODO',
          priority: 'NONE',
          projectId: 'p1',
          workspaceId: 'ws1',
          sequenceNumber: 1,
          displayId: 'PERSONAL-1',
        },
      });
      expect(ctx.pubsub.publish).toHaveBeenCalledWith('taskChanged', task);
    });

    it('createTask creates with specified status', async () => {
      const ctx = createMockContext();
      const task = {
        id: '1',
        title: 'New Task',
        status: 'IN_PROGRESS',
        projectId: 'p1',
        workspaceId: 'ws1',
        sequenceNumber: 1,
        displayId: 'PERSONAL-1',
      };
      ctx.prisma.task.create.mockResolvedValue(task);

      const result = await taskResolvers.Mutation.createTask(
        {} as never,
        {
          input: {
            title: 'New Task',
            status: TaskStatus.IN_PROGRESS,
            projectId: 'p1',
            workspaceId: 'ws1',
          },
        },
        ctx as never,
      );
      expect(result).toEqual(task);
      expect(ctx.prisma.task.create).toHaveBeenCalledWith({
        data: {
          title: 'New Task',
          description: undefined,
          status: 'IN_PROGRESS',
          priority: 'NONE',
          projectId: 'p1',
          workspaceId: 'ws1',
          sequenceNumber: 1,
          displayId: 'PERSONAL-1',
        },
      });
    });

    it('createTask creates without projectId (inbox task)', async () => {
      const ctx = createMockContext();
      const task = {
        id: '2',
        title: 'Inbox Task',
        status: 'TODO',
        projectId: null,
        workspaceId: 'ws1',
        sequenceNumber: 1,
        displayId: 'PERSONAL-1',
      };
      ctx.prisma.task.create.mockResolvedValue(task);

      const result = await taskResolvers.Mutation.createTask(
        {} as never,
        { input: { title: 'Inbox Task', workspaceId: 'ws1' } },
        ctx as never,
      );
      expect(result).toEqual(task);
      expect(ctx.prisma.task.create).toHaveBeenCalledWith({
        data: {
          title: 'Inbox Task',
          description: undefined,
          status: 'TODO',
          priority: 'NONE',
          projectId: null,
          workspaceId: 'ws1',
          sequenceNumber: 1,
          displayId: 'PERSONAL-1',
        },
      });
      // Should not have tried to look up a project
      expect(ctx.prisma.project.findUnique).not.toHaveBeenCalled();
    });

    it('updateTask updates and publishes', async () => {
      const ctx = createMockContext();
      const task = {
        id: '1',
        title: 'Updated',
        status: 'DONE',
        projectId: 'p1',
        workspaceId: 'ws1',
      };
      ctx.prisma.task.findUnique.mockResolvedValue(task);
      ctx.prisma.task.update.mockResolvedValue(task);

      const result = await taskResolvers.Mutation.updateTask(
        {} as never,
        { id: '1', input: { title: 'Updated', status: TaskStatus.DONE } },
        ctx as never,
      );
      expect(result).toEqual(task);
      expect(ctx.pubsub.publish).toHaveBeenCalledWith('taskChanged', task);
    });

    it('updateTask changes projectId within the same workspace', async () => {
      const ctx = createMockContext();
      const task = {
        id: '1',
        title: 'Task 1',
        projectId: 'p1',
        workspaceId: 'ws1',
      };
      const targetProject = {
        id: 'p2',
        name: 'Other Project',
        workspaceId: 'ws1',
        workspace: WORKSPACE,
      };
      ctx.prisma.task.findUnique.mockResolvedValue(task);
      ctx.prisma.project.findUnique.mockResolvedValue(targetProject);
      ctx.prisma.task.update.mockResolvedValue({ ...task, projectId: 'p2' });

      const result = await taskResolvers.Mutation.updateTask(
        {} as never,
        { id: '1', input: { projectId: 'p2' } },
        ctx as never,
      );
      expect(result.projectId).toBe('p2');
      expect(ctx.prisma.task.update).toHaveBeenCalledWith({
        where: { id: '1' },
        data: { projectId: 'p2' },
      });
    });

    it('updateTask removes projectId with explicit null', async () => {
      const ctx = createMockContext();
      const task = {
        id: '1',
        title: 'Task 1',
        projectId: 'p1',
        workspaceId: 'ws1',
      };
      ctx.prisma.task.findUnique.mockResolvedValue(task);
      ctx.prisma.task.update.mockResolvedValue({ ...task, projectId: null });

      const result = await taskResolvers.Mutation.updateTask(
        {} as never,
        { id: '1', input: { projectId: null } },
        ctx as never,
      );
      expect(result.projectId).toBeNull();
      expect(ctx.prisma.task.update).toHaveBeenCalledWith({
        where: { id: '1' },
        data: { projectId: null },
      });
    });

    it('updateTask rejects cross-workspace project move', async () => {
      const ctx = createMockContext();
      const task = {
        id: '1',
        title: 'Task 1',
        projectId: 'p1',
        workspaceId: 'ws1',
      };
      const otherWorkspace = { ...WORKSPACE, id: 'ws2', slug: 'other' };
      const targetProject = {
        id: 'p3',
        name: 'Cross-WS Project',
        workspaceId: 'ws2',
        workspace: otherWorkspace,
      };
      ctx.prisma.task.findUnique.mockResolvedValue(task);
      ctx.prisma.project.findUnique.mockResolvedValue(targetProject);
      // membership check for target project's workspace
      ctx.prisma.workspaceMembership.findUnique
        .mockResolvedValueOnce(MEMBERSHIP) // task access
        .mockResolvedValueOnce(MEMBERSHIP) // task workspace not deleted
        .mockResolvedValueOnce(MEMBERSHIP); // project access

      await expect(
        taskResolvers.Mutation.updateTask(
          {} as never,
          { id: '1', input: { projectId: 'p3' } },
          ctx as never,
        ),
      ).rejects.toThrow('Cannot move task to a project in a different workspace');
    });

    it('archiveTask sets archivedAt and publishes', async () => {
      const ctx = createMockContext();
      const task = {
        id: '1',
        title: 'Test',
        projectId: 'p1',
        workspaceId: 'ws1',
      };
      const archivedTask = { ...task, archivedAt: new Date() };
      ctx.prisma.task.findUnique.mockResolvedValue(task);
      ctx.prisma.task.update.mockResolvedValue(archivedTask);

      const result = await taskResolvers.Mutation.archiveTask(
        {} as never,
        { id: '1' },
        ctx as never,
      );
      expect(result).toEqual(archivedTask);
      expect(ctx.prisma.task.update).toHaveBeenCalledWith({
        where: { id: '1' },
        data: { archivedAt: expect.any(Date) },
      });
      expect(ctx.pubsub.publish).toHaveBeenCalledWith('taskChanged', archivedTask);
    });

    it('createTask with assigneeId validates workspace membership', async () => {
      const ctx = createMockContext();
      ctx.prisma.workspaceMembership.findUnique
        .mockResolvedValueOnce(MEMBERSHIP) // requireProjectAccess - workspace membership
        .mockResolvedValueOnce(null); // assignee membership check (not a member)

      await expect(
        taskResolvers.Mutation.createTask(
          {} as never,
          {
            input: { title: 'Task', projectId: 'p1', workspaceId: 'ws1', assigneeId: 'nonmember' },
          },
          ctx as never,
        ),
      ).rejects.toThrow('Assignee must be a workspace member');
    });

    it('createTask with labelIds validates labels belong to workspace', async () => {
      const ctx = createMockContext();
      ctx.prisma.label.findMany.mockResolvedValue([]); // no matching labels

      await expect(
        taskResolvers.Mutation.createTask(
          {} as never,
          {
            input: { title: 'Task', projectId: 'p1', workspaceId: 'ws1', labelIds: ['bad-label'] },
          },
          ctx as never,
        ),
      ).rejects.toThrow('One or more labels do not belong to this workspace');
    });

    it('updateTask sets assigneeId', async () => {
      const ctx = createMockContext();
      const task = { id: '1', title: 'Task', projectId: 'p1', workspaceId: 'ws1' };
      ctx.prisma.task.findUnique.mockResolvedValue(task);
      ctx.prisma.task.update.mockResolvedValue({ ...task, assigneeId: 'user1' });

      await taskResolvers.Mutation.updateTask(
        {} as never,
        { id: '1', input: { assigneeId: 'user1' } },
        ctx as never,
      );
      expect(ctx.prisma.task.update).toHaveBeenCalledWith({
        where: { id: '1' },
        data: { assigneeId: 'user1' },
      });
    });

    it('updateTask clears assigneeId with null', async () => {
      const ctx = createMockContext();
      const task = {
        id: '1',
        title: 'Task',
        projectId: 'p1',
        workspaceId: 'ws1',
        assigneeId: 'user1',
      };
      ctx.prisma.task.findUnique.mockResolvedValue(task);
      ctx.prisma.task.update.mockResolvedValue({ ...task, assigneeId: null });

      await taskResolvers.Mutation.updateTask(
        {} as never,
        { id: '1', input: { assigneeId: null } },
        ctx as never,
      );
      expect(ctx.prisma.task.update).toHaveBeenCalledWith({
        where: { id: '1' },
        data: { assigneeId: null },
      });
    });

    it('updateTask rejects non-member assignee', async () => {
      const ctx = createMockContext();
      const task = { id: '1', title: 'Task', projectId: 'p1', workspaceId: 'ws1' };
      ctx.prisma.task.findUnique.mockResolvedValue(task);
      ctx.prisma.workspaceMembership.findUnique
        .mockResolvedValueOnce(MEMBERSHIP) // requireTaskAccess membership check
        .mockResolvedValueOnce(null); // assignee membership check

      await expect(
        taskResolvers.Mutation.updateTask(
          {} as never,
          { id: '1', input: { assigneeId: 'nonmember' } },
          ctx as never,
        ),
      ).rejects.toThrow('Assignee must be a workspace member');
    });

    it('updateTask sets labelIds', async () => {
      const ctx = createMockContext();
      const task = { id: '1', title: 'Task', projectId: 'p1', workspaceId: 'ws1' };
      // First call: requireTaskAccess
      ctx.prisma.task.findUnique.mockResolvedValueOnce(task);
      // Second call: audit code fluent API for existing labels
      ctx.prisma.task.findUnique.mockReturnValueOnce({
        labels: vi.fn().mockResolvedValue([]),
      });
      ctx.prisma.label.findMany.mockResolvedValue([
        { id: 'l1', workspaceId: 'ws1', name: 'Bug' },
        { id: 'l2', workspaceId: 'ws1', name: 'Feature' },
      ]);
      ctx.prisma.task.update.mockResolvedValue(task);

      await taskResolvers.Mutation.updateTask(
        {} as never,
        { id: '1', input: { labelIds: ['l1', 'l2'] } },
        ctx as never,
      );
      expect(ctx.prisma.task.update).toHaveBeenCalledWith({
        where: { id: '1' },
        data: { labels: { set: [{ id: 'l1' }, { id: 'l2' }] } },
      });
    });
  });

  describe('Task', () => {
    it('project resolves the parent project', async () => {
      const ctx = createMockContext();
      const project = { id: 'p1', name: 'Project 1' };
      ctx.loaders.projectById.load.mockResolvedValue(project);

      const result = await taskResolvers.Task.project(
        { projectId: 'p1' } as never,
        {},
        ctx as never,
      );
      expect(result).toEqual(project);
      expect(ctx.loaders.projectById.load).toHaveBeenCalledWith('p1');
    });

    it('project resolves null when projectId is null', async () => {
      const ctx = createMockContext();

      const result = await taskResolvers.Task.project(
        { projectId: null } as never,
        {},
        ctx as never,
      );
      expect(result).toBeNull();
      expect(ctx.loaders.projectById.load).not.toHaveBeenCalled();
    });

    it('assignee resolves null when no assigneeId', async () => {
      const ctx = createMockContext();

      const result = await taskResolvers.Task.assignee!(
        { assigneeId: null } as never,
        {},
        ctx as never,
      );
      expect(result).toBeNull();
    });

    it('assignee resolves the user when assigneeId is set', async () => {
      const ctx = createMockContext();
      const user = { id: 'user1', name: 'Test User', email: 'test@test.com' };
      ctx.loaders.userById.load.mockResolvedValue(user);

      const result = await taskResolvers.Task.assignee!(
        { assigneeId: 'user1' } as never,
        {},
        ctx as never,
      );
      expect(result).toEqual(user);
      expect(ctx.loaders.userById.load).toHaveBeenCalledWith('user1');
    });

    it('labels resolves via DataLoader', async () => {
      const ctx = createMockContext();
      const labels = [{ id: 'l1', name: 'Bug', color: '#FF0000' }];
      ctx.loaders.labelsByTaskId.load.mockResolvedValue(labels);

      const result = await taskResolvers.Task.labels!({ id: 'task1' } as never, {}, ctx as never);
      expect(result).toEqual(labels);
      expect(ctx.loaders.labelsByTaskId.load).toHaveBeenCalledWith('task1');
    });
  });

  describe('Subscription', () => {
    it('taskChanged.resolve clears stale PR and label loader entries for the task', () => {
      const ctx = createMockContext();
      const payload = { id: 'task1', workspaceId: 'ws1' };

      const result = taskResolvers.Subscription.taskChanged.resolve(
        payload as never,
        {} as never,
        ctx as never,
      );

      expect(ctx.loaders.pullRequestsByTaskId.clear).toHaveBeenCalledWith('task1');
      expect(ctx.loaders.labelsByTaskId.clear).toHaveBeenCalledWith('task1');
      expect(result).toBe(payload);
    });
  });
});
