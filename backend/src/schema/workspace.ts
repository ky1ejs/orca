import { GraphQLError } from 'graphql';
import type {
  WorkspaceResolvers,
  QueryResolvers,
  MutationResolvers,
} from '../__generated__/graphql.js';
import { requireWorkspaceAccessBySlug, requireWorkspaceOwner } from '../auth/workspace.js';

const MAX_WORKSPACES_PER_USER = 10;

const RESERVED_SLUGS = new Set([
  'admin',
  'api',
  'app',
  'auth',
  'dashboard',
  'graphql',
  'health',
  'login',
  'new',
  'register',
  'settings',
  'signup',
  'system',
  'www',
  'null',
  'undefined',
]);

const SLUG_PATTERN = /^[a-z0-9][a-z0-9-]*[a-z0-9]$/;

function validateSlug(slug: string): void {
  if (slug.length < 3 || slug.length > 64) {
    throw new GraphQLError(
      'Workspace URL must be 3-64 characters, lowercase letters, numbers, and hyphens only',
      { extensions: { code: 'BAD_USER_INPUT' } },
    );
  }

  if (!SLUG_PATTERN.test(slug)) {
    throw new GraphQLError(
      'Workspace URL must be 3-64 characters, lowercase letters, numbers, and hyphens only',
      { extensions: { code: 'BAD_USER_INPUT' } },
    );
  }

  if (slug.includes('--')) {
    throw new GraphQLError(
      'Workspace URL must be 3-64 characters, lowercase letters, numbers, and hyphens only',
      { extensions: { code: 'BAD_USER_INPUT' } },
    );
  }

  if (RESERVED_SLUGS.has(slug)) {
    throw new GraphQLError('This workspace URL is reserved', {
      extensions: { code: 'BAD_USER_INPUT' },
    });
  }
}

export const workspaceResolvers = {
  Query: {
    workspaces: async (_parent, _args, context) => {
      const memberships = await context.prisma.workspaceMembership.findMany({
        where: { userId: context.userId },
        include: { workspace: true },
        orderBy: { createdAt: 'asc' },
      });

      return memberships.filter((m) => !m.workspace.deletedAt).map((m) => m.workspace);
    },
    workspace: async (_parent, args, context) => {
      const { workspace } = await requireWorkspaceAccessBySlug(
        context.prisma,
        args.slug,
        context.userId,
      );
      return workspace;
    },
  } satisfies Pick<QueryResolvers, 'workspaces' | 'workspace'>,
  Mutation: {
    createWorkspace: async (_parent, args, context) => {
      validateSlug(args.input.slug);

      const membershipCount = await context.prisma.workspaceMembership.count({
        where: {
          userId: context.userId,
          workspace: { deletedAt: null },
        },
      });
      if (membershipCount >= MAX_WORKSPACES_PER_USER) {
        throw new GraphQLError(`You can have at most ${MAX_WORKSPACES_PER_USER} workspaces`, {
          extensions: { code: 'BAD_USER_INPUT' },
        });
      }

      try {
        const workspace = await context.prisma.workspace.create({
          data: {
            name: args.input.name,
            slug: args.input.slug,
            createdById: context.userId,
            memberships: {
              create: {
                userId: context.userId,
                role: 'OWNER',
              },
            },
          },
        });
        return workspace;
      } catch (e: unknown) {
        if (e instanceof Error && e.message.includes('Unique constraint failed')) {
          throw new GraphQLError('This workspace URL is already taken', {
            extensions: { code: 'BAD_USER_INPUT' },
          });
        }
        throw e;
      }
    },
    updateWorkspace: async (_parent, args, context) => {
      await requireWorkspaceOwner(context.prisma, args.id, context.userId);

      const data: Record<string, unknown> = {};
      if (args.input.name != null) data.name = args.input.name;

      return context.prisma.workspace.update({
        where: { id: args.id },
        data,
      });
    },
    deleteWorkspace: async (_parent, args, context) => {
      const { workspace } = await requireWorkspaceOwner(context.prisma, args.id, context.userId);

      const activeMembershipCount = await context.prisma.workspaceMembership.count({
        where: {
          userId: context.userId,
          workspace: { deletedAt: null },
        },
      });
      if (activeMembershipCount <= 1) {
        throw new GraphQLError(
          'Cannot delete your only workspace. Create another workspace first.',
          { extensions: { code: 'BAD_USER_INPUT' } },
        );
      }

      const now = new Date();
      const mangledSlug = `${workspace.slug}-deleted-${Math.floor(now.getTime() / 1000)}`;

      await context.prisma.workspace.update({
        where: { id: args.id },
        data: { deletedAt: now, slug: mangledSlug },
      });

      console.log(
        JSON.stringify({
          event: 'workspace.deleted',
          workspaceId: workspace.id,
          userId: context.userId,
          timestamp: now.toISOString(),
        }),
      );

      return true;
    },
  } satisfies Pick<MutationResolvers, 'createWorkspace' | 'updateWorkspace' | 'deleteWorkspace'>,
  Workspace: {
    projects: (parent, _args, context) => {
      return context.prisma.project.findMany({
        where: { workspaceId: parent.id },
        orderBy: { createdAt: 'desc' },
      });
    },
    role: async (parent, _args, context) => {
      const membership = await context.prisma.workspaceMembership.findUnique({
        where: { workspaceId_userId: { workspaceId: parent.id, userId: context.userId } },
      });
      return membership?.role ?? 'MEMBER';
    },
    members: (parent, _args, context) => {
      return context.prisma.workspaceMembership.findMany({
        where: { workspaceId: parent.id },
        include: { user: true },
        orderBy: { createdAt: 'asc' },
      });
    },
    invitations: async (parent, _args, context) => {
      // Only OWNERs can see invitations
      const membership = await context.prisma.workspaceMembership.findUnique({
        where: { workspaceId_userId: { workspaceId: parent.id, userId: context.userId } },
      });
      if (!membership || membership.role !== 'OWNER') {
        return [];
      }

      return context.prisma.workspaceInvitation.findMany({
        where: {
          workspaceId: parent.id,
          expiresAt: { gt: new Date() },
        },
        include: {
          workspace: true,
          invitedBy: true,
        },
        orderBy: { createdAt: 'desc' },
      });
    },
  } satisfies WorkspaceResolvers,
};
