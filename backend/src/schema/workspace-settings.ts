import type { MutationResolvers } from '../__generated__/graphql.js';
import { requireWorkspaceOwner } from '../auth/workspace.js';

export const workspaceSettingsResolvers = {
  Mutation: {
    updateWorkspaceSettings: async (_parent, args, context) => {
      await requireWorkspaceOwner(context.prisma, args.workspaceId, context.userId);

      const data: Record<string, boolean> = {};
      if (args.input.autoCloseOnMerge != null) data.autoCloseOnMerge = args.input.autoCloseOnMerge;
      if (args.input.autoInReviewOnPrOpen != null)
        data.autoInReviewOnPrOpen = args.input.autoInReviewOnPrOpen;

      return context.prisma.workspaceSettings.upsert({
        where: { workspaceId: args.workspaceId },
        create: { workspaceId: args.workspaceId, ...data },
        update: data,
      });
    },
  } satisfies Pick<MutationResolvers, 'updateWorkspaceSettings'>,
};
