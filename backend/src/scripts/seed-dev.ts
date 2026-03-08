import { PrismaClient } from '@prisma/client';
import { hashPassword } from '../auth/password.js';

const prisma = new PrismaClient();

async function seedDev() {
  const email = 'dev@orca.local';
  const name = 'Dev User';
  const password = 'dev-password';

  const passwordHash = await hashPassword(password);

  const user = await prisma.user.upsert({
    where: { email },
    update: { name, passwordHash },
    create: { email, name, passwordHash },
  });

  const workspace = await prisma.workspace.upsert({
    where: { slug: 'dev' },
    create: {
      name: 'Personal',
      slug: 'dev',
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

  // Ensure membership exists (for existing workspaces)
  await prisma.workspaceMembership.upsert({
    where: { workspaceId_userId: { workspaceId: workspace.id, userId: user.id } },
    create: { workspaceId: workspace.id, userId: user.id, role: 'OWNER' },
    update: {},
  });

  console.log('');
  console.log('Dev user ready:');
  console.log(`  Email:    ${user.email}`);
  console.log(`  Password: ${password}`);
  console.log(`  ID:       ${user.id}`);
  console.log(`  Workspace: ${workspace.name} (${workspace.slug}) [id: ${workspace.id}]`);
  console.log('');
}

seedDev()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
