# Workspaces: Multi-User Collaboration (Phase 2)

## Overview

Phase 2 adds multi-user collaboration to Orca workspaces. In Phase 1, each workspace had a single owner and no shared access. Phase 2 introduces a membership model so that multiple users can belong to the same workspace, each with a defined role (OWNER or MEMBER).

This includes:

- A `WorkspaceMembership` join table connecting users to workspaces with roles
- A direct-add flow for adding existing users to workspaces, plus pending invitations for users who don't have Orca accounts yet
- Member management: listing members, changing roles, removing members
- Authorization upgrade from `createdById`-check to membership-based access
- Client-side member management UI with confirmation dialogs

### What Changes for Existing Users

After Phase 2, every workspace has an explicit membership list. The Phase 1 `ownerId` field is renamed to `createdById` on `Workspace` — it has no authorization significance and is purely a record of who created the workspace. All access control decisions flow through the `WorkspaceMembership` table. The migration backfills an OWNER membership row for every existing workspace creator.

### Permission Philosophy

All workspace members (OWNER and MEMBER) have equal CRUD access to projects and tasks within the workspace. This is intentional for a small-team collaboration tool. OWNERs have additional administrative capabilities: adding/removing members, changing roles, and managing workspace settings. There is no per-resource ownership — if you are a member of a workspace, you can create, edit, and delete any project or task in it.

## Data Model Changes

### New: WorkspaceMembership

```prisma
enum WorkspaceRole {
  OWNER
  MEMBER
}

model WorkspaceMembership {
  id          String        @id @default(cuid())
  workspaceId String
  workspace   Workspace     @relation(fields: [workspaceId], references: [id], onDelete: Cascade)
  userId      String
  user        User          @relation(fields: [userId], references: [id], onDelete: Cascade)
  role        WorkspaceRole @default(MEMBER)
  createdAt   DateTime      @default(now())
  updatedAt   DateTime      @updatedAt

  @@unique([workspaceId, userId])
  @@index([workspaceId])
  @@index([userId])
}
```

Design decisions:

- **Composite unique constraint** `[workspaceId, userId]` prevents duplicate memberships. All `upsert` and `create` operations can rely on this constraint.
- **`onDelete: Cascade` on workspace FK**: When a workspace is hard-deleted (the future purge job from Phase 1), its memberships are automatically removed.
- **`onDelete: Cascade` on user FK**: When a user is deleted, their memberships are removed. The `createdById` FK on `Workspace` still uses `RESTRICT`, so user deletion is blocked if they are a workspace *creator*. Membership cleanup is a separate concern — a user can be a MEMBER of workspaces they didn't create, and those memberships should be cleaned up on user deletion.
- **No `ADMIN` role**: Two roles are sufficient for the current product. OWNER can manage members and workspace settings. MEMBER can manage projects and tasks. A finer-grained permission system can be added later if needed.

### New: WorkspaceInvitation

WorkspaceInvitation is used **only** for users who do not yet have an Orca account. When an OWNER adds an email that belongs to an existing user, the user is added directly to the workspace — no invitation record is created.

```prisma
model WorkspaceInvitation {
  id          String        @id @default(cuid())
  workspaceId String
  workspace   Workspace     @relation(fields: [workspaceId], references: [id], onDelete: Cascade)
  email       String
  role        WorkspaceRole @default(MEMBER)
  invitedById String
  invitedBy   User          @relation("invitationsSent", fields: [invitedById], references: [id])
  expiresAt   DateTime
  createdAt   DateTime      @default(now())
  updatedAt   DateTime      @updatedAt

  @@unique([workspaceId, email])
  @@index([email])
  @@index([workspaceId])
}
```

Design decisions:

- **`email` instead of `userId`**: Invitations target an email address for a user who does not yet exist in Orca. When they register with that email, pending invitations are presented during onboarding for explicit acceptance.
- **Composite unique `[workspaceId, email]`**: Prevents duplicate invitations to the same email for the same workspace. If an OWNER wants to re-invite after cancellation, they delete the old record and create a new one.
- **No `status` field**: Unlike the original design, invitations are simply created or deleted. When a user registers and accepts, the invitation is deleted and a membership is created. When an OWNER cancels, the invitation is deleted. When a user declines, the invitation is deleted. This simplifies the model — there is no PENDING/ACCEPTED/REVOKED state machine.
- **`expiresAt`**: Invitations expire after 7 days. Expired invitations are treated as invalid. A new invitation can be sent after expiry. Expired invitations are filtered out of all queries.
- **`invitedById`**: Tracks who sent the invitation for audit purposes.
- **`role` on invitation**: The invitation specifies what role the user will receive. Only OWNERs can invite with the OWNER role.

### Updated: Workspace

```prisma
model Workspace {
  id          String                @id @default(cuid())
  name        String
  slug        String                @unique
  createdById String
  createdBy   User                  @relation("createdWorkspaces", fields: [createdById], references: [id])
  memberships WorkspaceMembership[]
  invitations WorkspaceInvitation[]
  projects    Project[]
  tasks       Task[]
  deletedAt   DateTime?
  createdAt   DateTime              @default(now())
  updatedAt   DateTime              @updatedAt

  @@index([createdById])
}
```

Changes from Phase 1:
- **Renamed `ownerId` to `createdById`**: This field has no authorization significance. It is purely a historical record of who created the workspace. All access control flows through `WorkspaceMembership`. The relation is renamed from `"ownedWorkspaces"` to `"createdWorkspaces"`.
- Added `memberships`, `invitations`, and `tasks` relations.

### Updated: User

```prisma
model User {
  id                String                @id @default(cuid())
  email             String                @unique
  passwordHash      String
  name              String
  createdWorkspaces Workspace[]           @relation("createdWorkspaces")
  memberships       WorkspaceMembership[]
  sentInvitations   WorkspaceInvitation[] @relation("invitationsSent")
  createdAt         DateTime              @default(now())
  updatedAt         DateTime              @updatedAt
}
```

Changes from Phase 1:
- Renamed `workspaces` to `createdWorkspaces` with explicit relation name
- Added `memberships` and `sentInvitations` relations

### Denormalization: workspaceId on Task

Phase 1 noted that `requireTaskAccess` traverses Task -> Project -> Workspace -> Membership (4 tables in Phase 2). To avoid this expensive join on every task operation, add `workspaceId` directly to the Task model:

```prisma
model Task {
  id               String     @id @default(cuid())
  title            String
  description      String?
  status           TaskStatus @default(TODO)
  projectId        String
  project          Project    @relation(fields: [projectId], references: [id], onDelete: Cascade)
  workspaceId      String
  workspace        Workspace  @relation(fields: [workspaceId], references: [id])
  workingDirectory String
  createdAt        DateTime   @default(now())
  updatedAt        DateTime   @updatedAt

  @@index([workspaceId])
}
```

This allows `requireTaskAccess` to check membership with a single join (Task -> WorkspaceMembership) instead of three. The `workspaceId` is set automatically from the task's project when creating a task and is **immutable** — tasks cannot move between workspaces.

**Invariant enforcement**: `workspaceId` is NOT exposed in any update input type. The `updateTask` resolver must never accept or apply a `workspaceId` change. Similarly, `workspaceId` is NOT an updatable field in `UpdateProjectInput` — projects cannot move between workspaces. The resolvers must reject any attempt to change a project's workspace. This is enforced at the resolver level (the field simply does not exist in the input type) and documented as an explicit invariant.

## GraphQL Schema Changes

### New Types

```graphql
enum WorkspaceRole {
  OWNER
  MEMBER
}

type WorkspaceMember {
  id: ID!
  user: User!
  role: WorkspaceRole!
  createdAt: String!
}

type WorkspaceInvitation {
  id: ID!
  email: String!
  role: WorkspaceRole!
  workspace: Workspace!
  invitedBy: User!
  expiresAt: String!
  createdAt: String!
}
```

Note: `WorkspaceMember` is a GraphQL projection of `WorkspaceMembership`. It exposes the `user` relation inline rather than raw IDs.

### Updated Workspace Type

```graphql
type Workspace {
  id: ID!
  name: String!
  slug: String!
  role: WorkspaceRole!
  members: [WorkspaceMember!]!
  invitations: [WorkspaceInvitation!]!
  projects: [Project!]!
  createdAt: String!
  updatedAt: String!
}
```

Changes from Phase 1:
- Added `role` — the *requesting user's* role in this workspace. Resolved per-request from the membership table. Allows the client to conditionally show/hide management UI.
- Added `members` — list of workspace members. Resolved via `WorkspaceMembership` with user relation.
- Added `invitations` — list of pending (non-expired) invitations. Only resolved for OWNERs; returns empty array for MEMBERs.

### New Inputs

```graphql
input AddMemberInput {
  workspaceId: ID!
  email: String!
  role: WorkspaceRole
}

input UpdateMemberRoleInput {
  workspaceId: ID!
  userId: ID!
  role: WorkspaceRole!
}
```

### New Queries

```graphql
type Query {
  # ... existing queries ...
  pendingInvitations: [WorkspaceInvitation!]!
}
```

`pendingInvitations` returns all non-expired invitations for the authenticated user's email address. This is used during onboarding (after registration) and in the main app to show pending workspace invitations.

### New Mutations

```graphql
type Mutation {
  # ... existing mutations ...

  addMember(input: AddMemberInput!): AddMemberResult!
  removeMember(workspaceId: ID!, userId: ID!): Boolean!
  updateMemberRole(input: UpdateMemberRoleInput!): WorkspaceMember!
  cancelInvitation(id: ID!): Boolean!
  acceptInvitation(id: ID!): Workspace!
  declineInvitation(id: ID!): Boolean!
}
```

### AddMemberResult Union

The `addMember` mutation has two possible outcomes depending on whether the email belongs to an existing user:

```graphql
type MemberAdded {
  member: WorkspaceMember!
  message: String!
}

type InvitationCreated {
  invitation: WorkspaceInvitation!
  message: String!
}

union AddMemberResult = MemberAdded | InvitationCreated
```

- `MemberAdded`: The email matched an existing user. They have been added directly to the workspace. `message` is "Added [name] to [workspace]".
- `InvitationCreated`: The email did not match any existing user. A pending invitation has been stored. `message` is "Invitation saved. [email] will be added when they create an Orca account. Let them know to sign up."

### Removed From Original Design

- **`membershipChanged` subscription**: Cut. Users can refresh to see membership changes. When a user is removed from a workspace, their next API call for that workspace will return NOT_FOUND, which the client handles by removing the workspace from the local list. This avoids the complexity of real-time membership event plumbing.
- **`leaveWorkspace` mutation**: Merged into `removeMember`. A member can remove themselves by calling `removeMember(workspaceId, userId)` with their own userId. The resolver handles both cases (owner removing another member, or member removing themselves).
- **`inviteMember` / `revokeInvitation` / `acceptInvitation` / `declineInvitation` (old ceremony)**: Replaced with the simplified `addMember` + `cancelInvitation` + `acceptInvitation` / `declineInvitation` (only for non-existing users on registration).
- **Membership context cache (`getMemberships`)**: Cut as premature optimization. Membership is checked via direct database queries. Can be added later if profiling shows a need.

## Authorization Changes

### Permission Matrix

| Action | OWNER | MEMBER | Non-member |
|---|---|---|---|
| View workspace (name, slug, projects) | Yes | Yes | No |
| Update workspace (name) | Yes | No | No |
| Delete workspace | Yes | No | No |
| View members list | Yes | Yes | No |
| Add members | Yes | No | No |
| Cancel invitations | Yes | No | No |
| Change member roles | Yes | No | No |
| Remove other members | Yes | No | No |
| Remove self (leave) | Yes (if not last OWNER) | Yes | No |
| Create/update/delete projects | Yes | Yes | No |
| Create/update/delete tasks | Yes | Yes | No |
| Subscribe to project/task changes | Yes | Yes | No |
| View pending invitations (own) | N/A | N/A | Yes (on registration) |
| Accept/decline invitations (own) | N/A | N/A | Yes (on registration) |

Notes:
- **All members have equal CRUD on workspace resources**: Both OWNERs and MEMBERs can create, update, and delete any project or task in the workspace. There is no per-resource ownership. This is intentional for a small-team tool.
- **OWNERs can leave**: An OWNER can remove themselves (leave) only if there is at least one other OWNER. This prevents orphaned workspaces.
- **Last OWNER protection**: The system prevents removing/demoting the last OWNER of a workspace.
- **MEMBERs can view members**: All workspace members can see who else is in the workspace. This is intentional for collaboration. Invitations (pending/email addresses) are only visible to OWNERs.

### Updated Access Helpers

The access helpers in `backend/src/auth/workspace.ts` change from checking `ownerId` to checking the membership table:

```typescript
/**
 * Verifies that the given workspace exists, is not soft-deleted,
 * and the requesting user is a member.
 *
 * Returns the workspace and the user's role.
 * Throws NOT_FOUND for missing, deleted, or unauthorized workspaces.
 */
export async function requireWorkspaceAccess(
  context: ServerContext,
  workspaceId: string,
): Promise<{ workspace: Workspace; role: WorkspaceRole }> {
  const workspace = await context.prisma.workspace.findUnique({
    where: { id: workspaceId },
  });

  if (!workspace || workspace.deletedAt) {
    throw new GraphQLError('Workspace not found', {
      extensions: { code: 'NOT_FOUND' },
    });
  }

  const membership = await context.prisma.workspaceMembership.findUnique({
    where: { workspaceId_userId: { workspaceId, userId: context.userId } },
  });

  if (!membership) {
    throw new GraphQLError('Workspace not found', {
      extensions: { code: 'NOT_FOUND' },
    });
  }

  return { workspace, role: membership.role };
}

/**
 * Same as requireWorkspaceAccess but additionally requires the OWNER role.
 */
export async function requireWorkspaceOwner(
  context: ServerContext,
  workspaceId: string,
): Promise<{ workspace: Workspace; role: WorkspaceRole }> {
  const result = await requireWorkspaceAccess(context, workspaceId);

  if (result.role !== 'OWNER') {
    throw new GraphQLError('Workspace not found', {
      extensions: { code: 'NOT_FOUND' },
    });
  }

  return result;
}

/**
 * Checks membership for a project's workspace.
 * Uses the project's workspaceId to look up membership.
 */
export async function requireProjectAccess(
  context: ServerContext,
  projectId: string,
): Promise<{ project: Project; role: WorkspaceRole }> {
  const project = await context.prisma.project.findUnique({
    where: { id: projectId },
    include: { workspace: true },
  });

  if (!project || !project.workspace || project.workspace.deletedAt) {
    throw new GraphQLError('Project not found', {
      extensions: { code: 'NOT_FOUND' },
    });
  }

  const membership = await context.prisma.workspaceMembership.findUnique({
    where: {
      workspaceId_userId: { workspaceId: project.workspaceId, userId: context.userId },
    },
  });

  if (!membership) {
    throw new GraphQLError('Project not found', {
      extensions: { code: 'NOT_FOUND' },
    });
  }

  return { project, role: membership.role };
}

/**
 * Checks membership for a task's workspace.
 * Uses the denormalized workspaceId on Task (added in Phase 2).
 */
export async function requireTaskAccess(
  context: ServerContext,
  taskId: string,
): Promise<{ task: Task; role: WorkspaceRole }> {
  const task = await context.prisma.task.findUnique({
    where: { id: taskId },
  });

  if (!task) {
    throw new GraphQLError('Task not found', {
      extensions: { code: 'NOT_FOUND' },
    });
  }

  // Use denormalized workspaceId — no join to project/workspace needed
  const membership = await context.prisma.workspaceMembership.findUnique({
    where: {
      workspaceId_userId: { workspaceId: task.workspaceId, userId: context.userId },
    },
  });

  if (!membership) {
    throw new GraphQLError('Task not found', {
      extensions: { code: 'NOT_FOUND' },
    });
  }

  // Still verify workspace isn't soft-deleted
  const workspace = await context.prisma.workspace.findUnique({
    where: { id: task.workspaceId },
    select: { deletedAt: true },
  });

  if (!workspace || workspace.deletedAt) {
    throw new GraphQLError('Task not found', {
      extensions: { code: 'NOT_FOUND' },
    });
  }

  return { task, role: membership.role };
}
```

Key changes from Phase 1:
- Functions now check the `WorkspaceMembership` table directly instead of using a cached membership loader or checking `ownerId`.
- All functions return `{ resource, role }` so resolvers can make role-based decisions.
- `requireTaskAccess` uses the denormalized `task.workspaceId` instead of joining through project.
- New `requireWorkspaceOwner` helper for owner-only operations.

### Updated Resolver Authorization Matrix

| Resolver | Access Check |
|---|---|
| `workspaces` | Filter by membership (not createdById) |
| `workspace(slug)` | Query by slug, verify membership |
| `createWorkspace` | No access check (creates new resource, adds creator as OWNER) |
| `updateWorkspace(id)` | `requireWorkspaceOwner(context, id)` |
| `deleteWorkspace(id)` | `requireWorkspaceOwner(context, id)` |
| `workspace.projects` | Parent already authorized |
| `workspace.members` | Parent already authorized (all members can view) |
| `workspace.invitations` | Parent authorized + filter: return empty for non-OWNERs |
| `workspace.role` | Resolved from membership query |
| `createProject` | `requireWorkspaceAccess(context, workspaceId)` |
| `updateProject(id)` | `requireProjectAccess(context, id)` — workspaceId not updatable |
| `deleteProject(id)` | `requireProjectAccess(context, id)` |
| `project(id)` | `requireProjectAccess(context, id)` |
| `createTask` | `requireProjectAccess(context, projectId)` |
| `updateTask(id)` | `requireTaskAccess(context, id)` — workspaceId not updatable |
| `deleteTask(id)` | `requireTaskAccess(context, id)` |
| `task(id)` | `requireTaskAccess(context, id)` |
| `addMember` | `requireWorkspaceOwner(context, workspaceId)` |
| `cancelInvitation` | Load invitation, `requireWorkspaceOwner(context, invitation.workspaceId)` |
| `acceptInvitation` | Verify invitation email matches authenticated user's email, not expired |
| `declineInvitation` | Verify invitation email matches authenticated user's email |
| `updateMemberRole` | `requireWorkspaceOwner(context, workspaceId)` |
| `removeMember` | `requireWorkspaceOwner` OR userId === context.userId (self-removal) |
| `pendingInvitations` | Filter by authenticated user's email |
| `projectChanged(workspaceId)` | `requireWorkspaceAccess` on subscribe + re-query DB per event |
| `taskChanged(workspaceId)` | `requireWorkspaceAccess` on subscribe + re-query DB per event |

## Adding Members Flow

### Adding an Existing User (Direct-Add)

1. OWNER calls `addMember(input: { workspaceId, email, role })`.
2. Server validates:
   - Caller is OWNER of the workspace (`requireWorkspaceOwner`).
   - Workspace is not soft-deleted (enforced by `requireWorkspaceOwner`).
   - Email is a valid email format.
   - Workspace is not at member limit (max 25 members, configurable constant).
3. Server looks up user by email.
4. **If user exists**:
   - Check that the user is not already a member of the workspace. If they are, return error: "This user is already a member of this workspace."
   - Create a `WorkspaceMembership` with the specified role.
   - Return `MemberAdded { member, message: "Added [name] to [workspace]" }`.
5. **If user does not exist**:
   - Check that no non-expired invitation already exists for this email + workspace. If one does, return error: "An invitation has already been sent to this email."
   - Create a `WorkspaceInvitation` with `expiresAt: now + 7 days`.
   - Return `InvitationCreated { invitation, message: "Invitation saved. [email] will be added when they create an Orca account. Let them know to sign up." }`.

There is no accept/decline ceremony for existing users. If an OWNER adds you, you are in.

### Handling Non-Existing Users (Pending Invitations with Explicit Consent)

When a non-existing user registers with an email that has pending invitations:

1. The `register` mutation creates the user account as normal.
2. The `register` mutation queries for all non-expired `WorkspaceInvitation` records matching the new user's email.
3. The response includes a `pendingInvitations` field so the client can show them during onboarding.
4. The user is **NOT** automatically added to any workspace. They must explicitly accept or decline each invitation.
5. The client shows the pending invitations during the onboarding flow (after registration, before entering the main app).
6. For each invitation, the user can:
   - **Accept** (`acceptInvitation(id)`): Creates a `WorkspaceMembership`, deletes the invitation.
   - **Decline** (`declineInvitation(id)`): Deletes the invitation.

This ensures users always consent to being added to workspaces they didn't know about when they registered.

### Accept Invitation

1. User calls `acceptInvitation(id)`.
2. Server validates:
   - Invitation exists and is not expired (`expiresAt > now`).
   - Invitation email matches the authenticated user's email.
   - Invitation's workspace is not soft-deleted.
   - User is not already a member of the workspace.
3. Server in a transaction:
   - Creates a `WorkspaceMembership` with the role specified in the invitation. Uses `ON CONFLICT DO NOTHING` on the `[workspaceId, userId]` unique constraint as a safety net for race conditions.
   - Deletes the `WorkspaceInvitation`.
4. Server returns the workspace.

### Decline Invitation

1. User calls `declineInvitation(id)`.
2. Server validates invitation exists, is not expired, and email matches the authenticated user's email.
3. Server deletes the `WorkspaceInvitation`.
4. Returns `true`.

### Cancel Invitation (by OWNER)

1. OWNER calls `cancelInvitation(id)`.
2. Server validates caller is OWNER of the invitation's workspace.
3. Server deletes the `WorkspaceInvitation`.
4. Returns `true`.

### Updated Register Mutation

The `register` mutation response is updated to include pending invitations:

```graphql
type AuthPayload {
  token: String!
  user: User!
  pendingInvitations: [WorkspaceInvitation!]!
}
```

After creating the user, the register resolver queries for matching invitations:

```typescript
// In auth.ts register mutation, after creating the user:
const pendingInvitations = await context.prisma.workspaceInvitation.findMany({
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

return { token, user, pendingInvitations };
```

The client receives these invitations and shows them in the onboarding flow. No auto-accept. No auto-join. The login mutation does NOT process invitations — invitations are only relevant at registration time, and existing users are added directly via `addMember`.

## Migration Strategy

### Problem

Phase 1 is deployed with `ownerId`-based authorization. We need to:
1. Rename `ownerId` to `createdById`
2. Create `WorkspaceMembership` and `WorkspaceInvitation` tables
3. Add `workspaceId` to `Task` (denormalization)
4. Backfill membership rows from existing `createdById` values
5. Backfill `workspaceId` on tasks from their projects
6. Switch authorization from `createdById` to membership-based
7. Make `Task.workspaceId` NOT NULL

This must be done safely with zero downtime. The existing Phase 1 authorization continues to work until the new code is deployed.

### Deploy Sequence: Four Separate Deploys

| Step | Action | Verification | Rollback |
|---|---|---|---|
| 1 | Deploy code that handles nullable `Task.workspaceId` and reads membership if available, falls back to `createdById`. Apply Migration 1: rename column, create tables, add nullable `Task.workspaceId`. | Tables exist, column is nullable, `createdById` column exists. Old auth still works via fallback. | Drop new tables and column, rename `createdById` back to `ownerId`, revert code. |
| 2 | Run backfill script: create membership rows, populate `Task.workspaceId`. | Every workspace has at least one OWNER membership. Zero tasks with null `workspaceId`. | Safe to re-run. Code still falls back to `createdById`. |
| 3 | Apply Migration 2: make `Task.workspaceId` NOT NULL. | Column is NOT NULL in DB. | `ALTER TABLE "Task" ALTER COLUMN "workspaceId" DROP NOT NULL`. |
| 4 | Deploy full Phase 2 code: membership-based auth, member management UI, add-member flow. Remove `createdById` fallback. | End-to-end test: add member, verify access. | Standard code revert to step 1/3 code. Data model is stable. |

### Migration 1: Schema Changes

```sql
-- Rename ownerId to createdById
ALTER TABLE "Workspace" RENAME COLUMN "ownerId" TO "createdById";
ALTER INDEX "Workspace_ownerId_idx" RENAME TO "Workspace_createdById_idx";

-- CreateEnum: WorkspaceRole
CREATE TYPE "WorkspaceRole" AS ENUM ('OWNER', 'MEMBER');

-- CreateTable: WorkspaceMembership
CREATE TABLE "WorkspaceMembership" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "WorkspaceRole" NOT NULL DEFAULT 'MEMBER',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "WorkspaceMembership_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "WorkspaceMembership_workspaceId_userId_key"
    ON "WorkspaceMembership"("workspaceId", "userId");
CREATE INDEX "WorkspaceMembership_workspaceId_idx"
    ON "WorkspaceMembership"("workspaceId");
CREATE INDEX "WorkspaceMembership_userId_idx"
    ON "WorkspaceMembership"("userId");

ALTER TABLE "WorkspaceMembership" ADD CONSTRAINT "WorkspaceMembership_workspaceId_fkey"
    FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkspaceMembership" ADD CONSTRAINT "WorkspaceMembership_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable: WorkspaceInvitation
CREATE TABLE "WorkspaceInvitation" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" "WorkspaceRole" NOT NULL DEFAULT 'MEMBER',
    "invitedById" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "WorkspaceInvitation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "WorkspaceInvitation_workspaceId_email_key"
    ON "WorkspaceInvitation"("workspaceId", "email");
CREATE INDEX "WorkspaceInvitation_email_idx"
    ON "WorkspaceInvitation"("email");
CREATE INDEX "WorkspaceInvitation_workspaceId_idx"
    ON "WorkspaceInvitation"("workspaceId");

ALTER TABLE "WorkspaceInvitation" ADD CONSTRAINT "WorkspaceInvitation_workspaceId_fkey"
    FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkspaceInvitation" ADD CONSTRAINT "WorkspaceInvitation_invitedById_fkey"
    FOREIGN KEY ("invitedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Add nullable workspaceId to Task
ALTER TABLE "Task" ADD COLUMN "workspaceId" TEXT;
CREATE INDEX "Task_workspaceId_idx" ON "Task"("workspaceId");

ALTER TABLE "Task" ADD CONSTRAINT "Task_workspaceId_fkey"
    FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
```

### Backfill Script

`backend/src/scripts/backfill-memberships.ts` — idempotent, safe to re-run.

```typescript
async function backfill() {
  // Step 1: Create OWNER memberships for all workspace creators
  const workspaces = await prisma.workspace.findMany({
    where: { deletedAt: null },
    select: { id: true, createdById: true },
  });

  let membershipsCreated = 0;
  for (const ws of workspaces) {
    const existing = await prisma.workspaceMembership.findUnique({
      where: { workspaceId_userId: { workspaceId: ws.id, userId: ws.createdById } },
    });
    if (!existing) {
      await prisma.workspaceMembership.create({
        data: {
          workspaceId: ws.id,
          userId: ws.createdById,
          role: 'OWNER',
        },
      });
      membershipsCreated++;
    }
  }
  console.log(`Created ${membershipsCreated} OWNER memberships`);

  // Step 2: Backfill workspaceId on tasks
  const tasksWithoutWorkspace = await prisma.task.findMany({
    where: { workspaceId: null },
    include: { project: { select: { workspaceId: true, id: true } } },
  });

  let tasksUpdated = 0;
  let tasksSkipped = 0;
  for (const task of tasksWithoutWorkspace) {
    if (!task.project || !task.project.workspaceId) {
      console.warn(
        `SKIP: Task ${task.id} has no project or project has no workspaceId (project: ${task.project?.id ?? 'null'})`
      );
      tasksSkipped++;
      continue;
    }
    await prisma.task.update({
      where: { id: task.id },
      data: { workspaceId: task.project.workspaceId },
    });
    tasksUpdated++;
  }
  console.log(`Backfilled workspaceId on ${tasksUpdated} tasks (${tasksSkipped} skipped)`);

  // Verify: no memberships missing
  const workspacesWithoutOwner = await prisma.workspace.findMany({
    where: {
      deletedAt: null,
      memberships: { none: { role: 'OWNER' } },
    },
  });
  if (workspacesWithoutOwner.length > 0) {
    console.error(`ERROR: ${workspacesWithoutOwner.length} workspaces have no OWNER membership`);
    process.exit(1);
  }

  // Verify: no orphaned tasks (tasks with null workspaceId)
  const orphanedTasks = await prisma.task.count({ where: { workspaceId: null } });
  if (orphanedTasks > 0) {
    console.error(`ERROR: ${orphanedTasks} tasks still have no workspaceId`);
    console.error('Review skipped tasks above. These must be resolved before Migration 2.');
    process.exit(1);
  }

  console.log('Backfill complete. Safe to proceed with NOT NULL migration.');
}
```

### Migration 2: NOT NULL Constraint

```sql
ALTER TABLE "Task" ALTER COLUMN "workspaceId" SET NOT NULL;
```

### Transitional Authorization (Step 1-3)

During steps 1-3, the code must work with both createdById-based and membership-based auth. The access helpers use a fallback pattern:

```typescript
export async function requireWorkspaceAccess(context, workspaceId) {
  const workspace = await context.prisma.workspace.findUnique({
    where: { id: workspaceId },
  });

  if (!workspace || workspace.deletedAt) {
    throw new GraphQLError('Workspace not found', { extensions: { code: 'NOT_FOUND' } });
  }

  // Try membership first
  const membership = await context.prisma.workspaceMembership.findUnique({
    where: { workspaceId_userId: { workspaceId, userId: context.userId } },
  });

  if (membership) {
    return { workspace, role: membership.role };
  }

  // Fallback to createdById (pre-backfill compatibility)
  if (workspace.createdById === context.userId) {
    return { workspace, role: 'OWNER' as const };
  }

  throw new GraphQLError('Workspace not found', { extensions: { code: 'NOT_FOUND' } });
}
```

This fallback is removed in step 4 once all memberships are backfilled.

## Edge Cases

### Last OWNER Protection

A workspace must always have at least one OWNER. The following operations enforce this:

- **`removeMember` targeting an OWNER**: Count remaining OWNERs. If this is the last one, reject with error: "Cannot remove the last owner. Transfer ownership to another member first."
- **`updateMemberRole` demoting an OWNER to MEMBER**: Same count check.
- **`removeMember` by self (leave) when user is an OWNER**: Same count check. Error: "You are the last owner of this workspace. Transfer ownership to another member before leaving."
- **`deleteWorkspace`**: Already requires OWNER. No membership count check needed (delete removes all memberships).

**Race condition**: Two OWNERs simultaneously try to demote each other. Without protection, both could succeed and leave zero OWNERs. Mitigation: Use `SELECT ... FOR UPDATE` on the OWNER membership rows for the workspace to serialize concurrent OWNER mutations:

```typescript
await context.prisma.$transaction(async (tx) => {
  // Lock OWNER membership rows to prevent concurrent OWNER mutations
  await tx.$queryRaw`
    SELECT id FROM "WorkspaceMembership"
    WHERE "workspaceId" = ${workspaceId} AND "role" = 'OWNER'
    FOR UPDATE
  `;

  const ownerCount = await tx.workspaceMembership.count({
    where: { workspaceId, role: 'OWNER' },
  });

  if (ownerCount <= 1) {
    throw new GraphQLError('Cannot remove the last owner.', {
      extensions: { code: 'BAD_USER_INPUT' },
    });
  }

  // Proceed with demotion/removal
  await tx.workspaceMembership.delete({
    where: { id: membershipId },
  });
});
```

The lock target is the OWNER membership rows, not the workspace row. This is correct because the invariant we are protecting is about the count of OWNER memberships. Locking the workspace row would not prevent concurrent membership mutations from proceeding.

### Self-Removal (Leave)

- A MEMBER can leave by calling `removeMember(workspaceId, userId)` with their own userId.
- An OWNER can only leave if there is at least one other OWNER.
- The `removeMember` resolver checks: if `userId === context.userId`, it is a self-removal (leave). If `userId !== context.userId`, it requires OWNER role.

### Workspace Deletion with Members

When an OWNER deletes a workspace (soft-delete):
1. All members lose access (soft-deleted workspaces are invisible to all access helpers).
2. Pending invitations become moot (workspace is invisible; accepting the invitation will fail because the workspace check will return NOT_FOUND).
3. Active subscriptions for the deleted workspace will stop forwarding events (re-validation checks `deletedAt`).

### Invitation for Existing Member

If an OWNER calls `addMember` with an email that belongs to an existing member:
- The mutation checks for existing membership and returns error: "This user is already a member of this workspace."

### Invitation for Self

If an OWNER calls `addMember` with their own email:
- The mutation checks and returns error: "You are already a member of this workspace."

### Soft-Delete Leak Prevention

All workspace access checks already filter `deletedAt` (from Phase 1 access helpers). The `addMember` mutation also verifies the workspace is not soft-deleted via `requireWorkspaceOwner`. The `acceptInvitation` mutation explicitly checks `workspace.deletedAt` before creating the membership.

### Expired Invitation Cleanup

Expired invitations are not automatically deleted. They remain in the database but are filtered out of all queries (`WHERE expiresAt > now()`). A periodic cleanup job (future) can purge old invitation records. For Phase 2, the `pendingInvitations` query, `acceptInvitation` mutation, and `addMember` duplicate-check all filter by `expiresAt`.

### Invitation Uniqueness

The unique constraint `[workspaceId, email]` prevents duplicate invitations to the same email for the same workspace. If an OWNER wants to re-invite after cancelling, the cancellation deletes the old record, so a new one can be created.

### Concurrent Accept

If two requests try to accept the same invitation simultaneously:
- The `WorkspaceMembership` unique constraint `[workspaceId, userId]` prevents duplicate memberships. The `ON CONFLICT DO NOTHING` clause ensures the second request does not fail with a constraint violation.
- The invitation deletion will succeed for one request and fail for the other (already deleted). The resolver handles this gracefully by checking if the invitation still exists before attempting deletion.

### Workspace List Ordering

The `workspaces` query returns workspaces ordered by membership `createdAt` (oldest first — the user's own workspaces appear first, recently joined ones appear later). This can be adjusted based on user feedback.

## Client Changes

### New Navigation Views

Add two new view types to the navigation context:

```typescript
export type ViewType = 'projects' | 'project' | 'task' | 'members' | 'invitations';
```

- `members` — workspace member list and management (navigated to from workspace settings)
- `invitations` — pending invitations for the current user (shown during onboarding or from sidebar)

### Member Management UI

#### Workspace Settings / Members Page

Accessed from a "Members" item in the sidebar (below the project list) or a gear icon next to the workspace name in the workspace switcher.

**Layout**:
- **Header**: "Members" title with member count
- **Add member form** (OWNER only): Email input + role dropdown (OWNER/MEMBER, default MEMBER) + "Add" button
- **Member list**: Table/list showing:
  - User name and email
  - Role badge (OWNER / MEMBER)
  - Actions (OWNER only):
    - Role dropdown to change between OWNER and MEMBER
    - "Remove" button (not shown for the last OWNER)
  - "Leave" button for the current user (if they are not the sole OWNER)
- **Pending invitations** (OWNER only): List showing:
  - Email address
  - Invited role
  - Expiry countdown
  - "Cancel" button

**Component**: `web/src/renderer/components/members/MemberList.tsx`

#### Confirmation Dialogs

The following actions require confirmation dialogs before executing:

- **Remove member**: "Are you sure you want to remove [name] from [workspace]? They will lose access to all projects and tasks."
- **Leave workspace**: "Are you sure you want to leave [workspace]? You will lose access to all projects and tasks."
- **Cancel invitation**: "Are you sure you want to cancel the invitation to [email]?"

#### Post-Action Messages

After successfully completing an action, show a brief confirmation message (toast/snackbar):

- **Adding an existing user**: "Added [name] to [workspace]"
- **Creating a pending invitation**: "Invitation saved. [email] will be added when they create an Orca account. Let them know to sign up."
- **Removing a member**: "[name] has been removed from [workspace]"
- **Leaving a workspace**: "You have left [workspace]"
- **Cancelling an invitation**: "Invitation to [email] cancelled"
- **Changing a role**: "[name] is now [OWNER/MEMBER]"

#### Onboarding Invitation Flow

After registration, if the user has pending invitations, show a dedicated onboarding screen before entering the main app:

```tsx
<div className="max-w-md mx-auto p-8">
  <h2>You've been invited!</h2>
  <p>You have pending workspace invitations. Would you like to join?</p>
  {pendingInvitations.map((inv) => (
    <div key={inv.id} className="border rounded p-4 mb-3">
      <strong>{inv.workspace.name}</strong>
      <span className="text-sm text-gray-500">Invited by {inv.invitedBy.name}</span>
      <span className="text-sm">Role: {inv.role}</span>
      <div className="flex gap-2 mt-2">
        <button onClick={() => accept(inv.id)}>Accept</button>
        <button onClick={() => decline(inv.id)}>Decline</button>
      </div>
    </div>
  ))}
  <button onClick={continueToApp}>Continue</button>
</div>
```

**Component**: `web/src/renderer/components/onboarding/PendingInvitations.tsx`

### Updated GraphQL Operations

#### New Queries

```graphql
query WorkspaceMembers($slug: String!) {
  workspace(slug: $slug) {
    id
    name
    role
    members {
      id
      user { id name email }
      role
      createdAt
    }
    invitations {
      id
      email
      role
      invitedBy { id name }
      expiresAt
      createdAt
    }
  }
}

query PendingInvitations {
  pendingInvitations {
    id
    email
    role
    workspace { id name slug }
    invitedBy { id name }
    expiresAt
    createdAt
  }
}
```

#### New Mutations

```graphql
mutation AddMember($input: AddMemberInput!) {
  addMember(input: $input) {
    ... on MemberAdded {
      member { id user { id name email } role }
      message
    }
    ... on InvitationCreated {
      invitation { id email role expiresAt }
      message
    }
  }
}

mutation RemoveMember($workspaceId: ID!, $userId: ID!) {
  removeMember(workspaceId: $workspaceId, userId: $userId)
}

mutation UpdateMemberRole($input: UpdateMemberRoleInput!) {
  updateMemberRole(input: $input) {
    id user { id name email } role
  }
}

mutation CancelInvitation($id: ID!) {
  cancelInvitation(id: $id)
}

mutation AcceptInvitation($id: ID!) {
  acceptInvitation(id: $id) {
    id name slug
  }
}

mutation DeclineInvitation($id: ID!) {
  declineInvitation(id: $id)
}
```

### New React Hooks

```typescript
// web/src/renderer/hooks/useGraphQL.ts (additions)

export function usePendingInvitations() { ... }
export function useAddMember() { ... }
export function useRemoveMember() { ... }
export function useUpdateMemberRole() { ... }
export function useCancelInvitation() { ... }
export function useAcceptInvitation() { ... }
export function useDeclineInvitation() { ... }
```

### Workspace Context Updates

The `WorkspaceProvider` (from Phase 1) is updated to include the user's role:

```typescript
interface WorkspaceContextValue {
  currentWorkspace: Workspace | null;
  currentRole: WorkspaceRole | null;
  workspaces: Workspace[];
  switchWorkspace: (slug: string) => void;
  loading: boolean;
}
```

`currentRole` is derived from the `role` field on the Workspace GraphQL type. The client uses this to conditionally render management UI (add member button, role dropdowns, remove buttons).

### Sidebar Updates

Add a "Members" navigation item in the sidebar, below the project list:

```tsx
<div className="border-t border-gray-800 p-2">
  <button
    onClick={() => navigate({ view: 'members' })}
    className={`w-full text-left px-3 py-1.5 text-sm rounded transition-colors ${
      current.view === 'members'
        ? 'bg-gray-800 text-white'
        : 'text-gray-400 hover:bg-gray-800 hover:text-white'
    }`}
  >
    Members
  </button>
</div>
```

## Subscription Changes

### Subscription Per-Event Re-Validation

The existing `projectChanged` and `taskChanged` subscriptions must re-validate workspace membership per event by re-querying the database (not a cache). This ensures that a removed user stops receiving events immediately:

```typescript
projectChanged: {
  subscribe: async (_parent, args, context) => {
    await requireWorkspaceAccess(context, args.workspaceId);
    return context.pubsub.subscribe('projectChanged');
  },
  resolve: async (payload, args, context) => {
    if (payload.workspaceId !== args.workspaceId) return null;

    // Re-validate membership by querying the database directly
    const membership = await context.prisma.workspaceMembership.findUnique({
      where: {
        workspaceId_userId: {
          workspaceId: args.workspaceId,
          userId: context.userId,
        },
      },
    });
    if (!membership) return null;

    return payload;
  },
},
```

The same pattern applies to `taskChanged`.

### Handling Membership Revocation Without membershipChanged Subscription

Without the `membershipChanged` subscription, revocation is detected passively:

1. A removed user's next API call for that workspace returns NOT_FOUND.
2. The client handles NOT_FOUND by removing the workspace from the local workspace list and navigating to another workspace.
3. Active subscriptions stop forwarding events because per-event re-validation detects the missing membership.
4. The client can periodically re-fetch the workspace list to detect removals (e.g., on app focus or on a timer). This is optional and can be added if users report confusion.

## Error Messages

| Scenario | Error Code | User-Facing Message |
|---|---|---|
| Not a workspace member | `NOT_FOUND` | "Workspace not found" |
| Not a workspace owner (for owner-only ops) | `NOT_FOUND` | "Workspace not found" |
| Add already-member | `BAD_USER_INPUT` | "This user is already a member of this workspace" |
| Add self | `BAD_USER_INPUT` | "You are already a member of this workspace" |
| Add duplicate pending invitation | `BAD_USER_INPUT` | "An invitation has already been sent to this email" |
| Invalid email format | `BAD_USER_INPUT` | "Please enter a valid email address" |
| Accept expired invitation | `BAD_USER_INPUT` | "This invitation has expired. Ask the workspace owner to send a new one." |
| Accept invitation for deleted workspace | `NOT_FOUND` | "Workspace not found" |
| Remove last owner | `BAD_USER_INPUT` | "Cannot remove the last owner. Transfer ownership to another member first." |
| Demote last owner | `BAD_USER_INPUT` | "Cannot demote the last owner. Promote another member to owner first." |
| Last owner trying to leave | `BAD_USER_INPUT` | "You are the last owner of this workspace. Transfer ownership to another member before leaving." |
| Workspace at member limit | `BAD_USER_INPUT` | "This workspace has reached the maximum number of members (25)" |
| Invitation not found | `NOT_FOUND` | "Invitation not found" |

## Rate Limiting

- **Pending invitations**: Max 10 pending (non-expired) invitations per workspace at any time. Enforced in `addMember` by counting non-expired invitations.
- **Member limit**: Max 25 members per workspace. Enforced in `addMember` and `acceptInvitation` by counting active memberships.

## Testing

### Unit Tests

- `membership.test.ts`: CRUD for `WorkspaceMembership`, role changes, last-OWNER guard, self-removal, FOR UPDATE lock behavior
- `invitation.test.ts`: Create/cancel invitations, expiry, duplicate prevention, accept/decline by new user
- `workspace-auth.test.ts`: Updated to test membership-based auth instead of `createdById`-based, transitional fallback during migration
- `project.test.ts`: Updated to verify MEMBER access (not just OWNER), verify workspaceId is not updatable
- `task.test.ts`: Updated to verify MEMBER access, denormalized `workspaceId`, verify workspaceId is not updatable

### Integration Tests

- Full direct-add flow: OWNER adds existing user by email -> user immediately has access
- Full invitation flow: OWNER adds non-existing email -> user registers -> sees pending invitation during onboarding -> accepts -> gains access
- Decline flow: User registers -> sees pending invitation -> declines -> does not gain access
- Member removal: OWNER removes MEMBER -> MEMBER's next API call returns NOT_FOUND
- Self-removal (leave): MEMBER calls removeMember with own userId -> loses access
- Owner protection: Two OWNERs, demote one, try to demote the other (should fail)
- Subscription re-validation: Removed user stops receiving `projectChanged` / `taskChanged` events
- Cross-workspace isolation: MEMBER of workspace A cannot access workspace B
- Soft-delete leak: Cannot accept invitation for a soft-deleted workspace
- Expired invitation: Cannot accept an expired invitation

### Client Tests

- `MemberList.test.tsx`: Renders members, shows/hides management controls based on role, confirmation dialogs for remove/leave
- `PendingInvitations.test.tsx`: Shows invitations during onboarding, handles accept/decline
- Confirmation dialog tests: Verify dialogs appear for destructive actions

## Files Changed

### Backend

| File | Change |
|---|---|
| `backend/prisma/schema.prisma` | Rename `ownerId` to `createdById`, add `WorkspaceMembership` and `WorkspaceInvitation` models, `WorkspaceRole` enum, `workspaceId` on Task, updated relations on User/Workspace |
| `backend/src/schema/schema.graphql` | Add membership types, invitation types, `AddMemberResult` union, new queries/mutations, update `AuthPayload` |
| `backend/src/schema/membership.ts` | New: membership and add-member resolvers |
| `backend/src/schema/membership.test.ts` | New: membership resolver tests |
| `backend/src/schema/invitation.ts` | New: invitation resolvers (accept, decline, cancel) |
| `backend/src/schema/invitation.test.ts` | New: invitation resolver tests |
| `backend/src/schema/workspace.ts` | Add `members`, `invitations`, `role` field resolvers |
| `backend/src/schema/workspace.test.ts` | Update for membership-based tests |
| `backend/src/schema/project.ts` | Update access checks to use new helpers |
| `backend/src/schema/project.test.ts` | Add MEMBER access tests, verify workspaceId immutability |
| `backend/src/schema/task.ts` | Set `workspaceId` on create, update access checks |
| `backend/src/schema/task.test.ts` | Add MEMBER access tests, `workspaceId` tests, verify workspaceId immutability |
| `backend/src/schema/auth.ts` | Return pending invitations on register (no auto-accept) |
| `backend/src/schema/index.ts` | Register membership/invitation resolvers |
| `backend/src/auth/workspace.ts` | Rewrite helpers: membership-based with direct DB queries |
| `backend/src/auth/workspace.test.ts` | Rewrite tests for membership-based auth |
| `backend/src/context.ts` | Update `ServerContext` (remove `getMemberships` cache) |
| `backend/src/index.ts` | Update context factory |
| `backend/src/scripts/backfill-memberships.ts` | New: idempotent membership backfill + task workspaceId backfill with skip-and-log for edge cases |
| `backend/src/scripts/seed.ts` | Create membership for seeded user |
| `backend/src/scripts/seed-dev.ts` | Create membership for dev user |
| `backend/src/__generated__/graphql.ts` | Regenerated |
| `backend/src/index.test.ts` | Update integration tests for membership-based auth |

### Client

| File | Change |
|---|---|
| `web/src/renderer/components/members/MemberList.tsx` | New: workspace member list and management UI with confirmation dialogs |
| `web/src/renderer/components/members/MemberList.test.tsx` | New: member list tests including confirmation dialogs |
| `web/src/renderer/components/onboarding/PendingInvitations.tsx` | New: post-registration invitation acceptance flow |
| `web/src/renderer/components/onboarding/PendingInvitations.test.tsx` | New: onboarding invitation tests |
| `web/src/renderer/navigation/context.tsx` | Add `members` and `invitations` view types |
| `web/src/renderer/components/layout/Sidebar.tsx` | Add "Members" navigation item |
| `web/src/renderer/components/layout/AppShell.tsx` | Handle `members`/`invitations` views, onboarding flow after registration |
| `web/src/renderer/workspace/context.tsx` | Add `currentRole` to context |
| `web/src/renderer/graphql/queries.ts` | Add member/invitation queries |
| `web/src/renderer/graphql/mutations.ts` | Add member/invitation mutations |
| `web/src/renderer/hooks/useGraphQL.ts` | Add member/invitation hooks |
| `web/src/renderer/graphql/__generated__/generated.ts` | Regenerated |

## Decided Questions

| Question | Decision |
|---|---|
| How many roles? | Two: OWNER and MEMBER. Keep it simple. |
| Can MEMBERs add other members? | No. Only OWNERs can add members. |
| Can MEMBERs manage (create/update/delete) projects/tasks? | Yes. Full CRUD on all workspace resources. This is intentional for a small-team tool. |
| What happens when you add an existing user? | They are directly added to the workspace. No invitation ceremony. The OWNER sees "Added [name] to [workspace]". |
| What happens when you add a non-existing email? | A pending invitation is stored. The OWNER sees "Invitation saved. [email] will be added when they create an Orca account." |
| How are pending invitations handled on registration? | Shown during onboarding. User must explicitly accept or decline each one. No auto-join. |
| Are pending invitations processed on login? | No. Login does not check for invitations. Only registration surfaces them. Existing users are added directly via `addMember`. |
| Should invitations have tokens/links? | No for Phase 2. Email-based links are a future enhancement. |
| Can OWNERs leave? | Only if there is at least one other OWNER. They call `removeMember` with their own userId. |
| What about the `ownerId` field? | Renamed to `createdById`. Purely historical — no authorization significance. |
| How is Task.workspaceId maintained? | Set on create from project's workspaceId. Immutable. Not exposed in any update input. |
| Can projects move between workspaces? | No. `workspaceId` is not in `UpdateProjectInput`. This is an enforced invariant. |
| Race condition on last-OWNER demotion? | `SELECT ... FOR UPDATE` on OWNER membership rows (not the workspace row). |
| Real-time membership change notifications? | Cut. Users detect removal on next API call (NOT_FOUND) or subscription event drop. |
| Membership context cache? | Cut. Direct DB queries for now. Add caching later if profiling shows need. |
| Maximum members per workspace? | 25. Configurable constant. |
| Maximum pending invitations per workspace? | 10. Configurable constant. |
| How long do invitations last? | 7 days. |

---

## Review Discussion

This section documents the reviewer feedback that shaped this revision and the rationale for each resolution.

### Feedback Item 1: Invitation Flow Is Broken

**Reviewers**: User Advocate, Product Strategist, Architect

**Problem**: The original spec had an invitation model where the invitee was never notified (no email, no link, no notification). Two alternative models were discussed: direct-add (Simplifier, Product Strategist) and copyable invite links (User Advocate).

**Resolution**: Adopted a **hybrid direct-add model**. Existing users are added immediately when an OWNER provides their email -- no ceremony needed. For non-existing users, a pending invitation is stored and presented when they register. This is the simplest model that actually works without email delivery infrastructure. The OWNER sees clear feedback about which path was taken.

### Feedback Item 2: Auto-Accept Must Require Consent

**Reviewers**: User Advocate, Architect, Paranoid Engineer

**Problem**: The original spec auto-accepted invitations on both login and registration, silently adding workspace access without user consent.

**Resolution**: Removed all auto-accept behavior. On registration, pending invitations are returned in the `AuthPayload` and shown during onboarding. The user must explicitly accept or decline each one. On login, invitations are not processed at all (existing users are added directly via `addMember`). This ensures users always consent to new workspace access.

### Feedback Item 3: Task.workspaceId Invariant Must Be Enforced

**Reviewer**: Paranoid Engineer (critical), Architect

**Problem**: The spec stated "projects can't move between workspaces" but nothing enforced it.

**Resolution**: `workspaceId` is not present in `UpdateProjectInput` or `UpdateTaskInput`. The resolvers never accept it as an updatable field. This is enforced at the schema level (the field does not exist in the input type) and documented as an explicit invariant in the spec.

### Feedback Item 4: Rename ownerId to createdById

**Reviewer**: Architect

**Problem**: Having both `ownerId` on Workspace and OWNER role on WorkspaceMembership created two sources of truth for "ownership."

**Resolution**: Renamed `ownerId` to `createdById`. The field is purely historical -- it records who created the workspace and has no authorization significance. All access control flows through WorkspaceMembership.

### Feedback Item 5: Fix SELECT FOR UPDATE Lock Target

**Reviewer**: Paranoid Engineer

**Problem**: The original spec locked the workspace row, but that does not prevent concurrent membership mutations from proceeding.

**Resolution**: Changed the lock target to the OWNER membership rows: `SELECT id FROM "WorkspaceMembership" WHERE "workspaceId" = $1 AND "role" = 'OWNER' FOR UPDATE`. This correctly serializes concurrent operations that affect the OWNER count.

### Feedback Item 6: Handle Idempotency on Registration

**Reviewer**: Paranoid Engineer

**Problem**: Originally about auto-accept race conditions on registration.

**Resolution**: Since auto-accept was removed entirely (item 2), this becomes simpler. Membership creation happens only when a user explicitly calls `acceptInvitation`. The resolver uses `ON CONFLICT DO NOTHING` on the `[workspaceId, userId]` unique constraint as a safety net for the rare case of duplicate accept requests.

### Feedback Item 7: Scope Reduction

**Reviewer**: Simplifier

**Problem**: Original spec had 7 mutations, a subscription, and a context cache. Too much surface area.

**Resolution**: Reduced to 6 focused mutations: `addMember`, `removeMember`, `updateMemberRole`, `cancelInvitation`, `acceptInvitation`, `declineInvitation`. Cut the `membershipChanged` subscription (users detect changes passively). Cut the `getMemberships` context cache (premature optimization). Merged `leaveWorkspace` into `removeMember` (self-removal). Replaced `inviteMember` + `revokeInvitation` with `addMember` + `cancelInvitation`.

### Feedback Item 8: Subscription Re-Validation Must Re-Query DB

**Reviewers**: Paranoid Engineer, Architect

**Problem**: Per-event subscription re-validation should query the database directly, not use a cached result.

**Resolution**: Since we cut the membership cache, this is naturally addressed. The existing `projectChanged` and `taskChanged` subscriptions re-validate by querying `WorkspaceMembership` directly per event.

### Feedback Item 9: Soft-Delete Leaks

**Reviewer**: Paranoid Engineer

**Problem**: Various code paths might not check `workspace.deletedAt`.

**Resolution**: All workspace access helpers already filter `deletedAt`. The `addMember` path goes through `requireWorkspaceOwner` which checks it. The `acceptInvitation` resolver explicitly checks `workspace.deletedAt`. Documented in the Edge Cases section.

### Feedback Item 10: Backfill Edge Cases

**Reviewer**: Paranoid Engineer

**Problem**: Tasks with deleted projects could break the backfill.

**Resolution**: Backfill script handles null projects by logging a warning and skipping. Verification query confirms zero null `workspaceId` values before the NOT NULL migration. If skipped tasks exist, the script exits with an error directing the operator to resolve them manually.

### Feedback Item 11: Permission Model Clarity

**Reviewer**: User Advocate

**Problem**: Can a MEMBER delete another member's project or task?

**Resolution**: Yes. All workspace members have equal CRUD on all workspace resources. This is documented explicitly in the Permission Philosophy section and the Permission Matrix. This is intentional for a small-team tool.

### Feedback Item 12: Confirmation Dialogs

**Reviewer**: User Advocate

**Problem**: Destructive actions (remove member, leave workspace) need confirmation.

**Resolution**: Added confirmation dialogs for remove member, leave workspace, and cancel invitation. Dialog text is specified in the Client Changes section.

### Feedback Item 13: Post-Add UX

**Reviewer**: Product Strategist

**Problem**: After adding a member, the OWNER needs clear feedback about what happened.

**Resolution**: The `AddMemberResult` union returns a `message` field with context-appropriate text. For existing users: "Added [name] to [workspace]". For non-existing users: "Invitation saved. [email] will be added when they create an Orca account. Let them know to sign up." The client shows this as a toast/snackbar.
