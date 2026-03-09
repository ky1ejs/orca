import { GraphQLError } from 'graphql';
import type { MutationResolvers, QueryResolvers } from '../__generated__/graphql.js';
import { requireWorkspaceOwner, requireWorkspaceAccess } from '../auth/workspace.js';

const MAX_MEMBERS_PER_WORKSPACE = 25;
const MAX_PENDING_INVITATIONS = 10;
const INVITATION_EXPIRY_DAYS = 7;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const membershipResolvers = {
  Query: {
    pendingInvitations: async (_parent, _args, context) => {
      const user = await context.prisma.user.findUnique({
        where: { id: context.userId },
        select: { email: true },
      });
      if (!user) {
        throw new GraphQLError('User not found', {
          extensions: { code: 'UNAUTHENTICATED' },
        });
      }

      return context.prisma.workspaceInvitation.findMany({
        where: {
          email: user.email,
          expiresAt: { gt: new Date() },
          workspace: { deletedAt: null },
        },
        include: {
          workspace: true,
          invitedBy: true,
        },
      });
    },
  } satisfies Pick<QueryResolvers, 'pendingInvitations'>,
  Mutation: {
    addMember: async (_parent, args, context) => {
      const { workspaceId, email, role: requestedRole } = args.input;
      const role = requestedRole ?? 'MEMBER';

      await requireWorkspaceOwner(context.prisma, workspaceId, context.userId);

      if (!EMAIL_PATTERN.test(email)) {
        throw new GraphQLError('Please enter a valid email address', {
          extensions: { code: 'BAD_USER_INPUT' },
        });
      }

      // Check member limit
      const memberCount = await context.prisma.workspaceMembership.count({
        where: { workspaceId },
      });
      if (memberCount >= MAX_MEMBERS_PER_WORKSPACE) {
        throw new GraphQLError(
          `This workspace has reached the maximum number of members (${MAX_MEMBERS_PER_WORKSPACE})`,
          { extensions: { code: 'BAD_USER_INPUT' } },
        );
      }

      // Look up user by email
      const targetUser = await context.prisma.user.findUnique({
        where: { email },
      });

      if (targetUser) {
        // Self-invite check
        if (targetUser.id === context.userId) {
          throw new GraphQLError('You are already a member of this workspace', {
            extensions: { code: 'BAD_USER_INPUT' },
          });
        }

        // Check if already a member
        const existingMembership = await context.prisma.workspaceMembership.findUnique({
          where: { workspaceId_userId: { workspaceId, userId: targetUser.id } },
        });
        if (existingMembership) {
          throw new GraphQLError('This user is already a member of this workspace', {
            extensions: { code: 'BAD_USER_INPUT' },
          });
        }
      }

      // Shared invitation path for both existing and non-existing users
      // Check pending invitation limit
      const pendingCount = await context.prisma.workspaceInvitation.count({
        where: { workspaceId, expiresAt: { gt: new Date() } },
      });
      if (pendingCount >= MAX_PENDING_INVITATIONS) {
        throw new GraphQLError(
          `This workspace has reached the maximum number of pending invitations (${MAX_PENDING_INVITATIONS})`,
          { extensions: { code: 'BAD_USER_INPUT' } },
        );
      }

      // Check for existing non-expired invitation
      const existingInvitation = await context.prisma.workspaceInvitation.findFirst({
        where: { workspaceId, email, expiresAt: { gt: new Date() } },
      });
      if (existingInvitation) {
        throw new GraphQLError('An invitation has already been sent to this email', {
          extensions: { code: 'BAD_USER_INPUT' },
        });
      }

      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + INVITATION_EXPIRY_DAYS);

      const invitation = await context.prisma.workspaceInvitation.create({
        data: {
          workspaceId,
          email,
          role,
          invitedById: context.userId,
          expiresAt,
        },
        include: {
          workspace: true,
          invitedBy: true,
        },
      });

      const message = targetUser
        ? `Invitation sent to ${email}. They will be notified in Orca.`
        : `Invitation saved. ${email} will be added when they create an Orca account. Let them know to sign up.`;

      return {
        __typename: 'InvitationCreated' as const,
        invitation,
        message,
      };
    },

    removeMember: async (_parent, args, context) => {
      const { workspaceId, userId: targetUserId } = args;
      const isSelfRemoval = targetUserId === context.userId;

      if (isSelfRemoval) {
        // Self-removal: just need to be a member
        await requireWorkspaceAccess(context.prisma, workspaceId, context.userId);
      } else {
        // Removing others: need to be OWNER
        await requireWorkspaceOwner(context.prisma, workspaceId, context.userId);
      }

      const membership = await context.prisma.workspaceMembership.findUnique({
        where: { workspaceId_userId: { workspaceId, userId: targetUserId } },
      });
      if (!membership) {
        throw new GraphQLError('Member not found', {
          extensions: { code: 'NOT_FOUND' },
        });
      }

      // Last OWNER protection
      if (membership.role === 'OWNER') {
        await context.prisma.$transaction(async (tx) => {
          await tx.$queryRaw`
            SELECT id FROM "WorkspaceMembership"
            WHERE "workspaceId" = ${workspaceId} AND "role"::"WorkspaceRole" = 'OWNER'
            FOR UPDATE
          `;

          const ownerCount = await tx.workspaceMembership.count({
            where: { workspaceId, role: 'OWNER' },
          });

          if (ownerCount <= 1) {
            const msg = isSelfRemoval
              ? 'You are the last owner of this workspace. Transfer ownership to another member before leaving.'
              : 'Cannot remove the last owner. Transfer ownership to another member first.';
            throw new GraphQLError(msg, {
              extensions: { code: 'BAD_USER_INPUT' },
            });
          }

          await tx.workspaceMembership.delete({
            where: { id: membership.id },
          });
        });
      } else {
        await context.prisma.workspaceMembership.delete({
          where: { id: membership.id },
        });
      }

      return true;
    },

    updateMemberRole: async (_parent, args, context) => {
      const { workspaceId, userId: targetUserId, role: newRole } = args.input;

      await requireWorkspaceOwner(context.prisma, workspaceId, context.userId);

      const membership = await context.prisma.workspaceMembership.findUnique({
        where: { workspaceId_userId: { workspaceId, userId: targetUserId } },
      });
      if (!membership) {
        throw new GraphQLError('Member not found', {
          extensions: { code: 'NOT_FOUND' },
        });
      }

      // Demoting an OWNER — check last OWNER protection
      if (membership.role === 'OWNER' && newRole === 'MEMBER') {
        await context.prisma.$transaction(async (tx) => {
          await tx.$queryRaw`
            SELECT id FROM "WorkspaceMembership"
            WHERE "workspaceId" = ${workspaceId} AND "role"::"WorkspaceRole" = 'OWNER'
            FOR UPDATE
          `;

          const ownerCount = await tx.workspaceMembership.count({
            where: { workspaceId, role: 'OWNER' },
          });

          if (ownerCount <= 1) {
            throw new GraphQLError(
              'Cannot demote the last owner. Promote another member to owner first.',
              { extensions: { code: 'BAD_USER_INPUT' } },
            );
          }

          await tx.workspaceMembership.update({
            where: { id: membership.id },
            data: { role: newRole },
          });
        });

        return context.prisma.workspaceMembership.findUniqueOrThrow({
          where: { id: membership.id },
          include: { user: true },
        });
      }

      return context.prisma.workspaceMembership.update({
        where: { id: membership.id },
        data: { role: newRole },
        include: { user: true },
      });
    },

    cancelInvitation: async (_parent, args, context) => {
      const invitation = await context.prisma.workspaceInvitation.findUnique({
        where: { id: args.id },
      });
      if (!invitation) {
        throw new GraphQLError('Invitation not found', {
          extensions: { code: 'NOT_FOUND' },
        });
      }

      await requireWorkspaceOwner(context.prisma, invitation.workspaceId, context.userId);

      await context.prisma.workspaceInvitation.delete({
        where: { id: args.id },
      });

      return true;
    },

    acceptInvitation: async (_parent, args, context) => {
      const invitation = await context.prisma.workspaceInvitation.findUnique({
        where: { id: args.id },
        include: { workspace: true },
      });
      if (!invitation) {
        throw new GraphQLError('Invitation not found', {
          extensions: { code: 'NOT_FOUND' },
        });
      }

      // Verify email matches
      const user = await context.prisma.user.findUniqueOrThrow({
        where: { id: context.userId },
      });
      if (invitation.email !== user.email) {
        throw new GraphQLError('Invitation not found', {
          extensions: { code: 'NOT_FOUND' },
        });
      }

      // Check expiry
      if (invitation.expiresAt <= new Date()) {
        throw new GraphQLError(
          'This invitation has expired. Ask the workspace owner to send a new one.',
          { extensions: { code: 'BAD_USER_INPUT' } },
        );
      }

      // Check workspace not deleted
      if (invitation.workspace.deletedAt) {
        throw new GraphQLError('Workspace not found', {
          extensions: { code: 'NOT_FOUND' },
        });
      }

      // Check member limit
      const memberCount = await context.prisma.workspaceMembership.count({
        where: { workspaceId: invitation.workspaceId },
      });
      if (memberCount >= MAX_MEMBERS_PER_WORKSPACE) {
        throw new GraphQLError(
          `This workspace has reached the maximum number of members (${MAX_MEMBERS_PER_WORKSPACE})`,
          { extensions: { code: 'BAD_USER_INPUT' } },
        );
      }

      await context.prisma.$transaction(async (tx) => {
        // Create membership (ON CONFLICT DO NOTHING via upsert)
        await tx.workspaceMembership.upsert({
          where: {
            workspaceId_userId: {
              workspaceId: invitation.workspaceId,
              userId: context.userId,
            },
          },
          create: {
            workspaceId: invitation.workspaceId,
            userId: context.userId,
            role: invitation.role,
          },
          update: {},
        });

        // Delete the invitation
        await tx.workspaceInvitation.delete({
          where: { id: invitation.id },
        });
      });

      return invitation.workspace;
    },

    declineInvitation: async (_parent, args, context) => {
      const invitation = await context.prisma.workspaceInvitation.findUnique({
        where: { id: args.id },
      });
      if (!invitation) {
        throw new GraphQLError('Invitation not found', {
          extensions: { code: 'NOT_FOUND' },
        });
      }

      // Verify email matches
      const user = await context.prisma.user.findUniqueOrThrow({
        where: { id: context.userId },
      });
      if (invitation.email !== user.email) {
        throw new GraphQLError('Invitation not found', {
          extensions: { code: 'NOT_FOUND' },
        });
      }

      await context.prisma.workspaceInvitation.delete({
        where: { id: args.id },
      });

      return true;
    },
  } satisfies Pick<
    MutationResolvers,
    | 'addMember'
    | 'removeMember'
    | 'updateMemberRole'
    | 'cancelInvitation'
    | 'acceptInvitation'
    | 'declineInvitation'
  >,
};
