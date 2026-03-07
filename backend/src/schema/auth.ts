import { GraphQLError } from 'graphql';
import type { QueryResolvers, MutationResolvers } from '../__generated__/graphql.js';
import { verifyPassword } from '../auth/password.js';
import { signJwt } from '../auth/jwt.js';

export const authResolvers = {
  Query: {
    me: async (_parent, _args, context) => {
      const user = await context.prisma.user.findUnique({
        where: { id: context.userId },
      });
      if (!user) {
        throw new GraphQLError('User not found', {
          extensions: { code: 'UNAUTHENTICATED' },
        });
      }
      return user;
    },
  } satisfies Pick<QueryResolvers, 'me'>,
  Mutation: {
    login: async (_parent, args, context) => {
      const user = await context.prisma.user.findUnique({
        where: { email: args.email },
      });
      if (!user) {
        throw new GraphQLError('Incorrect email or password.', {
          extensions: { code: 'UNAUTHENTICATED' },
        });
      }
      const valid = await verifyPassword(args.password, user.passwordHash);
      if (!valid) {
        throw new GraphQLError('Incorrect email or password.', {
          extensions: { code: 'UNAUTHENTICATED' },
        });
      }
      const token = await signJwt({ sub: user.id, email: user.email });
      return { token, user };
    },
  } satisfies Pick<MutationResolvers, 'login'>,
};
