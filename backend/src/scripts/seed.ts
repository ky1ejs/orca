import { parseArgs } from 'node:util';
import { PrismaClient } from '@prisma/client';
import { hashPassword } from '../auth/password.js';

const prisma = new PrismaClient();

async function seed() {
  const { values } = parseArgs({
    options: {
      email: { type: 'string' },
      name: { type: 'string' },
      password: { type: 'string' },
    },
  });

  if (!values.email || !values.name || !values.password) {
    console.error('Usage: bun run seed --email <email> --name <name> --password <password>');
    process.exit(1);
  }

  const passwordHash = await hashPassword(values.password);

  const user = await prisma.user.upsert({
    where: { email: values.email },
    update: { name: values.name, passwordHash },
    create: { email: values.email, name: values.name, passwordHash },
  });

  const slug = values.name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 64);

  const workspace = await prisma.workspace.upsert({
    where: { slug },
    create: {
      name: 'Personal',
      slug,
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

  console.log(`User ${user.email} (${user.name}) created/updated [id: ${user.id}]`);
  console.log(`Workspace "${workspace.name}" (${workspace.slug}) ready [id: ${workspace.id}]`);
}

seed()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
