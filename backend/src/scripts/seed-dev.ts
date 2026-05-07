import { PrismaClient } from '@prisma/client';
import { hashPassword } from '../auth/password.js';

export const DEV_USER_EMAIL = 'dev@orca.local';
const DEV_USER_PASSWORD = 'dev-password';
const DEV_USER_NAME = 'Dev User';
const DEV_WORKSPACE_SLUG = 'dev';
const DEV_WORKSPACE_NAME = 'Personal';

export interface SeededDevUser {
  id: string;
  email: string;
  workspaceId: string;
  workspaceSlug: string;
}

export interface SeedDevUserOptions {
  /**
   * When true, always re-hash and write the password — used by `bun run seed:dev`
   * so the CLI is a deterministic password-reset escape hatch. The default (false)
   * skips the hash + upserts when the user, workspace, and membership already
   * exist, keeping the predev hot path fast (argon2 is intentionally slow).
   */
  forceResetPassword?: boolean;
}

export async function seedDevUser(
  prisma: PrismaClient,
  options: SeedDevUserOptions = {},
): Promise<SeededDevUser> {
  if (!options.forceResetPassword) {
    const existing = await prisma.user.findUnique({
      where: { email: DEV_USER_EMAIL },
      include: {
        memberships: {
          where: { workspace: { slug: DEV_WORKSPACE_SLUG } },
          include: { workspace: true },
        },
      },
    });
    if (existing && existing.memberships.length > 0) {
      const ws = existing.memberships[0].workspace;
      return {
        id: existing.id,
        email: existing.email,
        workspaceId: ws.id,
        workspaceSlug: ws.slug,
      };
    }
  }

  const passwordHash = await hashPassword(DEV_USER_PASSWORD);

  const user = await prisma.user.upsert({
    where: { email: DEV_USER_EMAIL },
    update: { name: DEV_USER_NAME, passwordHash },
    create: { email: DEV_USER_EMAIL, name: DEV_USER_NAME, passwordHash },
  });

  const workspace = await prisma.workspace.upsert({
    where: { slug: DEV_WORKSPACE_SLUG },
    create: {
      name: DEV_WORKSPACE_NAME,
      slug: DEV_WORKSPACE_SLUG,
      createdById: user.id,
      memberships: {
        create: {
          userId: user.id,
          role: 'OWNER',
        },
      },
    },
    update: {},
  });

  await prisma.workspaceMembership.upsert({
    where: { workspaceId_userId: { workspaceId: workspace.id, userId: user.id } },
    create: { workspaceId: workspace.id, userId: user.id, role: 'OWNER' },
    update: {},
  });

  return {
    id: user.id,
    email: user.email,
    workspaceId: workspace.id,
    workspaceSlug: workspace.slug,
  };
}

async function main() {
  const prisma = new PrismaClient();
  try {
    const seeded = await seedDevUser(prisma, { forceResetPassword: true });
    console.log('');
    console.log('Dev user ready:');
    console.log(`  Email:    ${seeded.email}`);
    console.log(`  Password: ${DEV_USER_PASSWORD}`);
    console.log(`  ID:       ${seeded.id}`);
    console.log(
      `  Workspace: ${DEV_WORKSPACE_NAME} (${seeded.workspaceSlug}) [id: ${seeded.workspaceId}]`,
    );
    console.log('');
  } finally {
    await prisma.$disconnect();
  }
}

if (import.meta.main) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
