# Workspaces: Single-User Partitioning (Phase 1)

## Overview

Add Workspaces to Orca so that a single user can partition their work into separate containers (e.g., one per company or client). Each workspace owns its own set of projects, tasks, and (eventually) members.

This spec covers **Phase 1: single-user workspaces** only. Multi-user collaboration (invitations, roles, shared access) is deferred to Phase 2 and explicitly out of scope here. The data model is designed so that Phase 2 can be added without further schema migrations to the core Workspace table.

## Phasing

| | Phase 1 (this spec) | Phase 2 (future) |
|---|---|---|
| **Workspace CRUD** | Yes | -- |
| **workspaceId on Project** | Yes | -- |
| **Scoped queries** | Yes | -- |
| **Workspace switcher UI** | Yes | -- |
| **Slug-based URLs** | Yes | -- |
| **Authorization (owner-only)** | Yes | Extend to membership |
| **Soft-delete** | Yes | -- |
| **WorkspaceMembership** | No | Yes |
| **Invitations** | No | Yes |
| **Roles (OWNER/MEMBER)** | No | Yes |
| **Member management mutations** | No | Yes |

## Data Model

### Prisma Schema Changes

```prisma
model Workspace {
  id        String    @id @default(cuid())
  name      String
  slug      String    @unique
  ownerId   String
  owner     User      @relation(fields: [ownerId], references: [id])
  projects  Project[]
  deletedAt DateTime?
  createdAt DateTime  @default(now())
  updatedAt DateTime  @updatedAt

  @@index([ownerId])
}

model User {
  id           String      @id @default(cuid())
  email        String      @unique
  passwordHash String
  name         String
  workspaces   Workspace[]
  createdAt    DateTime    @default(now())
  updatedAt    DateTime    @updatedAt
}

model Project {
  id          String    @id @default(cuid())
  name        String
  description String?
  workspaceId String
  workspace   Workspace @relation(fields: [workspaceId], references: [id])
  tasks       Task[]
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt

  @@index([workspaceId])
}
```

Task remains unchanged (it belongs to a Project, which belongs to a Workspace).

### Design Decisions

- **`ownerId` on Workspace, not a join table**: In Phase 1, a workspace has exactly one owner. The `ownerId` column is simple and sufficient. Phase 2 will add a `WorkspaceMembership` join table for multi-user access; `ownerId` will remain as a denormalized "creator/billing owner" field.
- **`deletedAt` for soft-delete**: Deleting a workspace sets `deletedAt` to the current timestamp. Soft-deleted workspaces are excluded from all queries via centralized access helpers (never raw `findMany`). A background job or manual process can hard-delete after a 30-day grace period. This prevents accidental irreversible data loss.
- **`slug` is immutable**: Once set at creation, a workspace's slug cannot be changed. This prevents link rot. The UI will call this field "workspace URL" (not "slug").
- **`ON DELETE RESTRICT` on Workspace -> User FK**: Deleting a user who owns any workspaces (including soft-deleted ones) will fail at the database level. This is intentional — user deletion must first handle workspace ownership transfer or hard-deletion. No user deletion flow exists today; this is a known constraint to address if one is added.
- **Slug reuse after soft-delete**: On soft-delete, the slug is mangled (e.g., `acme` becomes `acme-deleted-1709856000`) to free it up for reuse while preserving the original value in the record.
- **Phase 2 note — Task auth traversal**: `requireTaskAccess` currently joins Task -> Project -> Workspace. When Phase 2 adds a membership table, this becomes a 4-table traversal. Consider denormalizing `workspaceId` onto Task or caching workspace membership in the request context at that point.

### Slug Validation Rules

- Lowercase alphanumeric and hyphens only: `/^[a-z0-9][a-z0-9-]*[a-z0-9]$/` (must start and end with alphanumeric)
- Length: 3 to 64 characters
- No consecutive hyphens (`--`)
- Reserved word blocklist: `admin`, `api`, `app`, `auth`, `dashboard`, `graphql`, `health`, `login`, `new`, `register`, `settings`, `signup`, `system`, `www`, `null`, `undefined`
- Validated server-side in the `createWorkspace` mutation; returns a `BAD_USER_INPUT` error on violation
- Uniqueness enforced by the database `@unique` constraint

## GraphQL Schema Changes

### Types

```graphql
type Workspace {
  id: ID!
  name: String!
  slug: String!
  projects: [Project!]!
  createdAt: String!
  updatedAt: String!
}
```

Note: `ownerId`, `deletedAt` are not exposed in the GraphQL type. The owner is implicitly the authenticated user (Phase 1). `deletedAt` is an internal field.

`projects` is a field on `Workspace` rather than a top-level query — this is a more natural GraphQL pattern and scopes data access at the type level.

### Updated Project Type

```graphql
type Project {
  id: ID!
  name: String!
  description: String
  workspaceId: ID!
  workspace: Workspace!
  tasks: [Task!]!
  createdAt: String!
  updatedAt: String!
}
```

### Inputs

```graphql
input CreateWorkspaceInput {
  name: String!
  slug: String!
}

input UpdateWorkspaceInput {
  name: String
}

input CreateProjectInput {
  name: String!
  description: String
  workspaceId: ID!
}
```

Note: `UpdateWorkspaceInput` deliberately omits `slug` (immutable). `CreateProjectInput` now requires `workspaceId`.

### Queries

```graphql
type Query {
  me: User!
  workspace(slug: String!): Workspace
  workspaces: [Workspace!]!
  project(id: ID!): Project
  task(id: ID!): Task
}
```

Changes from current schema:
- **Added**: `workspace(slug)`, `workspaces`
- **Removed**: `projects` top-level query (replaced by `workspace.projects`)
- **Removed**: `tasks(projectId)` top-level query (use `project.tasks` instead)
- **Kept**: `project(id)` and `task(id)` for direct deep-linking; both enforce workspace ownership

**Deploy note**: The old `projects` and `tasks(projectId)` queries are kept through migration steps 1-3 (filtered by the user's workspaces) and only removed in step 4 alongside the new client code. This avoids deploy ordering issues.

### Mutations

```graphql
type Mutation {
  login(email: String!, password: String!): AuthPayload!
  register(input: RegisterInput!): AuthPayload!

  createWorkspace(input: CreateWorkspaceInput!): Workspace!
  updateWorkspace(id: ID!, input: UpdateWorkspaceInput!): Workspace!
  deleteWorkspace(id: ID!): Boolean!

  createProject(input: CreateProjectInput!): Project!
  updateProject(id: ID!, input: UpdateProjectInput!): Project!
  deleteProject(id: ID!): Boolean!

  createTask(input: CreateTaskInput!): Task!
  updateTask(id: ID!, input: UpdateTaskInput!): Task!
  deleteTask(id: ID!): Boolean!
}
```

### Subscriptions

```graphql
type Subscription {
  projectChanged(workspaceId: ID!): Project!
  taskChanged(workspaceId: ID!): Task!
}
```

Subscriptions now require a `workspaceId` argument. The server validates that the subscribing user owns the workspace before establishing the subscription, and filters events to only those belonging to the specified workspace.

## Authorization

### Deny-by-Default Architecture

The existing `useAuth()` plugin in `backend/src/index.ts` already enforces authentication at the plugin level (deny-by-default for all operations except `login` and `register`). This spec extends that pattern to workspace-scoped authorization.

### Implementation: Centralized Access Helpers

A new `requireWorkspaceAccess` function is added to a `backend/src/auth/workspace.ts` module. All workspace queries must go through these helpers — never raw `prisma.workspace.findMany`.

```typescript
// backend/src/auth/workspace.ts
import { GraphQLError } from 'graphql';
import type { PrismaClient } from '@prisma/client';

/**
 * Verifies that the given workspace exists, is not soft-deleted,
 * and is owned by the requesting user.
 *
 * Returns the workspace if valid. Throws NOT_FOUND for both
 * missing and unauthorized workspaces (prevents IDOR leaks).
 */
export async function requireWorkspaceAccess(
  prisma: PrismaClient,
  workspaceId: string,
  userId: string,
) {
  const workspace = await prisma.workspace.findUnique({
    where: { id: workspaceId },
  });

  if (!workspace || workspace.deletedAt || workspace.ownerId !== userId) {
    throw new GraphQLError('Workspace not found', {
      extensions: { code: 'NOT_FOUND' },
    });
  }

  return workspace;
}

/**
 * Same as requireWorkspaceAccess but looks up workspace
 * from a project ID (for project/task mutations).
 */
export async function requireProjectAccess(
  prisma: PrismaClient,
  projectId: string,
  userId: string,
) {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: { workspace: true },
  });

  if (
    !project ||
    !project.workspace ||
    project.workspace.deletedAt ||
    project.workspace.ownerId !== userId
  ) {
    throw new GraphQLError('Project not found', {
      extensions: { code: 'NOT_FOUND' },
    });
  }

  return project;
}

/**
 * Same pattern for task access — resolves task -> project -> workspace.
 */
export async function requireTaskAccess(
  prisma: PrismaClient,
  taskId: string,
  userId: string,
) {
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    include: { project: { include: { workspace: true } } },
  });

  if (
    !task ||
    !task.project.workspace ||
    task.project.workspace.deletedAt ||
    task.project.workspace.ownerId !== userId
  ) {
    throw new GraphQLError('Task not found', {
      extensions: { code: 'NOT_FOUND' },
    });
  }

  return task;
}
```

### Key Security Properties

1. **Consistent "not found" responses**: Whether a resource doesn't exist or the user lacks access, the error is always `NOT_FOUND`. This prevents enumeration attacks (IDOR).
2. **Soft-deleted workspaces are invisible**: All access helpers check `deletedAt` and treat soft-deleted workspaces as nonexistent.
3. **Every resolver that touches data must call an access helper**: This is enforced by code review and tests. There is no resource that can be accessed without going through `requireWorkspaceAccess`, `requireProjectAccess`, or `requireTaskAccess`.
4. **Authentication remains at the plugin level**: The existing `useAuth()` plugin continues to reject unauthenticated requests before resolvers run. Authorization (workspace ownership) is checked within resolvers.

### Resolver Authorization Matrix

| Resolver | Access Check |
|---|---|
| `workspaces` | Filter by `ownerId = userId`, exclude `deletedAt != null` |
| `workspace(slug)` | Query by slug, verify `ownerId = userId` and not deleted |
| `createWorkspace` | No access check needed (creates new resource for `userId`) |
| `updateWorkspace(id)` | `requireWorkspaceAccess(id, userId)` |
| `deleteWorkspace(id)` | `requireWorkspaceAccess(id, userId)` |
| `workspace.projects` | Parent already authorized; filter `workspaceId` |
| `createProject` | `requireWorkspaceAccess(input.workspaceId, userId)` |
| `updateProject(id)` | `requireProjectAccess(id, userId)` |
| `deleteProject(id)` | `requireProjectAccess(id, userId)` |
| `project(id)` | `requireProjectAccess(id, userId)` |
| `createTask` | `requireProjectAccess(input.projectId, userId)` |
| `updateTask(id)` | `requireTaskAccess(id, userId)` |
| `deleteTask(id)` | `requireTaskAccess(id, userId)` |
| `task(id)` | `requireTaskAccess(id, userId)` |
| `projectChanged(workspaceId)` | `requireWorkspaceAccess(workspaceId, userId)` on subscribe |
| `taskChanged(workspaceId)` | `requireWorkspaceAccess(workspaceId, userId)` on subscribe |

### Subscription Authorization

Subscriptions validate workspace ownership when the subscription is established. Additionally, each event is filtered server-side: the resolver checks that the emitted project/task belongs to the subscribed `workspaceId` before forwarding to the client. This handles the edge case where ownership changes between subscribe-time and event-time (more relevant for Phase 2, but the pattern is established now).

```typescript
// Subscription pattern
projectChanged: {
  subscribe: async (_parent, args, context) => {
    await requireWorkspaceAccess(context.prisma, args.workspaceId, context.userId);
    return context.pubsub.subscribe('projectChanged');
  },
  resolve: (payload: Project, args: { workspaceId: string }) => {
    // Filter: only forward events for this workspace
    if (payload.workspaceId !== args.workspaceId) return null;
    return payload;
  },
},
```

## Registration Flow

### Auto-Create Default Workspace

When a user registers, a default workspace named "Personal" is automatically created in the same transaction:

```typescript
// In auth.ts register mutation
const user = await context.prisma.user.create({
  data: {
    email,
    name,
    passwordHash,
    workspaces: {
      create: {
        name: 'Personal',
        slug: generateDefaultSlug(name), // e.g., "kyle-smith" from "Kyle Smith"
      },
    },
  },
  include: { workspaces: true },
});
```

**Default slug generation**: Derived from the user's name, lowercased, spaces replaced with hyphens, non-alphanumeric characters stripped, truncated to 64 chars. If a collision occurs, append a random 4-character suffix (e.g., `kyle-smith-a3f9`). If the generated slug fails validation (e.g., name is too short), use `workspace-<random-6-chars>`.

### Login Response Change

The `AuthPayload` type is extended to include the user's workspaces so the client can immediately navigate to one:

```graphql
type AuthPayload {
  token: String!
  user: User!
  workspaces: [Workspace!]!
}
```

### Seed Scripts

Both `seed.ts` and `seed-dev.ts` must be updated to create a default workspace for the seeded user (or ensure one exists via upsert).

## Workspace Deletion (Soft-Delete)

### Behavior

`deleteWorkspace` sets `deletedAt = now()` and mangles the slug (appending `-deleted-{unix-timestamp}`) to free it for reuse. It does **not** delete any data.

- All queries filter out workspaces where `deletedAt IS NOT NULL` via the centralized access helpers.
- Projects and tasks within a soft-deleted workspace become inaccessible through normal queries.
- A user cannot delete their last workspace. The mutation returns an error: "Cannot delete your only workspace. Create another workspace first."

### Hard-Delete (Future / Manual)

Hard deletion (actually removing rows) is deferred. For now, an operator can run a manual SQL query or a future background job to purge workspaces where `deletedAt < now() - interval '30 days'`. This does not need to be automated in Phase 1.

### Audit Logging

When a workspace is soft-deleted, log the event:

```typescript
console.log(JSON.stringify({
  event: 'workspace.deleted',
  workspaceId: workspace.id,
  userId: context.userId,
  timestamp: new Date().toISOString(),
}));
```

## Migration Strategy

### Problem

The `Project` table currently has no `workspaceId`. We need to:
1. Create the `Workspace` table
2. Add `workspaceId` to `Project` (initially nullable)
3. Backfill all existing projects into default workspaces
4. Make `workspaceId` NOT NULL

This must be done safely in production with zero downtime.

### Deploy Sequence: Four Separate Deploys

| Step | Action | Verification | Rollback |
|---|---|---|---|
| 1 | Deploy code that handles nullable `workspaceId` (reads: fall back gracefully; writes: always set `workspaceId`). Apply Migration 1: create Workspace table, add nullable `workspaceId` to Project. Keep old `projects`/`tasks` top-level queries working. | `Workspace` table exists. `Project.workspaceId` column exists and is nullable. | Drop `workspaceId` column, drop `Workspace` table, revert code. |
| 2 | Run backfill script: `bun run src/scripts/backfill-workspaces.ts` | `SELECT COUNT(*) FROM "Project" WHERE "workspaceId" IS NULL` returns 0. Every user has at least one workspace. | Column still nullable. Safe to revert code (old code ignores `workspaceId`). |
| 3 | Apply Migration 2: make `workspaceId` NOT NULL. | `\d "Project"` shows `workspaceId` as `NOT NULL`. | `ALTER TABLE "Project" ALTER COLUMN "workspaceId" DROP NOT NULL`. Revert code to nullable-aware version. |
| 4 | Deploy full Phase 1 feature: workspace UI, updated queries, remove old `projects`/`tasks` top-level queries. | End-to-end smoke test: create workspace, create project in workspace, verify scoping. | Standard code revert. Data model is stable. |

### Migration 1: Schema Changes

```sql
-- CreateTable: Workspace
CREATE TABLE "Workspace" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Workspace_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Workspace_slug_key" ON "Workspace"("slug");
CREATE INDEX "Workspace_ownerId_idx" ON "Workspace"("ownerId");

ALTER TABLE "Workspace" ADD CONSTRAINT "Workspace_ownerId_fkey"
    FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Add nullable workspaceId to Project
ALTER TABLE "Project" ADD COLUMN "workspaceId" TEXT;
CREATE INDEX "Project_workspaceId_idx" ON "Project"("workspaceId");

ALTER TABLE "Project" ADD CONSTRAINT "Project_workspaceId_fkey"
    FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
```

### Backfill Script

The backfill script (`backend/src/scripts/backfill-workspaces.ts`) is **idempotent** — safe to re-run if it partially fails. It uses upserts and only updates projects where `workspaceId IS NULL`.

```typescript
async function backfill() {
  const users = await prisma.user.findMany();

  for (const user of users) {
    const slug = generateSlug(user.name);

    // Upsert: if this user already has a workspace from a prior run, skip
    const workspace = await prisma.workspace.upsert({
      where: { slug },
      create: { name: 'Personal', slug, ownerId: user.id },
      update: {},
    });

    // Only assign orphaned projects (workspaceId IS NULL)
    // Since projects currently have no user association,
    // assign all null-workspace projects to the first user's workspace
    if (users.indexOf(user) === 0) {
      const updated = await prisma.project.updateMany({
        where: { workspaceId: null },
        data: { workspaceId: workspace.id },
      });
      console.log(`Assigned ${updated.count} orphaned projects to workspace ${workspace.id}`);
    }
  }

  // Verify: no orphaned projects remain
  const orphaned = await prisma.project.count({ where: { workspaceId: null } });
  if (orphaned > 0) {
    console.error(`ERROR: ${orphaned} projects still have no workspace`);
    process.exit(1);
  }

  console.log('Backfill complete');
}
```

### Migration 2: NOT NULL Constraint

```sql
ALTER TABLE "Project" ALTER COLUMN "workspaceId" SET NOT NULL;
```

### Why Separate Deploys?

Combining schema change, data backfill, and constraint enforcement in one migration is dangerous:
- If the backfill fails partway through, the NOT NULL constraint fails and the migration rolls back entirely.
- The `prisma migrate deploy` command in `bun run start` would run all pending migrations on every deploy, making it impossible to verify the backfill between steps.
- Separating them allows each step to be verified independently.

## Client Changes

### Workspace Context

Add a `WorkspaceProvider` context that tracks the currently active workspace:

```typescript
// web/src/renderer/workspace/context.tsx
interface WorkspaceContextValue {
  currentWorkspace: Workspace | null;
  workspaces: Workspace[];
  switchWorkspace: (slug: string) => void;
  loading: boolean;
}
```

The active workspace slug is persisted in `localStorage` (key: `orca:activeWorkspaceSlug`). On app load, the client:
1. Fetches `workspaces` from the server.
2. Restores the last active workspace from `localStorage`.
3. If the stored slug no longer exists (deleted, etc.), falls back to the first workspace.
4. If the user has no workspaces (should not happen after migration), shows a "Create Workspace" onboarding flow.

### Workspace Switcher UI

Add a workspace selector dropdown to the sidebar header:

- Shows the current workspace name (not truncated — handle long names with ellipsis)
- Clicking opens a dropdown listing all workspaces
- Each item shows workspace name
- A "Create Workspace" option at the bottom of the dropdown
- Switching workspaces resets the navigation stack to `{ view: 'projects' }`

### Updated GraphQL Queries

```graphql
query Workspaces {
  workspaces { id name slug createdAt updatedAt }
}

query Workspace($slug: String!) {
  workspace(slug: $slug) {
    id name slug
    projects {
      id name description
      tasks { id title status }
      createdAt updatedAt
    }
    createdAt updatedAt
  }
}
```

### Updated Mutations

`CreateProjectInput` now includes `workspaceId`. New workspace mutations added (createWorkspace, updateWorkspace, deleteWorkspace).

### Subscription Updates

Subscriptions include `workspaceId`. When the user switches workspaces, active subscriptions are torn down and new ones established for the new workspace.

## Error Messages

| Scenario | Error Code | User-Facing Message |
|---|---|---|
| Workspace not found (or unauthorized) | `NOT_FOUND` | "Workspace not found" |
| Project not found (or unauthorized) | `NOT_FOUND` | "Project not found" |
| Task not found (or unauthorized) | `NOT_FOUND` | "Task not found" |
| Slug validation failed | `BAD_USER_INPUT` | "Workspace URL must be 3-64 characters, lowercase letters, numbers, and hyphens only" |
| Slug already taken | `BAD_USER_INPUT` | "This workspace URL is already taken" |
| Slug is reserved | `BAD_USER_INPUT` | "This workspace URL is reserved" |
| Delete last workspace | `BAD_USER_INPUT` | "Cannot delete your only workspace. Create another workspace first." |
| Delete workspace confirmation (UI) | -- | "This will archive the workspace and all its projects and tasks. You can contact support to restore it within 30 days." |

## Rate Limiting

Workspace creation is limited to **10 workspaces per user**. Enforced in the `createWorkspace` mutation by counting existing (non-deleted) workspaces for the user. The limit is a constant that can be adjusted later.

## Testing

### Unit Tests

- `workspace.test.ts`: CRUD resolvers, slug validation, soft-delete, last-workspace guard, slug mangling on delete
- `project.test.ts`: Updated to include `workspaceId` in all operations, test access control
- `task.test.ts`: Updated to test access control through workspace chain
- `workspace-auth.test.ts`: `requireWorkspaceAccess`, `requireProjectAccess`, `requireTaskAccess` — test both success and failure (missing, deleted, wrong owner all return same error)

### Integration Tests

- Create a workspace before creating projects
- Verify projects are scoped to workspace
- Verify cross-workspace access is denied (create two users, verify user A cannot access user B's workspace)
- Verify soft-delete hides workspace and its projects
- Verify subscription scoping

## Files Changed

### Backend

| File | Change |
|---|---|
| `backend/prisma/schema.prisma` | Add `Workspace` model, `workspaceId` on `Project`, `workspaces` on `User` |
| `backend/src/schema/schema.graphql` | Add `Workspace` type, workspace queries/mutations, update `Project` type, update subscriptions |
| `backend/src/schema/workspace.ts` | New: workspace resolvers |
| `backend/src/schema/workspace.test.ts` | New: workspace resolver tests |
| `backend/src/schema/project.ts` | Add `workspaceId` to create, add access checks |
| `backend/src/schema/project.test.ts` | Update tests for workspace scoping |
| `backend/src/schema/task.ts` | Add access checks |
| `backend/src/schema/task.test.ts` | Update tests for access checks |
| `backend/src/schema/auth.ts` | Auto-create workspace on register, include workspaces in AuthPayload |
| `backend/src/schema/index.ts` | Register workspace resolvers |
| `backend/src/auth/workspace.ts` | New: `requireWorkspaceAccess`, `requireProjectAccess`, `requireTaskAccess` |
| `backend/src/auth/workspace.test.ts` | New: auth helper tests |
| `backend/src/scripts/backfill-workspaces.ts` | New: idempotent data migration script |
| `backend/src/scripts/seed.ts` | Create default workspace for seeded user |
| `backend/src/scripts/seed-dev.ts` | Create default workspace for dev user |
| `backend/src/__generated__/graphql.ts` | Regenerated via codegen |
| `backend/src/index.test.ts` | Update integration tests |

### Client

| File | Change |
|---|---|
| `web/src/renderer/workspace/context.tsx` | New: `WorkspaceProvider`, `useWorkspace` |
| `web/src/renderer/workspace/context.test.tsx` | New: workspace context tests |
| `web/src/renderer/components/layout/Sidebar.tsx` | Add workspace switcher dropdown |
| `web/src/renderer/components/layout/AppShell.tsx` | Wrap with `WorkspaceProvider` |
| `web/src/renderer/graphql/queries.ts` | Add workspace queries, update project queries |
| `web/src/renderer/graphql/mutations.ts` | Add workspace mutations, update `CreateProjectInput` |
| `web/src/renderer/graphql/subscriptions.ts` | Add `workspaceId` to subscriptions |
| `web/src/renderer/graphql/__generated__/generated.ts` | Regenerated |
| `web/src/renderer/components/projects/ProjectList.tsx` | Query projects through workspace |
| `web/src/renderer/components/projects/ProjectDetail.tsx` | Include `workspaceId` |
| `web/src/renderer/hooks/useGraphQL.ts` | Add workspace query hooks |

## Decided Questions

| Question | Decision |
|---|---|
| What happens on registration? | Auto-create "Personal" workspace with slug derived from name. |
| Slugs or IDs for URLs? | Slugs. Immutable. Called "workspace URL" in UI. |
| Can slugs be changed? | No. Immutable after creation. |
| What about existing users? | Backfill migration creates a "Personal" workspace per user. |
| What about existing projects? | Assigned to the first user's default workspace during backfill. |
| Delete behavior? | Soft-delete with 30-day grace period. Slug mangled to free it. Cannot delete last workspace. |
| Member management? | Deferred to Phase 2. |
| Roles? | Deferred to Phase 2. Owner-only in Phase 1. |
| Rate limiting? | Max 10 workspaces per user. |
| User deletion? | Blocked by DB constraint if user owns workspaces. Intentional. |
| Invitation of non-existing users? | Deferred to Phase 2. |
| Workspace-scoped invite codes? | Deferred to Phase 2. |
| Cross-workspace references? | Out of scope. Hard boundary. |
| Billing entity? | Deferred entirely. |

## Review Discussion

### Key Feedback Addressed

- **Simplifier** and **Product Strategist** identified that the original spec conflated workspace partitioning with collaboration. Phase 1 was scoped to single-user workspaces only, cutting ~60% of the original scope (no join table, no roles, no invitations, no member management UI).
- **Pragmatic Architect** and **Paranoid Engineer** flagged that authorization was under-specified. Concrete `requireWorkspaceAccess`, `requireProjectAccess`, and `requireTaskAccess` helpers were designed with consistent NOT_FOUND responses to prevent IDOR.
- **Paranoid Engineer** and **Operator** flagged cascade delete as dangerous. Replaced with soft-delete (`deletedAt` timestamp) with 30-day grace period and audit logging.
- **User Advocate** and **Pragmatic Architect** required the registration flow to be decided. Auto-create "Personal" workspace on registration so users always land in a usable state.
- **Paranoid Engineer** and **Operator** demanded explicit migration deploy ordering. Four separate deploys with verification and rollback procedures for each step.
- **Pragmatic Architect** suggested `projects` as a field on Workspace type rather than a root query. Adopted — more natural GraphQL pattern.
- **Pragmatic Architect** and **Simplifier** suggested keeping old top-level queries through migration steps 1-3. Adopted — old queries removed only in step 4 alongside new client code.
- **Paranoid Engineer** flagged backfill script must be idempotent. Script uses upserts, `WHERE workspaceId IS NULL`, and verifies zero orphans on completion.
- **Paranoid Engineer** flagged soft-delete filtering must be centralized. All workspace queries go through access helpers that check `deletedAt`.
- **Pragmatic Architect** flagged soft-deleted slugs blocking reuse. Slug is mangled on soft-delete to free it.

### Tradeoffs Considered

- **Slugs vs IDs** (Simplifier vs Architect): Simplifier advocated for IDs only (simpler, no validation). Architect noted slugs enable clean URLs and deep-linking. Slugs were kept as a modest complexity cost with real UX value, especially for browser dev mode and future web client.
- **Soft-delete vs hard-delete** (Simplifier vs Paranoid Engineer/Operator): Simplifier argued soft-delete adds query complexity. Paranoid Engineer and Operator argued irreversible deletion of all workspace data is too risky. Soft-delete was kept — the access helpers centralize the `deletedAt` check, keeping the complexity contained.
- **Per-resolver auth vs middleware** (Architect): Middleware-level auth was considered but rejected because graphql-yoga plugins operate at the operation level, not field level. Explicit resolver checks match the existing codebase pattern and are easier to audit.

### Dissenting Perspectives

- **Simplifier** argued that the max-10-workspace limit is unnecessary enforcement for Phase 1. The limit was kept as a cheap safety net (single count query) but acknowledged as removable if it causes friction.
- **Product Strategist** noted this may be infrastructure investment (Phase 2 enabler) rather than a validated user need. Acknowledged — success should be measured by whether users create multiple workspaces, and whether Phase 2 ships cleanly on top of this foundation.
