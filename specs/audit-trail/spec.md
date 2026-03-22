---
status: In Progress
worktree: ../worktrees/orca/feat/ORCA-33-audit-trail
branch: feat/ORCA-33-audit-trail
---

# Audit Trail / Activity Feed

## Summary

Add an audit trail system to Orca that records and surfaces changes to Tasks, Projects, and Initiatives. Every mutation and automated webhook action produces an `AuditEvent` record, enabling activity timelines on entity detail pages and project/initiative feeds. Automated changes (GitHub webhook-driven status transitions) are attributed to a `SYSTEM` actor.

## Motivation

Orca orchestrates AI agents (starting with Claude Code) to work on tasks. When multiple agents and humans are making changes — reassigning tasks, changing status, linking PRs — visibility into _who_ (or _what_) changed something and _when_ is essential. Today Orca has zero change history. Users cannot see:

- Whether a task's status was changed by a human or automatically by a GitHub PR merge
- Who reassigned a task or changed its priority
- A timeline of what happened to a task an agent was working on
- Activity across a project's tasks

For an AI agent orchestration tool, distinguishing human vs. automated actions is a core concern, not a secondary one. The audit trail makes agent activity visible and accountable.

## Success Criteria

- Users can view a chronological activity timeline on any task detail page
- The timeline clearly distinguishes human actions from system/automated actions
- Activity feeds load within 200ms for tasks with <100 events
- The system records events for all task mutations and webhook-triggered status changes without impacting mutation latency

## Scope

### In scope
- **Entities**: Tasks, Projects, Initiatives
- **Actions tracked**: Create, update (field-level), archive
- **Actors**: User-initiated (via mutations) and system-initiated (via GitHub webhooks)
- **UI surfaces**: Task detail page timeline, Project/Initiative activity feeds
- **Pagination**: Cursor-based pagination (first paginated resource in the codebase)

### Out of scope (future work)
- Workspace-level activity feed
- Workspace admin actions (member changes, settings, GitHub installation)
- PR link/unlink audit events (PR linking has its own UI surface; defer to follow-up)
- Real-time subscription for activity events (query-based feed first; subscription follow-up)
- Retention/cleanup policies
- Activity search/filtering UI
- Export/compliance features

## Data Model

### New Prisma enums and model

```prisma
enum AuditEntityType {
  TASK
  PROJECT
  INITIATIVE
}

enum AuditAction {
  CREATED
  UPDATED
  ARCHIVED
}

enum AuditActorType {
  USER
  SYSTEM
}

model AuditEvent {
  id          String          @id @default(cuid())
  entityType  AuditEntityType
  entityId    String
  action      AuditAction
  actorType   AuditActorType
  actorId     String?
  workspaceId String
  workspace   Workspace       @relation(fields: [workspaceId], references: [id], onDelete: Cascade)
  changes     Json            @default("[]")
  createdAt   DateTime        @default(now())

  @@index([workspaceId, createdAt(sort: Desc)])
  @@index([entityType, entityId, createdAt(sort: Desc)])
  @@index([workspaceId, entityType, createdAt(sort: Desc)])
}
```

**Relation additions:**
- `Workspace` model gets `auditEvents AuditEvent[]`

### Design decisions

**Simplified action enum (CREATED, UPDATED, ARCHIVED):**
- v1 uses a single `UPDATED` event per mutation with the `changes` array describing what changed. The UI derives human-readable descriptions from the `changes` array (e.g., a change to `status` renders as "changed status from Todo to In Progress").
- This avoids multi-event-per-mutation complexity — one mutation = one audit event.
- The enum can be extended later (e.g., `STATUS_CHANGED`, `ASSIGNED`) when action-level filtering is needed.

**Single table with JSON `changes` column** (not a normalized FieldChange table):
- Audit events are always read as a unit — no need to join
- Each mutation produces exactly one event — single insert
- Schema evolution: new fields on Task/Project/Initiative are automatically accommodated
- PostgreSQL's JSONB operators allow querying inside the column if needed later

**`entityId` is a plain string, not a foreign key:**
- References different tables depending on `entityType` (Prisma doesn't support polymorphic FKs)
- Audit events survive entity deletion — important for history integrity
- Application layer resolves the entity when needed, handles missing entities gracefully

**No `updatedAt` field:**
- Audit events are append-only, never updated — `updatedAt` would be misleading

**`onDelete: Cascade` for workspace:**
- When a workspace is deleted, its audit trail goes with it (consistent with tasks, projects, etc.)
- Note: as the audit table grows to become the largest table, workspace deletion may require async cleanup at scale. Acceptable for now given workspace deletion is an admin-only, low-frequency operation.

**Actor as `ActorType` enum + nullable `actorId`:**
- Webhook handlers have no user context — `actorType: SYSTEM` with `actorId: null`
- Deleted users: `actorId` becomes orphaned but `actorType: USER` lets UI show "Deleted user"
- Cleaner than a sentinel "system" user row

**Three indexes covering primary query patterns:**
- `[workspaceId, createdAt DESC]` — workspace-wide queries
- `[entityType, entityId, createdAt DESC]` — entity-specific `activity` field queries
- `[workspaceId, entityType, createdAt DESC]` — filtered workspace queries (e.g., "all task events")

### Changes JSON structure

All values are **stringified at write time** (dates as ISO strings, booleans as `"true"`/`"false"`, enums as their string value). This ensures consistent serialization through the `String` GraphQL type.

For reference fields (assigneeId, projectId, labelId), store both the **ID and the display name** at write time. This denormalizes the data but ensures the timeline remains readable even if the referenced entity is later deleted or renamed.

```typescript
// For field updates — single UPDATED event with all changes:
[
  { "field": "status", "oldValue": "TODO", "newValue": "IN_PROGRESS" },
  { "field": "assignee", "oldValue": null, "newValue": "Sarah Chen" },
  { "field": "assigneeId", "oldValue": null, "newValue": "clxyz123" }
]

// For CREATED actions — empty array (the creation fact is the event itself):
[]

// For ARCHIVED — empty array:
[]
```

For label changes within an `UPDATED` event:
```typescript
[
  { "field": "labelsAdded", "oldValue": null, "newValue": "Bug, High Priority" },
  { "field": "labelsRemoved", "oldValue": "Feature Request", "newValue": null }
]
```

**Validation**: The changes array is validated at write time using a zod schema to prevent malformed JSON from being persisted:
```typescript
const auditChangeSchema = z.array(z.object({
  field: z.string(),
  oldValue: z.string().nullable(),
  newValue: z.string().nullable(),
}));
```

## GraphQL API

### New types and enums

```graphql
enum AuditEntityType {
  TASK
  PROJECT
  INITIATIVE
}

enum AuditAction {
  CREATED
  UPDATED
  ARCHIVED
}

enum AuditActorType {
  USER
  SYSTEM
}

type AuditEventChange {
  field: String!
  oldValue: String
  newValue: String
}

type SystemActor {
  label: String!
}

union AuditActor = User | SystemActor

type AuditEvent {
  id: ID!
  entityType: AuditEntityType!
  entityId: ID!
  action: AuditAction!
  actorType: AuditActorType!
  actor: AuditActor
  changes: [AuditEventChange!]!
  createdAt: DateTime!
}

type AuditEventEdge {
  node: AuditEvent!
  cursor: String!
}

type PageInfo {
  hasNextPage: Boolean!
  endCursor: String
}

type AuditEventConnection {
  edges: [AuditEventEdge!]!
  pageInfo: PageInfo!
}
```

### Query additions

```graphql
type Query {
  # Top-level audit event query (scoped to workspace)
  auditEvents(
    workspaceId: ID!
    entityType: AuditEntityType
    entityId: ID
    first: Int = 20
    after: String
  ): AuditEventConnection!
}
```

**Constraints:**
- `first` is capped at `MAX_PAGE_SIZE = 100` in the resolver. Values > 100 are clamped.
- If `entityId` is provided, `entityType` must also be provided. The resolver returns a `BAD_USER_INPUT` error otherwise.

### Entity field additions

```graphql
type Task {
  # ... existing fields ...
  activity(first: Int = 20, after: String): AuditEventConnection!
}

type Project {
  # ... existing fields ...
  activity(first: Int = 20, after: String): AuditEventConnection!
}

type Initiative {
  # ... existing fields ...
  activity(first: Int = 20, after: String): AuditEventConnection!
}
```

The `activity` field resolvers delegate to the same underlying query logic, filtering by `entityType` and `entityId` from the parent. These field resolvers **trust the parent entity's access check** and do not re-validate workspace membership (the parent resolver already enforced access).

### Pagination design

Cursor-based pagination using `createdAt` + `id` composite cursor:

```typescript
// Encode: base64url of "createdAt_ISO|id"
// Note: "|" is safe as a delimiter because CUIDs only contain [a-z0-9]
function encodeCursor(event: AuditEvent): string {
  return Buffer.from(`${event.createdAt.toISOString()}|${event.id}`).toString('base64url');
}

// Decode with validation
function decodeCursor(cursor: string): { createdAt: Date; id: string } {
  const decoded = Buffer.from(cursor, 'base64url').toString();
  const separatorIndex = decoded.indexOf('|');
  if (separatorIndex === -1) {
    throw new GraphQLError('Invalid cursor', { extensions: { code: 'BAD_USER_INPUT' } });
  }
  const iso = decoded.slice(0, separatorIndex);
  const id = decoded.slice(separatorIndex + 1);
  const createdAt = new Date(iso);
  if (isNaN(createdAt.getTime()) || !id) {
    throw new GraphQLError('Invalid cursor', { extensions: { code: 'BAD_USER_INPUT' } });
  }
  return { createdAt, id };
}

// Query uses orderBy: [{ createdAt: 'desc' }, { id: 'desc' }] for deterministic ordering
// Fetch first+1 rows, hasNextPage = result.length > first
```

This is the first paginated resource in the codebase. The `PageInfo` and `Edge` types are generic and reusable for future pagination needs.

### Actor resolution

The `actor` field uses a GraphQL union:
- `actorType: USER` + non-null `actorId` → resolves to `User` object (fetched via `prisma.user.findUnique`)
- `actorType: USER` + null `actorId` (deleted user) → resolves to `SystemActor { label: "Deleted user" }` (explicit fallback, never null)
- `actorType: SYSTEM` → resolves to `SystemActor { label: "System" }`

The union needs a `__resolveType` function in the resolver index (following the existing `AddMemberResult` pattern).

### Auth enforcement

**`Query.auditEvents`**: Calls `requireWorkspaceAccess(context.prisma, context.userId, args.workspaceId)` as the first operation. Unauthorized users receive a `NOT_FOUND` error (consistent with existing patterns that hide resource existence).

**`Task.activity` / `Project.activity` / `Initiative.activity`**: Trust the parent resolver's access check. The parent `task(id)` / `project(id)` / `initiative(id)` resolver already calls `requireTaskAccess` / `requireProjectAccess` / `requireInitiativeAccess`. No redundant membership check.

## Backend Implementation

### Audit event recording utility

Create `backend/src/audit/record-event.ts`:

```typescript
import type { PrismaClient } from '@prisma/client';
import { z } from 'zod';

const auditChangeSchema = z.array(z.object({
  field: z.string(),
  oldValue: z.string().nullable(),
  newValue: z.string().nullable(),
}));

interface AuditEventInput {
  entityType: AuditEntityType;
  entityId: string;
  action: AuditAction;
  actorType: AuditActorType;
  actorId?: string | null;
  workspaceId: string;
  changes?: Array<{ field: string; oldValue: string | null; newValue: string | null }>;
}

export async function recordAuditEvent(
  prisma: PrismaClient,
  input: AuditEventInput,
): Promise<void> {
  try {
    const changes = auditChangeSchema.parse(input.changes ?? []);
    await prisma.auditEvent.create({
      data: {
        entityType: input.entityType,
        entityId: input.entityId,
        action: input.action,
        actorType: input.actorType,
        actorId: input.actorId ?? null,
        workspaceId: input.workspaceId,
        changes,
      },
    });
  } catch (error) {
    // Structured error log — audit failures must be observable, never silent
    console.error(JSON.stringify({
      event: 'audit_event_write_failed',
      entityType: input.entityType,
      entityId: input.entityId,
      action: input.action,
      error: error instanceof Error ? error.message : String(error),
    }));
  }
}
```

**Key design choices:**
- **Fire-and-forget with structured logging**: Audit event write failures do not block the primary mutation. However, all failures are logged as structured JSON so they are observable in production and can trigger alerts.
- **Zod validation at write time**: Prevents malformed changes from being persisted.
- **No pubsub publish in v1**: Subscription is deferred; the publish call will be added in the subscription follow-up task.

### Diff helper

Create `backend/src/audit/diff.ts`:

```typescript
/**
 * Compares before/after states and returns stringified changes.
 * All values are converted to strings for consistent GraphQL serialization.
 */
export function diffFields<T extends Record<string, unknown>>(
  before: T,
  after: Partial<T>,
  fields: (keyof T)[],
): Array<{ field: string; oldValue: string | null; newValue: string | null }> {
  const changes: Array<{ field: string; oldValue: string | null; newValue: string | null }> = [];
  for (const field of fields) {
    if (field in after && before[field] !== after[field]) {
      changes.push({
        field: String(field),
        oldValue: before[field] != null ? String(before[field]) : null,
        newValue: after[field] != null ? String(after[field]) : null,
      });
    }
  }
  return changes;
}
```

### Display name resolution at write time

For reference fields (assigneeId, projectId, labels), the recording code resolves display names at write time and includes them in the changes array alongside the raw ID. This denormalizes the data but ensures:
- The timeline is readable even after entities are deleted
- No additional queries are needed at read time

Example: when `assigneeId` changes, the diff produces:
```typescript
[
  { field: "assigneeId", oldValue: "cid_old", newValue: "cid_new" },
  { field: "assignee", oldValue: "Kyle Smith", newValue: "Sarah Chen" }
]
```

The UI renders the display name field (`assignee`) and ignores the ID field (`assigneeId`).

### Integration into mutations

**Pattern**: Each mutation already loads the entity "before" state (via `requireTaskAccess` etc.). After the Prisma write, call `recordAuditEvent` with the diff. One mutation = one audit event.

**Task mutations** (`backend/src/schema/task.ts`):
- `createTask` → `recordAuditEvent({ action: 'CREATED', changes: [] })`
- `updateTask` → `recordAuditEvent({ action: 'UPDATED', changes: diffFields(before, after, [...]) })`
  - The changes array captures all fields that changed in one event
  - For label changes: compute added/removed labels and include `labelsAdded`/`labelsRemoved` display-name fields
  - For assignee/project changes: include both ID and display-name fields
- `archiveTask` → `recordAuditEvent({ action: 'ARCHIVED', changes: [] })`

**Project mutations** (`backend/src/schema/project.ts`):
- `createProject` → `CREATED`
- `updateProject` → `UPDATED` (with field diffs)
- `archiveProject` → `ARCHIVED`

**Initiative mutations** (`backend/src/schema/initiative.ts`):
- Same pattern as projects

**Webhook handlers** (`backend/src/webhooks/github-events.ts`):
- Status auto-transitions (PR open → IN_REVIEW, PR merge → DONE, PR reopen → IN_REVIEW) → `UPDATED` with `actorType: SYSTEM`, changes: `[{ field: "status", oldValue: "TODO", newValue: "DONE" }]`

### Resolver file

Create `backend/src/schema/audit-event.ts`:

**`Query.auditEvents`:**
1. `requireWorkspaceAccess(context.prisma, context.userId, args.workspaceId)`
2. Validate: if `entityId` provided without `entityType`, throw `BAD_USER_INPUT`
3. Clamp `first` to `MAX_PAGE_SIZE` (100)
4. Decode `after` cursor if provided (with validation)
5. Build Prisma where clause from args
6. Query with `orderBy: [{ createdAt: 'desc' }, { id: 'desc' }]`, `take: first + 1`
7. Construct edges with cursors, determine `hasNextPage`

**`AuditEvent.actor`:**
- If `actorType === 'SYSTEM'`: return `{ __typename: 'SystemActor', label: 'System' }`
- If `actorId` is non-null: fetch `prisma.user.findUnique({ where: { id: actorId } })`
  - If found: return user
  - If not found (deleted): return `{ __typename: 'SystemActor', label: 'Deleted user' }`
- If `actorId` is null and `actorType === 'USER'`: return `{ __typename: 'SystemActor', label: 'Deleted user' }`

**`AuditEvent.changes`:**
- Parse the JSON column (already an array of objects from Prisma)
- Map to `AuditEventChange[]` — no transformation needed since values are stored as strings

**`Task.activity` / `Project.activity` / `Initiative.activity`:**
- Delegate to shared `queryAuditEvents()` function with `entityType` and `entityId` from parent
- No additional auth check (parent already validated)

### Codegen additions

In `backend/codegen.ts`:
- Mapper: `AuditEvent: '@prisma/client#AuditEvent as AuditEventModel'`
- Enum values: `AuditEntityType`, `AuditAction`, `AuditActorType` mapped to Prisma enums

## Client Implementation

### GraphQL operations

**Query** (`web/src/renderer/graphql/queries.ts`):
```graphql
query TaskActivity($taskId: ID!, $first: Int, $after: String) {
  task(id: $taskId) {
    id
    activity(first: $first, after: $after) {
      edges {
        node {
          id
          action
          actorType
          actor {
            ... on User { id name email }
            ... on SystemActor { label }
          }
          changes { field oldValue newValue }
          createdAt
        }
        cursor
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
}
```

Similar queries for `ProjectActivity` and `InitiativeActivity`.

### UI Components

**ActivityTimeline** — primary component for displaying audit events:

```
┌─────────────────────────────────────────────────┐
│ Activity                                         │
├─────────────────────────────────────────────────┤
│ ○ Kyle changed status from Todo → In Progress    │
│   2 hours ago                                    │
│                                                  │
│ ○ System changed status to Done                  │
│   1 hour ago                                     │
│                                                  │
│ ○ Kyle assigned to Sarah, changed priority to    │
│   High                                           │
│   45 minutes ago                                 │
│                                                  │
│ [Load more]                                      │
├─────────────────────────────────────────────────┤
│ (empty state: "No activity recorded yet")        │
└─────────────────────────────────────────────────┘
```

- Renders a vertical timeline with icons per action type
- Shows actor name (or "System" for automated, "Deleted user" for deleted actors), action description, and relative time
- "Load more" button for cursor pagination
- Placed in the task detail panel (below existing content, in a scrollable section with max-height to prevent pushing other content off-screen)
- **Empty state**: "No activity recorded yet" for tasks created before the feature or with no events
- **Loading state**: Skeleton loader matching existing `TaskDetailSkeleton` patterns
- **Error state**: Inline error message with retry action

**Event description rendering**: The `changes` array drives the description for `UPDATED` events:

| Change field | Rendered as |
|-------------|-------------|
| `status` | "changed status from {oldValue} → {newValue}" |
| `assignee` | "assigned to {newValue}" / "unassigned {oldValue}" |
| `priority` | "changed priority to {newValue}" |
| `title` | "renamed task" |
| `description` | "updated description" |
| `project` | "moved to {newValue}" / "removed from project" |
| `labelsAdded` | "added label {newValue}" |
| `labelsRemoved` | "removed label {oldValue}" |

When an `UPDATED` event has multiple changes, they are combined: "changed status to In Progress and assigned to Sarah".

**Enum display names**: Raw enum values (e.g., `IN_PROGRESS`) are mapped to display names (e.g., "In Progress") using a shared mapping utility. Status and priority values reuse existing `StatusIcon` and `PriorityIcon` components.

**Styling**: Uses existing Fathom design system tokens:
- `text-fg-muted` for timestamps and system actor
- `text-fg` for actor names and action text
- `border-edge-subtle` for timeline connector line
- `text-body-sm` for event text

## Migration Strategy

**No backfill of existing data.** Tasks, projects, and initiatives created before this feature will show an empty activity timeline with the message "No activity recorded yet." This is acceptable because:
- Reconstructing history from `updatedAt` timestamps is lossy and unreliable
- The feature begins recording immediately upon deployment
- Users understand that history starts from the point the feature is enabled

The Prisma migration creates a new empty table — no existing tables are locked or modified (beyond adding the `auditEvents` relation to Workspace, which is a schema-only change in Prisma).

## Implementation Tasks (Incremental)

Tasks are ordered to deliver a **vertical slice** as early as possible — the first user-visible value ships at Task 3.

### Task 1: Prisma schema + migration + audit utility
- Add `AuditEntityType`, `AuditAction`, `AuditActorType` enums
- Add `AuditEvent` model with three indexes
- Add relation field to `Workspace`
- Run migration and generate client
- Create `backend/src/audit/record-event.ts` with `recordAuditEvent` helper
- Create `backend/src/audit/diff.ts` with `diffFields` helper
- Add zod dependency if not present
- Unit tests for diff helper and changes validation

### Task 2: GraphQL API + resolvers + wire into Task mutations
- Add all types, enums, queries to `schema.graphql`
- Create `audit-event.ts` resolver with pagination, actor resolution, changes parsing
- Add `activity` field resolver to Task type
- Update codegen config and resolver index
- Wire `recordAuditEvent` into `createTask`, `updateTask`, `archiveTask`
- Wire into webhook handlers for system-initiated task status changes
- Tests for resolver (auth, pagination, actor resolution, cursor validation)

### Task 3: Client — ActivityTimeline on Task detail
- Add `TaskActivity` GraphQL query
- Run codegen in `web/`
- Create `ActivityTimeline` component with event description rendering
- Create enum display name mapping utilities
- Handle empty state, loading state, error state
- Integrate into TaskDetail page
- Manual testing: create/update/archive tasks and verify timeline

### Task 4: Wire into Project + Initiative mutations
- Wire `recordAuditEvent` into project and initiative CRUD mutations
- Add `activity` field resolvers to Project and Initiative types
- Add `ProjectActivity` and `InitiativeActivity` GraphQL queries in client

### Task 5: Client — Project + Initiative activity
- Add activity section to ProjectDetail and InitiativeDetail pages
- Reuse ActivityTimeline component with project/initiative scoping

### Follow-up tasks (future)
- **Subscription**: Add `auditEventCreated` subscription (entity-scoped: accept `entityType` + `entityId` filters to avoid broadcasting all workspace events to every client)
- **PR events**: Add `PR_LINKED` / `PR_UNLINKED` action types and wire into PR mutations + webhooks
- **Retention**: Add background job for pruning old events (target: before table exceeds ~10M rows)
- **Workspace activity feed**: Top-level workspace activity page

## Testing Strategy

- **Unit tests**: Diff helper, cursor encode/decode, changes validation (zod), event description formatting
- **Integration tests**: Resolver tests following existing patterns in `task.test.ts` — auth enforcement, pagination correctness (first page, second page, empty), actor resolution (user, system, deleted user), cursor validation (malformed input)
- **Manual testing**: Verify events appear on task detail after mutations, verify system actor for webhook-triggered changes, verify empty state for pre-existing tasks

## Risks and Mitigations

| Risk | Mitigation |
|------|-----------|
| Audit write failure blocks mutation | Fire-and-forget with try/catch; structured error logging for observability |
| Table growth (est. ~400 rows/day per active workspace) | Indexes optimized for query patterns; retention/cleanup deferred but planned as follow-up before ~10M rows |
| First pagination implementation | Simple cursor pattern documented as template; `MAX_PAGE_SIZE` cap prevents abuse |
| Malformed cursor input | Validated at decode time with safe `BAD_USER_INPUT` error |
| Display names stale after entity rename | Accepted trade-off — audit records show the name at time of change, which is correct for an audit trail |

## Review Discussion

### Key Feedback Addressed

- **Pragmatic Architect** raised that multi-event-per-mutation creates atomicity issues and `changes` values must be stringified; resolved by collapsing to single `UPDATED` event per mutation and stringifying all values at write time.
- **Paranoid Engineer** raised auth enforcement gaps on queries/subscriptions and cursor validation; resolved by specifying explicit auth contracts for each resolver and adding cursor decode validation.
- **Paranoid Engineer** raised that `first` parameter needs an upper bound; resolved with `MAX_PAGE_SIZE = 100`.
- **Operator** raised missing index for `(workspaceId, entityType, createdAt)` queries; resolved by adding the third composite index.
- **Operator** raised silent audit failures need structured logging; resolved with JSON error logging in `recordAuditEvent`.
- **Operator** raised missing migration strategy; resolved with explicit "no backfill" decision and rationale.
- **User Advocate** raised that raw IDs in changes are unusable; resolved by storing display names at write time alongside IDs.
- **User Advocate** raised missing empty/loading/error states; resolved with explicit state definitions.
- **Product Strategist** raised missing success criteria and that tasks should deliver vertical slices; resolved with success criteria section and reordered task plan.

### Tradeoffs Considered

- **Simplifier** suggested deferring Project/Initiative to v1+1 to focus on Tasks. Kept in scope because the user explicitly requested both, but moved to later tasks (4-5) so Task audit trail ships first.
- **Simplifier** suggested offset pagination over cursor pagination for v1. Chose cursor pagination because audit events are append-only (offset would cause duplicates/skips as new events are inserted) and to establish the pattern for the codebase.
- **Product Strategist** questioned whether audit trail is the right thing to build now vs. agent execution logs. Accepted: for an AI orchestration tool, audit trail provides immediate value in understanding agent vs. human actions. Agent execution logs are a separate, complementary feature.

### Dissenting Perspectives

- **Simplifier** raised that `AuditActorType` enum is redundant alongside the `AuditActor` union — the presence/absence of `actorId` plus the union type already encodes the distinction. Kept for now because the enum is useful for database-level queries and filtering without joining, but acknowledged it's mild duplication.
- **Operator** raised concern about workspace deletion cascade on a large audit table causing long locks. Deferred — workspace deletion is admin-only and low-frequency. Will address with async cleanup if it becomes an issue at scale.
