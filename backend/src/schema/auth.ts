import { GraphQLError } from 'graphql';
import type { QueryResolvers, MutationResolvers } from '../__generated__/graphql.js';
import { hashPassword, verifyPassword } from '../auth/password.js';
import { signJwt } from '../auth/jwt.js';

function generateDefaultSlug(name: string): string {
  let slug = name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 64);

  if (slug.length < 3) {
    slug = `workspace-${Math.random().toString(36).slice(2, 8)}`;
  }

  return slug;
}

async function ensureUniqueSlug(
  prisma: { workspace: { findUnique: (args: { where: { slug: string } }) => Promise<unknown> } },
  baseSlug: string,
): Promise<string> {
  const existing = await prisma.workspace.findUnique({ where: { slug: baseSlug } });
  if (!existing) return baseSlug;
  const suffix = Math.random().toString(36).slice(2, 6);
  return `${baseSlug.slice(0, 59)}-${suffix}`;
}

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
      const workspaces = await context.prisma.workspace.findMany({
        where: { ownerId: user.id, deletedAt: null },
        orderBy: { createdAt: 'asc' },
      });
      return { token, user, workspaces };
    },
    register: async (_parent, args, context) => {
      const { email, name, password, inviteCode } = args.input;

      if (!process.env.INVITE_CODE || inviteCode !== process.env.INVITE_CODE) {
        throw new GraphQLError('Invalid invite code.', {
          extensions: { code: 'FORBIDDEN' },
        });
      }

      if (password.length < 8) {
        throw new GraphQLError('Password must be at least 8 characters.', {
          extensions: { code: 'BAD_USER_INPUT' },
        });
      }

      const existing = await context.prisma.user.findUnique({
        where: { email },
      });
      if (existing) {
        throw new GraphQLError('An account with this email already exists.', {
          extensions: { code: 'BAD_USER_INPUT' },
        });
      }

      const passwordHash = await hashPassword(password);
      const slug = await ensureUniqueSlug(context.prisma, generateDefaultSlug(name));

      const user = await context.prisma.user.create({
        data: {
          email,
          name,
          passwordHash,
          workspaces: {
            create: {
              name: 'Personal',
              slug,
            },
          },
        },
        include: { workspaces: true },
      });

      const token = await signJwt({ sub: user.id, email: user.email });
      return { token, user, workspaces: user.workspaces };
    },
  } satisfies Pick<MutationResolvers, 'login' | 'register'>,
};
