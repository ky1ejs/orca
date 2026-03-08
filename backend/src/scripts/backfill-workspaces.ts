/**
 * Backfill script for production migration.
 *
 * Run this BETWEEN Migration 1 (nullable workspaceId) and Migration 2 (NOT NULL).
 * It creates a "Personal" workspace for each user and assigns orphaned projects.
 *
 * Idempotent — safe to re-run.
 *
 * Usage: bun run src/scripts/backfill-workspaces.ts
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

function generateSlug(name: string): string {
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

async function backfill() {
  const users = await prisma.user.findMany();

  for (const user of users) {
    const slug = generateSlug(user.name);

    const workspace = await prisma.workspace.upsert({
      where: { slug },
      create: { name: 'Personal', slug, createdById: user.id },
      update: {},
    });

    // Assign orphaned projects using raw SQL since Prisma types
    // reflect the final schema (NOT NULL), but this runs during migration
    // when the column is still nullable.
    if (users.indexOf(user) === 0) {
      const result = await prisma.$executeRaw`
        UPDATE "Project" SET "workspaceId" = ${workspace.id}
        WHERE "workspaceId" IS NULL
      `;
      console.log(`Assigned ${result} orphaned projects to workspace ${workspace.id}`);
    }
  }

  // Verify no orphaned projects remain
  const orphaned = await prisma.$queryRaw<[{ count: bigint }]>`
    SELECT COUNT(*) as count FROM "Project" WHERE "workspaceId" IS NULL
  `;
  const count = Number(orphaned[0].count);
  if (count > 0) {
    console.error(`ERROR: ${count} projects still have no workspace`);
    process.exit(1);
  }

  console.log('Backfill complete');
}

backfill()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
