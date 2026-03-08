---
status: Implemented
worktree: ../worktrees/orca/feat/task-table-ui
branch: feat/task-table-ui
completed: 2026-03-07
---

# Linear-Inspired Task Table UI

## Overview

Replace the current simple card-based task list with a modern, dense, Linear-inspired table view. Tasks are displayed in a flat table grouped by status with collapsible sections, inline metadata columns, keyboard navigation, and smooth interactions.

This spec also introduces a `priority` field on tasks to support priority indicators in the table.

## Goals

- **Fast and dense**: Show more information per screen with less visual noise
- **Scannable**: Status, priority, title, and metadata visible at a glance without clicking
- **Keyboard-first**: Navigate tasks with arrow keys, open with Enter
- **Accessible**: ARIA roles and labels for screen reader support
- **Consistent with Linear's proven patterns**: Grouped-by-status table, implicit columns, borderless rows

## Scope

### In Scope

- Task table component with status grouping and collapsible sections
- Row layout: priority icon, status icon, title, date
- Keyboard navigation (arrow keys, Enter) with clear focus model
- Row hover states
- Priority field addition (data model + UI)
- Inline task creation from group headers
- ARIA attributes for accessibility

### Out of Scope (Future)

- Project list redesign (evaluate after task table ships)
- Drag-and-drop row reordering
- Bulk selection and bulk actions (multi-select toolbar, row checkboxes)
- Assignee field and avatar column (no assignee in data model yet)
- Column resizing or reordering
- Custom views/filters/saved views
- Virtual scrolling (defer until performance issues arise with 100+ tasks)

## Data Model Changes

### Add Priority to Task

#### Prisma Schema

```prisma
enum TaskPriority {
  NONE
  LOW
  MEDIUM
  HIGH
  URGENT
}

model Task {
  id               String       @id @default(cuid())
  title            String
  description      String?
  status           TaskStatus   @default(TODO)
  priority         TaskPriority @default(NONE)
  projectId        String
  project          Project      @relation(fields: [projectId], references: [id], onDelete: Cascade)
  workingDirectory String
  createdAt        DateTime     @default(now())
  updatedAt        DateTime     @updatedAt
}
```

#### GraphQL Schema

```graphql
enum TaskPriority {
  NONE
  LOW
  MEDIUM
  HIGH
  URGENT
}

type Task {
  id: ID!
  title: String!
  description: String
  status: TaskStatus!
  priority: TaskPriority!
  projectId: ID!
  project: Project!
  workingDirectory: String!
  createdAt: String!
  updatedAt: String!
}

input CreateTaskInput {
  title: String!
  description: String
  status: TaskStatus
  priority: TaskPriority
  projectId: ID!
  workingDirectory: String!
}

input UpdateTaskInput {
  title: String
  description: String
  status: TaskStatus
  priority: TaskPriority
  workingDirectory: String
}
```

#### Migration

Simple additive migration — add a `priority` column with default `NONE`. No backfill needed. All existing tasks get `NONE` priority.

```sql
-- Add TaskPriority enum type
CREATE TYPE "TaskPriority" AS ENUM ('NONE', 'LOW', 'MEDIUM', 'HIGH', 'URGENT');

-- Add priority column with default
ALTER TABLE "Task" ADD COLUMN "priority" "TaskPriority" NOT NULL DEFAULT 'NONE';
```

## Task Table Design

### Layout Structure

```
┌─────────────────────────────────────────────────────────────────┐
│  Project Name                                                   │
│  Description text                                               │
├─────────────────────────────────────────────────────────────────┤
│  ▼ ● In Progress  3                                         [+] │
│  ┊┊ ═══ ● Task title here                          Feb 27  │
│  ┊┊ ─── ● Another task title                       Feb 25  │
│  ┊┊ ▲▲▲ ● High priority task                       Feb 20  │
│                                                                 │
│  ▼ ○ Todo  5                                                [+] │
│  ┊┊ ─── ○ Some todo task                            Mar 1   │
│  ┊┊     ○ No priority task                          Feb 28  │
│  ...                                                            │
│                                                                 │
│  ▼ ◉ In Review  1                                           [+] │
│  ┊┊ ─── ◉ Review this thing                         Mar 2   │
│                                                                 │
│  ▶ ✓ Done  12                                               [+] │
│  (collapsed)                                                    │
└─────────────────────────────────────────────────────────────────┘
```

### Row Anatomy

Each task row is a single flex container, ~40px height:

```
[priority] [status-icon] [title                        ] [date]
```

- **Priority icon** (16px): Bars icon indicating level. Always visible (no checkbox on hover — bulk selection is deferred).
  - URGENT: 4 bars, orange/red (`text-orange-500`)
  - HIGH: 3 bars, orange (`text-orange-400`)
  - MEDIUM: 2 bars, yellow (`text-yellow-500`)
  - LOW: 1 bar, blue (`text-blue-400`)
  - NONE: no icon (blank space preserved for alignment)

- **Status icon** (16px): Small colored circle matching the group status
  - TODO: hollow gray circle
  - IN_PROGRESS: half-filled yellow circle
  - IN_REVIEW: filled green-ish circle
  - DONE: filled green circle with checkmark

- **Title** (flex-1): Task title text, single line, truncated with ellipsis

- **Date** (right-aligned, fixed width): Formatted date. Within current year: "Mar 1", "Feb 27". Older: "Jan 15, 2024" (keeps the day for precision). Uses `text-gray-500`.

### Group Headers

Each status group has a collapsible header row:

```
[chevron] [status-icon] [status-label] [count]              [+]
```

- **Chevron**: `▼` expanded, `▶` collapsed. Click toggles.
- **Status icon**: Same as row status icons but slightly larger
- **Status label**: "Todo", "In Progress", "In Review", "Done"
- **Count**: Number of tasks in the group, `text-gray-500`
- **[+] button**: Appears on hover, creates a new task in that status group

### Group Ordering

Groups appear in workflow order, not alphabetical:

1. In Progress
2. In Review
3. Todo
4. Done (collapsed by default)

Empty groups are still shown (with count 0) to maintain consistent layout and allow inline creation.

### Hover States

- **Row hover**: `bg-gray-800/50` background, smooth transition
- **Group header hover**: [+] button becomes visible
- **No visible row borders**: Rows differentiated only by hover state

### Keyboard Navigation

**Focus model**: Clicking any task row focuses the table and activates keyboard navigation. `Escape` releases focus from the table. `Tab` moves focus out of the table to the next focusable element on the page. The table container has `tabIndex={0}` so it can receive focus.

When the task table has focus:

| Key | Action |
|-----|--------|
| `↓` / `j` | Move focus to next task row |
| `↑` / `k` | Move focus to previous task row |
| `Enter` | Open focused task (navigate to task detail) |
| `Escape` | Release focus from table |
| `Tab` | Move focus out of table |

Focused row gets a subtle left border highlight (`border-l-2 border-blue-500`) and a faint background (`bg-gray-800/30`). Collapsed groups are skipped during keyboard navigation.

### Collapsible Groups

- Click the chevron or group header text to toggle
- Collapse state stored in component local state (not persisted)
- "Done" group is collapsed by default
- Collapse animation uses CSS `grid-template-rows: 0fr` → `1fr` transition (~150ms) for smooth height animation without needing to estimate max-height values

### Inline Task Creation

Clicking the [+] on a group header inserts a new row at the top of that group with:
- An auto-focused text input for the task title
- A secondary input for working directory (shown below the title input, pre-filled with the most recently used working directory from the project's existing tasks, or empty if the project has no tasks)
- Pre-set status matching the group
- Default priority: NONE
- `Enter` submits (calls `createTask` mutation) — both title and working directory must be non-empty
- `Escape` cancels
- On mutation error: the inline row stays visible with a red error message below the inputs. The user can retry or press Escape to dismiss.

**Working directory resolution**: The inline create form reads existing tasks in the project and pre-fills `workingDirectory` with the value from the most recently created task. If no tasks exist, the field is empty and the user must provide a path. This avoids adding a new field to the Project model while keeping the common case fast (most tasks in a project share a working directory).

## Component Architecture

### New Components

Row sub-components (`TaskTableRow`, group header rendering) are defined as unexported functions within their parent files to keep the file count manageable. Only components with distinct responsibilities get their own file.

| Component/Utility | File | Description |
|-------------------|------|-------------|
| `TaskTable` | `web/src/renderer/components/tasks/TaskTable.tsx` | Main table component — groups tasks by status, renders group headers and rows, handles keyboard nav. Contains `TaskTableRow` and `TaskTableGroup` as unexported sub-components. |
| `TaskTableInlineCreate` | `web/src/renderer/components/tasks/TaskTableInlineCreate.tsx` | Inline task creation form (title + working directory inputs) |
| `PriorityIcon` | `web/src/renderer/components/shared/PriorityIcon.tsx` | Priority bars SVG icon with color mapping |
| `StatusIcon` | `web/src/renderer/components/shared/StatusIcon.tsx` | Status circle SVG icon (replaces StatusBadge in table context) |
| `formatRelativeDate` | `web/src/renderer/utils/formatRelativeDate.ts` | Utility function (not a component) that formats dates as "Mar 1", "Feb 27", "Jan 15, 2024" for older dates |

### Modified Components

| Component | Change |
|-----------|--------|
| `ProjectDetail.tsx` | Replace `<TaskList>` with `<TaskTable>` |
| `TaskDetail.tsx` | Add priority select dropdown to detail view and edit form |
| `Sidebar.tsx` | Add status icons next to tasks in sidebar |

### Removed Components

| Component | Reason |
|-----------|--------|
| `TaskList.tsx` | Replaced by `TaskTable` |

`TaskStatusBadge.tsx` is kept — it's still used in `TaskDetail.tsx` and the sidebar. The table uses `StatusIcon` (a circle, not a pill) for its denser layout.

### Component Hierarchy

```
ProjectDetail
  └─ TaskTable
       ├─ TaskTableGroup (In Progress)  [unexported, defined in TaskTable.tsx]
       │    ├─ TaskTableRow             [unexported, defined in TaskTable.tsx]
       │    ├─ TaskTableRow
       │    └─ TaskTableInlineCreate (when active)
       ├─ TaskTableGroup (In Review)
       │    └─ ...
       ├─ TaskTableGroup (Todo)
       │    └─ ...
       └─ TaskTableGroup (Done)
            └─ ...
```

## GraphQL Query Updates

The existing `Tasks` query needs the new `priority` field:

```graphql
query Tasks($projectId: ID!) {
  tasks(projectId: $projectId) {
    id
    title
    description
    status
    priority
    projectId
    workingDirectory
    createdAt
    updatedAt
  }
}
```

The `Project` query's nested tasks also need `priority`:

```graphql
query Project($id: ID!) {
  project(id: $id) {
    id
    name
    description
    tasks {
      id
      title
      status
      priority
      createdAt
      updatedAt
    }
    createdAt
    updatedAt
  }
}
```

Run `graphql-codegen` after schema changes to regenerate TypeScript types in both backend and web.

## Styling Details

All Tailwind CSS, consistent with existing dark theme. No new dependencies.

### Color Palette (Task Table)

| Element | Tailwind Classes |
|---------|-----------------|
| Table background | `bg-gray-950` (matches page) |
| Row hover | `bg-gray-800/50` |
| Row focused | `bg-gray-800/30 border-l-2 border-blue-500` |
| Group header bg | `bg-gray-900/50` |
| Group header text | `text-gray-300 text-sm font-medium` |
| Task title | `text-gray-100 text-sm` |
| Date text | `text-gray-500 text-xs` |
| Count badge | `text-gray-500 text-xs` |
| Priority URGENT | `text-orange-500` |
| Priority HIGH | `text-orange-400` |
| Priority MEDIUM | `text-yellow-500` |
| Priority LOW | `text-blue-400` |
| Status TODO | `text-gray-400` (hollow circle) |
| Status IN_PROGRESS | `text-yellow-500` (half circle) |
| Status IN_REVIEW | `text-green-400` (circle) |
| Status DONE | `text-green-500` (check circle) |

### Row Dimensions

- Row height: 40px (`h-10`)
- Group header height: 36px (`h-9`)
- Horizontal padding: `px-3`
- Icon size: 16px (`w-4 h-4`)
- Gap between elements: `gap-2` (8px)

### Transitions

- Row hover: `transition-colors duration-75`
- Group collapse: `grid-template-rows` transition from `0fr` to `1fr`, `duration-150 ease-in-out`
- Inline create slide-in: `transition-all duration-150`

## Status Icon Design

SVG-based, 16x16 icons. Implement as a single component with status prop:

```tsx
function StatusIcon({ status, className }: { status: TaskStatus; className?: string }) {
  // TODO: circle outline (gray)
  // IN_PROGRESS: circle with animated partial fill (yellow)
  // IN_REVIEW: filled circle (green-ish)
  // DONE: circle with checkmark (green)
}
```

These should be simple inline SVGs, not an icon library dependency.

## Priority Icon Design

SVG-based, 16x16. Shows vertical bars of increasing height:

```tsx
function PriorityIcon({ priority, className }: { priority: TaskPriority; className?: string }) {
  // NONE: returns null (empty space)
  // LOW: 1 short bar
  // MEDIUM: 2 medium bars
  // HIGH: 3 tall bars
  // URGENT: 4 full bars (with distinct color)
}
```

## Accessibility

The table uses ARIA attributes to ensure screen reader support:

- **Table container**: `role="grid"` with `aria-label="Tasks"`
- **Group headers**: `role="row"` with `aria-expanded={true|false}` for collapse state
- **Task rows**: `role="row"` with child cells as `role="gridcell"`
- **Status icons**: `aria-label` describing the status (e.g., "Status: In Progress")
- **Priority icons**: `aria-label` describing the priority (e.g., "Priority: High"). `NONE` priority renders `aria-label="No priority"`.
- **Focused row**: `aria-selected="true"`

These ensure the table is navigable via screen readers and the implicit column layout is still conveyed semantically.

## Performance Considerations

- **No virtualization initially**: A project with 100 tasks produces ~100 DOM rows. This is well within React's comfortable rendering range. Virtualization (e.g., `@tanstack/react-virtual`) should only be added if profiling shows jank.
- **Grouping is computed client-side**: Tasks arrive as a flat array and are grouped by status with a simple `reduce()`. This runs on every render but is O(n) and negligible for expected dataset sizes.
- **Keyboard navigation uses `useRef` for focus management**: No state updates needed for focus changes — direct DOM manipulation via refs for zero-latency keyboard response.

## Testing

### Unit Tests

| Test File | Coverage |
|-----------|----------|
| `TaskTable.test.tsx` | Renders grouped tasks, collapse/expand, empty groups shown, row rendering, click navigates, keyboard nav |
| `PriorityIcon.test.tsx` | Renders correct icon/color for each priority level, aria-labels |
| `StatusIcon.test.tsx` | Renders correct icon/color for each status, aria-labels |
| `formatRelativeDate.test.ts` | Current year format, previous year format, edge cases |
| `TaskTableInlineCreate.test.tsx` | Submit creates task with title + workingDirectory, Escape cancels, auto-focus, error display, pre-fill from existing tasks |

### Keyboard Navigation Tests

- Arrow keys move focus between rows
- Enter opens task detail
- Focus wraps correctly across group boundaries
- Collapsed groups are skipped

## Implementation Order

1. **Backend: Add priority field** — Prisma migration, GraphQL schema, resolver updates, codegen
2. **Shared components** — `StatusIcon`, `PriorityIcon`, `formatRelativeDate`
3. **TaskTable** — Main component with group headers and rows (render only, no keyboard nav yet)
4. **Wire into ProjectDetail** — Replace `TaskList` with `TaskTable`
5. **Keyboard navigation** — Add arrow key / Enter / Escape handling with focus model
6. **Inline task creation** — `TaskTableInlineCreate` component with working directory pre-fill
7. **TaskDetail updates** — Add priority field to detail view
8. **Accessibility** — ARIA attributes, screen reader testing
9. **Polish** — Transitions, hover states, edge cases

## Files Changed

### Backend

| File | Change |
|------|--------|
| `backend/prisma/schema.prisma` | Add `TaskPriority` enum, `priority` field on Task |
| `backend/src/schema/schema.graphql` | Add `TaskPriority` enum, update Task type and inputs |
| `backend/src/schema/task.ts` | Handle `priority` in create/update resolvers |
| `backend/src/schema/task.test.ts` | Test priority CRUD |
| `backend/src/__generated__/graphql.ts` | Regenerated |

### Client

| File | Change |
|------|--------|
| `web/src/renderer/components/tasks/TaskTable.tsx` | New: main table component (includes row + group sub-components) |
| `web/src/renderer/components/tasks/TaskTable.test.tsx` | New: table tests (grouping, collapse, keyboard nav, row rendering) |
| `web/src/renderer/components/tasks/TaskTableInlineCreate.tsx` | New: inline create form |
| `web/src/renderer/components/tasks/TaskTableInlineCreate.test.tsx` | New: inline create tests |
| `web/src/renderer/components/shared/PriorityIcon.tsx` | New: priority bars SVG icon |
| `web/src/renderer/components/shared/PriorityIcon.test.tsx` | New: icon tests |
| `web/src/renderer/components/shared/StatusIcon.tsx` | New: status circle SVG icon |
| `web/src/renderer/components/shared/StatusIcon.test.tsx` | New: icon tests |
| `web/src/renderer/utils/formatRelativeDate.ts` | New: date formatting utility |
| `web/src/renderer/utils/formatRelativeDate.test.ts` | New: date format tests |
| `web/src/renderer/components/projects/ProjectDetail.tsx` | Replace TaskList with TaskTable |
| `web/src/renderer/components/tasks/TaskDetail.tsx` | Add priority select to detail/edit view |
| `web/src/renderer/components/tasks/TaskList.tsx` | Removed (replaced by TaskTable) |
| `web/src/renderer/components/layout/Sidebar.tsx` | Add StatusIcon next to tasks |
| `web/src/renderer/graphql/queries.ts` | Add `priority` to task queries |
| `web/src/renderer/graphql/mutations.ts` | Add `priority` to task mutation inputs |
| `web/src/renderer/graphql/__generated__/generated.ts` | Regenerated |

## Decided Questions

| Question | Decision |
|----------|----------|
| Table library? | None — built with Tailwind flexbox. Keeps bundle small and design flexible. |
| Virtual scrolling? | Not initially. Add only if perf degrades with large task lists. |
| Column headers? | No visible headers (matches Linear). Columns are implicit. |
| Group ordering? | Fixed workflow order: In Progress, In Review, Todo, Done. |
| Empty groups? | Shown with count 0. Allows inline creation into any status. |
| Done group default? | Collapsed by default. |
| Priority default? | NONE for new tasks. |
| Persist collapse state? | No — component-local state only. Resets on navigation. |
| Remove old TaskList? | Yes, fully replaced by TaskTable. |
| Row checkbox? | No — deferred until bulk actions are built. Priority icon stays visible on hover. |
| Working directory for inline create? | Pre-filled from most recent task in project. Empty if no tasks exist. |
| Project list redesign? | Deferred to a follow-up spec. Ship task table first, evaluate separately. |
| RelativeDate component vs utility? | Utility function (`formatRelativeDate`). Pure string formatting doesn't need a component. |
| Collapse animation approach? | CSS `grid-template-rows` transition (not `max-height`, which is fragile). |
| Date format for older dates? | "Jan 15, 2024" — keeps the day for precision. |

## Review Discussion

### Key Feedback Addressed

- **Simplifier**, **User Advocate**, and **Pragmatic Architect** all flagged the checkbox-on-hover as dead weight since bulk selection is out of scope. Removed entirely — priority icon stays visible on hover.
- **User Advocate** and **Pragmatic Architect** identified that inline task creation had no concrete plan for the required `workingDirectory` field. Resolved by pre-filling from the most recently created task in the project, with an explicit empty state when no tasks exist.
- **Simplifier** flagged 9 new component files as excessive. Reduced to 5 files by inlining `TaskTableRow` and `TaskTableGroup` as unexported sub-components within `TaskTable.tsx`, and converting `RelativeDate` from a component to a utility function.
- **User Advocate** flagged missing accessibility support. Added ARIA roles, labels, and `aria-expanded` attributes for screen reader compatibility.
- **User Advocate** noted the keyboard focus entry/exit model was undefined. Added explicit focus model: click to focus, Escape to release, `tabIndex={0}` on container.
- **Simplifier** and **Pragmatic Architect** noted `max-height` collapse animation is janky. Changed to `grid-template-rows` transition.
- **User Advocate** flagged `Space` keybinding as a no-op that interferes with browser scroll. Removed — will be added when bulk actions are implemented.

### Tradeoffs Considered

- **Project list redesign** (Simplifier): Simplifier argued the project list redesign is scope creep for a "Task Table UI" spec. Agreed — deferred to a follow-up spec to keep PR size manageable and focused.
- **`NONE` priority vs nullable** (Simplifier): Simplifier noted a nullable field would be more idiomatic. Kept `NONE` as an explicit enum value because it simplifies the UI (no null checks) and matches Linear's pattern where "no priority" is a distinct, displayable state.
- **Group ordering** (User Advocate): User Advocate questioned putting Todo third (below In Progress and In Review), since new tasks default to Todo. Kept current ordering because it prioritizes active work — the user's eye should land on what's happening now. New task creation via [+] buttons provides direct access regardless of group position.
- **Done collapsed threshold** (User Advocate): User Advocate suggested collapsing Done only when count > 5. Kept unconditional collapse for simplicity — one click to expand is low-cost, and collapsed-by-default sets the right expectation that Done is archival.

### Dissenting Perspectives

- **User Advocate** raised concerns about inline creation error handling. Added explicit error state behavior (row stays visible with error message). Acknowledged that the two-field inline form (title + workingDirectory) is slightly heavier than the Linear single-field pattern, but it's necessary given the data model.
- **Simplifier** questioned whether `NONE` priority adds a concept where absence would suffice. Acknowledged but kept for UI simplicity — nullable fields require more conditional rendering logic.
