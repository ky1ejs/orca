import { GraphQLError } from 'graphql';
import type { Prisma } from '@prisma/client';
import type {
  AuditEventResolvers,
  QueryResolvers,
  TaskResolvers,
  ProjectResolvers,
  InitiativeResolvers,
} from '../__generated__/graphql.js';
import { requireWorkspaceAccess } from '../auth/workspace.js';
import type { ServerContext } from '../context.js';

const MAX_PAGE_SIZE = 100;

function encodeCursor(event: { createdAt: Date; id: string }): string {
  return Buffer.from(`${event.createdAt.toISOString()}|${event.id}`).toString('base64url');
}

function decodeCursor(cursor: string): { createdAt: Date; id: string } {
  const decoded = Buffer.from(cursor, 'base64url').toString();
  const separatorIndex = decoded.indexOf('|');
  if (separatorIndex === -1) {
    throw new GraphQLError('Invalid cursor', { extensions: { code: 'BAD_USER_INPUT' } });
  }
  const iso = decoded.slice(0, separatorIndex);
  const id = decoded.slice(separatorIndex + 1);
  const createdAt = new Date(iso);
  if (isNaN(createdAt.getTime()) || !id) {
    throw new GraphQLError('Invalid cursor', { extensions: { code: 'BAD_USER_INPUT' } });
  }
  return { createdAt, id };
}

async function queryAuditEvents(
  prisma: ServerContext['prisma'],
  where: Prisma.AuditEventWhereInput,
  first: number,
  after?: string | null,
) {
  const take = Math.max(1, Math.min(first, MAX_PAGE_SIZE));
  const orderBy: Prisma.AuditEventOrderByWithRelationInput[] = [
    { createdAt: 'desc' },
    { id: 'desc' },
  ];

  const whereClause: Prisma.AuditEventWhereInput = { ...where };
  if (after) {
    const cursor = decodeCursor(after);
    whereClause.OR = [
      { createdAt: { lt: cursor.createdAt } },
      { createdAt: cursor.createdAt, id: { lt: cursor.id } },
    ];
  }

  const events = await prisma.auditEvent.findMany({
    where: whereClause,
    orderBy,
    take: take + 1,
  });

  const hasNextPage = events.length > take;
  const nodes = hasNextPage ? events.slice(0, take) : events;

  return {
    edges: nodes.map((event) => ({
      node: event,
      cursor: encodeCursor(event),
    })),
    pageInfo: {
      hasNextPage,
      endCursor: nodes.length > 0 ? encodeCursor(nodes[nodes.length - 1]) : null,
    },
  };
}

export const auditEventResolvers = {
  Query: {
    auditEvents: async (_parent, args, context) => {
      await requireWorkspaceAccess(context.prisma, args.workspaceId, context.userId);

      if (args.entityId && !args.entityType) {
        throw new GraphQLError('entityType is required when entityId is provided', {
          extensions: { code: 'BAD_USER_INPUT' },
        });
      }

      const where: Prisma.AuditEventWhereInput = {
        workspaceId: args.workspaceId,
      };
      if (args.entityType) where.entityType = args.entityType;
      if (args.entityId) where.entityId = args.entityId;

      return queryAuditEvents(context.prisma, where, args.first ?? 20, args.after);
    },
  } satisfies Pick<QueryResolvers, 'auditEvents'>,
  AuditEvent: {
    actor: async (parent, _args, context) => {
      if (parent.actorType === 'SYSTEM') {
        return { __typename: 'SystemActor' as const, label: 'System' };
      }
      if (parent.actorId) {
        const user = await context.prisma.user.findUnique({ where: { id: parent.actorId } });
        if (user) return user;
      }
      return { __typename: 'SystemActor' as const, label: 'Deleted user' };
    },
    changes: (parent) => {
      const raw = parent.changes as Array<{
        field: string;
        oldValue: string | null;
        newValue: string | null;
      }>;
      return raw;
    },
  } satisfies AuditEventResolvers,
  Task: {
    activity: async (parent, args, context) => {
      return queryAuditEvents(
        context.prisma,
        { entityType: 'TASK', entityId: parent.id },
        args.first ?? 20,
        args.after,
      );
    },
  } satisfies Pick<TaskResolvers, 'activity'>,
  Project: {
    activity: async (parent, args, context) => {
      return queryAuditEvents(
        context.prisma,
        { entityType: 'PROJECT', entityId: parent.id },
        args.first ?? 20,
        args.after,
      );
    },
  } satisfies Pick<ProjectResolvers, 'activity'>,
  Initiative: {
    activity: async (parent, args, context) => {
      return queryAuditEvents(
        context.prisma,
        { entityType: 'INITIATIVE', entityId: parent.id },
        args.first ?? 20,
        args.after,
      );
    },
  } satisfies Pick<InitiativeResolvers, 'activity'>,
};
