# Structural Navigation Overhaul Specification
---
created: 2026-03-09
author: Olly Boon (spec-writer skill)
status: Draft
pr:
worktree: feat/structural-navigation
---

## TL;DR

Replace the stack-based navigation system with a structural/location-based model. Navigation will use direct location replacement instead of pushing onto an unbounded history stack, with breadcrumbs for spatial awareness and a "go to parent" action instead of a "go back in history" button.

## Purpose

### Problem Statement

The current navigation uses an unbounded linear stack. Every `navigate()` call pushes a new entry, and the only way to go backwards is `goBack()` which pops one item at a time. This creates several UX problems:

1. **Unpredictable back button** — pressing "back" follows temporal history rather than structural hierarchy, so it may land on an unrelated project instead of the logical parent
2. **Silent stack growth** — clicking around the sidebar accumulates history entries invisibly, requiring many back-button presses to reach a known location
3. **No spatial awareness** — there's no indicator showing where you are in the hierarchy (Projects > Project > Task)
4. **Sidebar and back button conflict** — the sidebar provides direct jumps forward, but back still retraces every step

### Goals

- Replace the navigation stack with a single "current location" state
- Add breadcrumbs (top-left of main content) showing the user's position in the hierarchy
- Implement a structural "go to parent" action instead of "go back in history"
- Highlight the full ancestry path in the sidebar (e.g., when viewing a task, both the parent project and the task are highlighted)

### Non-Goals (Out of Scope)

- Browser-style back/forward temporal navigation (may add later as a power-user feature)
- URL-based routing or deep linking (still context/state-based)
- Sidebar layout or structural changes beyond highlighting
- Any backend changes

---

## Requirements

### Functional Requirements

1. **Location-based navigation**: `navigate()` replaces the current view state instead of pushing onto a stack. There is no history stack.
2. **Go to parent**: A `goToParent()` action navigates to the structural parent:
   - Task → its parent Project
   - Project → Projects list
   - Projects, Settings, Members → no-op (all root-level pages)
3. **Breadcrumbs**: A breadcrumb bar renders top-left of the main content area showing the user's location:
   - `projects` view → "Projects" (current page, not clickable)
   - `project` view → "Projects › Project Name" ("Projects" is clickable)
   - `task` view → "Projects › Project Name › Task Name" (first two segments clickable)
   - `settings` / `members` view → "Settings" (root page, not clickable, no back arrow)
4. **Back arrow affordance**: A subtle left-pointing back arrow (←) appears before the breadcrumbs when `goToParent` is available (i.e., on project or task views only — not on root pages like Projects, Settings, or Members).
5. **Sidebar ancestry highlighting**: When viewing a task, both the task AND its parent project are visually highlighted in the sidebar. When viewing a project, just the project is highlighted.
6. **ProjectId in navigation state**: When navigating to a task, the navigation state includes the parent `projectId` so breadcrumbs and `goToParent` can work without an extra data fetch.

### Non-Functional Requirements

- **Performance**: No additional network requests for breadcrumb data — project/task names should come from already-fetched data or the navigation state itself
- **Accessibility**: Breadcrumbs should use a `<nav aria-label="Breadcrumb">` landmark with an `<ol>` list, following WAI-ARIA breadcrumb pattern. The back arrow should have an accessible label (e.g., "Go to parent").
- **Compatibility**: This is a breaking change to the navigation context API. All consumers of `useNavigation()` must be updated in the same change.

---

## Architecture & Design

### Overview

The change is entirely within the web (Electron/React) client. No backend, GraphQL, or data model changes are needed.

```
NavigationProvider (context.tsx)
  ├── Stores single `current: NavigationState` (no stack)
  ├── `navigate(state)` → replaces current
  └── `goToParent()` → navigates to structural parent

AppShell
  ├── Sidebar (highlights ancestry)
  ├── Breadcrumbs (new component, top-left of main content)
  └── MainContent (unchanged view switching)
```

### Data Model

**NavigationState** changes from:

```typescript
interface NavigationState {
  view: ViewType;
  id?: string;
}
```

To:

```typescript
interface NavigationState {
  view: ViewType;
  id?: string;
  projectId?: string;   // Required when view is 'task', used for breadcrumbs + goToParent
  projectName?: string;  // Display name for breadcrumbs (avoids extra fetch)
  taskName?: string;     // Display name for breadcrumbs (avoids extra fetch)
}
```

**Why include names in the state?** The breadcrumb component needs display names. Rather than adding GraphQL fetches inside the breadcrumb (which would cause loading flickers and extra requests), callers pass the names they already have. This is the same pattern as passing an `id` — callers already have this data in scope when they call `navigate()`.

### API Changes

No GraphQL or backend API changes.

### Component Design

#### `NavigationProvider` (context.tsx)

```typescript
interface NavigationContextValue {
  current: NavigationState;
  navigate: (state: NavigationState) => void;
  goToParent: () => void;
  canGoToParent: boolean;
}
```

- `navigate(state)` — sets `current` to the new state (replaces, does not push)
- `goToParent()` — derives the parent from `current`:
  - `task` → `{ view: 'project', id: current.projectId, projectName: current.projectName }`
  - `project` → `{ view: 'projects' }`
  - `projects`, `settings`, `members` → no-op (all root-level)
- `canGoToParent` — `true` only when `current.view` is `'project'` or `'task'`

#### `Breadcrumbs` (new component)

- Reads `current` from `useNavigation()`
- Renders a `<nav aria-label="Breadcrumb">` with an `<ol>` of segments
- Each ancestor segment is a `<button>` calling `navigate()`
- The current (last) segment is a `<span>` (not clickable)
- A left-pointing back arrow (←) button calls `goToParent()`, hidden when `!canGoToParent`
- Chevron (`›`) separators between segments

#### Sidebar highlighting changes

Current logic (project):
```typescript
const isActive = current.view === 'project' && current.id === project.id;
```

New logic adds ancestry highlighting:
```typescript
const isActive = current.view === 'project' && current.id === project.id;
const isAncestor = current.view === 'task' && current.projectId === project.id;
const isHighlighted = isActive || isAncestor;
```

The visual treatment for `isAncestor` should be a subtler variant of `isActive` — same background but dimmer text — to distinguish "you're inside this" from "you're here".

### Error Handling

- If `goToParent()` is called on a task but `projectId` is missing, fall back to navigating to the projects list
- If `navigate()` is called for a task without `projectId`, the breadcrumb will show "Projects › ? › Task Name" — this is a developer error and should log a console warning in development

---

## Implementation Steps

| Step | Task | Description | Depends On |
|------|------|-------------|------------|
| 1 | Update `NavigationState` and context | Add `projectId`, `projectName`, `taskName` to state interface. Replace stack with single state. Replace `goBack`/`canGoBack` with `goToParent`/`canGoToParent`. | None |
| 2 | Update all `navigate()` call sites | Pass `projectId`, `projectName`, and `taskName` where applicable. 8 files, ~14 call sites total. | Step 1 |
| 3 | Create `Breadcrumbs` component | New component reading from navigation context, rendering breadcrumb trail with up-arrow. | Step 1 |
| 4 | Integrate breadcrumbs into `AppShell` | Render `<Breadcrumbs />` above `<MainContent />` in the main content area. | Step 3 |
| 5 | Remove old back buttons | Remove "← Back to Projects" from `ProjectDetail` and "← Back" / project-name link from `TaskDetail`. | Step 4 |
| 6 | Update sidebar highlighting | Add ancestry highlighting logic so parent project is highlighted when viewing a task. | Step 1 |
| 7 | Update tests | Update `context.test.tsx` and add tests for `Breadcrumbs`, `goToParent`, and sidebar highlighting. | Steps 1-6 |
| 8 | Validate in browser | Start dev server and visually verify breadcrumbs, navigation, and highlighting across all views. | Step 7 |

---

## Validation & Testing Plan

### Unit Tests

- [ ] `NavigationProvider`: `navigate()` replaces state (does not accumulate)
- [ ] `NavigationProvider`: `goToParent()` from task navigates to parent project with correct `projectId` and `projectName`
- [ ] `NavigationProvider`: `goToParent()` from project navigates to projects list
- [ ] `NavigationProvider`: `goToParent()` from settings is a no-op (root page)
- [ ] `NavigationProvider`: `goToParent()` from projects is a no-op (root page)
- [ ] `NavigationProvider`: `canGoToParent` is `true` only for `project` and `task` views, `false` for `projects`, `settings`, `members`
- [ ] `Breadcrumbs`: renders "Projects" (non-clickable) on projects view
- [ ] `Breadcrumbs`: renders "Projects › Project Name" on project view, "Projects" is clickable
- [ ] `Breadcrumbs`: renders "Projects › Project Name › Task Name" on task view, first two are clickable
- [ ] `Breadcrumbs`: renders "Settings" on settings view
- [ ] `Breadcrumbs`: back arrow hidden on root pages (projects, settings, members), visible on project and task views
- [ ] Sidebar: parent project highlighted when viewing a child task

### Manual Testing

- [ ] Click through Projects → Project → Task, verify breadcrumbs update at each level
- [ ] Click breadcrumb segments to navigate up the hierarchy
- [ ] Click the back arrow (←) to verify it goes to the structural parent
- [ ] Use sidebar to jump between unrelated projects/tasks, verify no "stack buildup" (single back-to-parent always works)
- [ ] Verify sidebar highlights both parent project and active task
- [ ] Switch workspaces and verify navigation resets to projects
- [ ] Complete onboarding flow and verify navigation state includes `projectId`

### Acceptance Criteria

- [ ] No stack-based history — navigation state is always a single location
- [ ] Back arrow (←) always goes to the structural parent, never to an unrelated previous location
- [ ] Breadcrumbs visible on all views, showing correct hierarchy
- [ ] All breadcrumb segments except the current one are clickable
- [ ] Sidebar highlights full ancestry path when viewing a task
- [ ] No extra network requests introduced for breadcrumb data

---

## Sub-agent Parallelization Plan

### Parallel Group 1: Core Changes
**Can start immediately - no dependencies between them**

Tasks: Steps 1, 3
Agents needed: 2
Description: Update the navigation context (Step 1) and create the Breadcrumbs component (Step 3) can be developed in parallel since Breadcrumbs only depends on the NavigationState *interface* (not the implementation).

### Parallel Group 2: Integration
**Requires: Group 1 complete**

Tasks: Steps 2, 4, 5, 6
Agents needed: 2
Description: Agent A handles call-site updates + removing old back buttons (Steps 2, 5). Agent B handles AppShell integration + sidebar highlighting (Steps 4, 6).

### Sequential: Validation
**Requires: Group 2 complete**

Tasks: Steps 7, 8

### Execution Diagram

```
Group 1: [Context update]  [Breadcrumbs component]  (parallel)
                    |
                    v
Group 2: [Call sites + remove back buttons]  [AppShell + sidebar]  (parallel)
                    |
                    v
Sequential:  [Tests] → [Browser validation]
```

---

## Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Missing `projectId` at some call sites (e.g., ActiveTerminals) | Medium | Low | ActiveTerminals already has `entry.taskId` — need to check if `projectId` is available. If not, extend the active-terminals data model to include it. Console warning in dev catches misses. |
| Breadcrumb names going stale after rename | Low | Low | Names are set at navigation time. If a project/task is renamed while viewing it, breadcrumb shows the old name until next navigation. Acceptable for now. |
| Keyboard shortcut `Cmd+Shift+N` navigates to projects — should it still? | Low | Low | Yes, this is a "go to root" action which aligns with structural navigation. No change needed. |

---

## Open Questions

- [x] ~~Browser-style back/forward?~~ Not now, maybe later.
- [x] ~~Breadcrumb placement?~~ Top-left of main content area.
- [x] ~~Sidebar ancestry highlighting?~~ Yes, highlight parent project when viewing a task.
- [x] ~~Should the `isAncestor` highlight in the sidebar be identical to `isActive`, or a subtler variant?~~ Subtler variant — same background but dimmer text to distinguish "you're here" from "you're inside this".

---

## Appendix

### Related Files

- `web/src/renderer/navigation/context.tsx` — Navigation context provider (primary change)
- `web/src/renderer/navigation/context.test.tsx` — Navigation context tests
- `web/src/renderer/components/layout/AppShell.tsx` — Main layout shell
- `web/src/renderer/components/layout/Sidebar.tsx` — Sidebar with project/task tree
- `web/src/renderer/components/layout/ActiveTerminals.tsx` — Active terminal list in sidebar
- `web/src/renderer/components/projects/ProjectDetail.tsx` — Project detail view (has back button to remove)
- `web/src/renderer/components/projects/ProjectList.tsx` — Project list view
- `web/src/renderer/components/tasks/TaskDetail.tsx` — Task detail view (has back button + project link to remove)
- `web/src/renderer/components/onboarding/OnboardingFlow.tsx` — Onboarding flow (navigates to task)
- `web/src/renderer/components/workspace/WorkspaceSwitcher.tsx` — Workspace switcher
- `web/src/renderer/components/workspace/CreateWorkspaceModal.tsx` — Workspace creation modal
- `web/src/renderer/components/settings/WorkspaceSettings.tsx` — Settings page

### All `navigate()` Call Sites Requiring Update

| File | Current Call | Change Needed |
|------|-------------|---------------|
| `ProjectDetail.tsx:152` | `navigate({view:'task', id:taskId})` | Add `projectId`, `projectName`, `taskName` |
| `Sidebar.tsx:175` | `navigate({view:'task', id:task.id})` | Add `projectId`, `projectName`, `taskName` |
| `ActiveTerminals.tsx:27` | `navigate({view:'task', id:entry.taskId})` | Add `projectId`, `projectName` (check data availability) |
| `OnboardingFlow.tsx:63` | `navigate({view:'task', id:createdTaskId})` | Add `projectId`, `projectName`, `taskName` |
| `Sidebar.tsx:157` | `navigate({view:'project', id:project.id})` | Add `projectName` |
| `ProjectList.tsx:97` | `navigate({view:'project', id:project.id})` | Add `projectName` |
| `OnboardingFlow.tsx:65` | `navigate({view:'project', id:createdProjectId})` | Add `projectName` |
| `AppShell.tsx:120` | `navigate({view:'project', id:current.id})` | Add `projectName` (need to source it) |
| `context.test.tsx:16-17` | Test navigate calls | Update to include new fields |
