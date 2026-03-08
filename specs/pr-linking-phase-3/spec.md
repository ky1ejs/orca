# PR Linking: GitHub Webhook Integration (Phase 3)

## TL;DR

Add a GitHub App integration that listens for pull request events, automatically links PRs to tasks by parsing display IDs (e.g., `ORCA-42`) from PR titles and branch names, tracks PR status on each task, and optionally advances task status when PRs are merged. This creates a bidirectional link between Orca tasks and GitHub PRs without any manual bookkeeping from the developer.

## Phasing Context

| | Phase 1 (complete) | Phase 2 (separate spec) | Phase 3 (this spec) |
|---|---|---|---|
| **Display IDs** | `ORCA-42` format on tasks | -- | Used for PR-to-task matching |
| **MCP server** | -- | Claude Code can query/update tasks | -- |
| **Env var injection** | -- | Task ID in agent environment | -- |
| **GitHub App** | -- | -- | Webhook receiver, installation model |
| **PR tracking** | -- | -- | PullRequest model linked to Task |
| **Auto status updates** | -- | -- | Merge -> DONE (configurable) |
| **PR display in UI** | -- | -- | Task detail + table row indicators |

Phase 2 enables agents to _reference_ tasks in branch names and PR titles. Phase 3 _closes the loop_ by detecting those references and tracking the resulting PRs.

## Purpose

### Problem Statement

When an AI agent (or a human developer) creates a branch and opens a PR for an Orca task, there is no automatic link back to the task. The developer must manually update the task status and there is no visibility into whether a PR exists, whether it has been reviewed, or whether it has been merged. This breaks the feedback loop that makes a work management tool useful.

### Goals

1. **Automatic PR-to-task linking**: When a PR is opened with a task display ID in its title or branch name, automatically create a link between the PR and the task.
2. **PR status tracking**: Show the current state of linked PRs (open, merged, closed) on the task detail page and as indicators on task table rows.
3. **Configurable auto-status-update**: When a PR is merged, optionally move the linked task to DONE. This behavior should be configurable per workspace.
4. **GitHub App installation flow**: Provide a settings page where workspace owners can install the GitHub App and select which repositories to monitor.
5. **Secure webhook processing**: Verify GitHub webhook signatures, handle idempotent event processing, and gracefully handle edge cases (renamed branches, force-pushed PRs, etc.).

### Non-Goals

- **GitHub Actions / CI integration**: We are not tracking CI status, check runs, or deployment status. Only PR lifecycle events.
- **Bidirectional sync from Orca to GitHub**: We do not create or update PRs from Orca. The link is one-directional: GitHub events flow into Orca.
- **Multi-provider support**: This phase is GitHub-only. GitLab, Bitbucket, etc. are out of scope.
- **PR-level comments or reviews in Orca UI**: We track review _status_ (approved, changes requested) but do not display individual review comments.
- **Commit-level linking**: We link PRs to tasks, not individual commits.
- **Branch creation from Orca**: Agents create branches via their local git workflow (enabled by Phase 2). Orca does not need to create branches via the GitHub API.

## Requirements

### Functional Requirements

1. **GitHub App creation and installation**
   - Orca registers a GitHub App with the necessary permissions (`pull_requests: read`, `metadata: read`).
   - Workspace owners can install the GitHub App via the standard GitHub App installation flow (OAuth redirect).
   - The installation is scoped to specific repositories (not all repos in the org).
   - Installation details (installation ID, account info) are stored on the workspace.

2. **Webhook event processing**
   - The backend exposes a `/webhooks/github` HTTP endpoint (outside GraphQL).
   - The endpoint verifies the `X-Hub-Signature-256` header using the GitHub App's webhook secret.
   - Supported events:
     - `pull_request.opened` — parse display ID, create PullRequest record, link to task.
     - `pull_request.closed` (merged) — update PullRequest status to `MERGED`, optionally update task status to `DONE`.
     - `pull_request.closed` (not merged) — update PullRequest status to `CLOSED`, leave task status unchanged.
     - `pull_request.reopened` — update PullRequest status to `OPEN`, optionally update task status to `IN_REVIEW`.
     - `pull_request.edited` — re-parse display ID from updated title (in case the user changes it).
     - `pull_request.synchronize` — no action needed (this is a push to the PR branch), but acknowledged and 200'd.
     - `pull_request_review.submitted` — update review status on the PullRequest record.
     - `installation.created` — store installation details.
     - `installation.deleted` — remove installation and orphan linked PullRequest records (keep them for history but mark as disconnected).

3. **Display ID parsing**
   - Extract task display IDs from PR titles and branch names.
   - Supported formats:
     - PR title: `ORCA-42: Add feature`, `[ORCA-42] Add feature`, `ORCA-42 Add feature`, `fix: ORCA-42 some description`
     - Branch name: `feat/ORCA-42-add-feature`, `ORCA-42/add-feature`, `ORCA-42-add-feature`
   - The workspace slug portion is case-insensitive during matching (e.g., `orca-42` matches workspace slug `ORCA` or `orca`).
   - Handle hyphenated workspace slugs by splitting on the last hyphen before a numeric sequence (e.g., `MY-TEAM-42` parses as slug `MY-TEAM`, number `42`).
   - If a display ID is found in both title and branch, prefer the title (it is more likely to be intentionally set).
   - A single PR can reference multiple tasks (e.g., `ORCA-42, ORCA-43: Refactor shared module`). Each gets a separate PullRequest record.

4. **PR data model**
   - A `PullRequest` record stores: GitHub PR number, title, URL, status (OPEN/MERGED/CLOSED), repository (owner/name), author (GitHub username), head branch, review status, and timestamps.
   - Many-to-one relationship: multiple PRs can link to the same task (e.g., a main PR and a follow-up fix).
   - A PullRequest belongs to a workspace (derived from the task it links to).

5. **UI: Task detail page**
   - Show a "Pull Requests" section on the task detail page, below the description.
   - Each linked PR shows: PR number (e.g., `#123`), title, status badge (open/merged/closed), review status indicator, and a link to GitHub.
   - PRs are sorted by creation date (newest first).
   - If no PRs are linked, the section is hidden (not an empty state).

6. **UI: Task table rows**
   - Show a small PR icon/count indicator on task table rows that have linked PRs.
   - The indicator shows the count of open PRs (e.g., a git-merge icon with "2").
   - Clicking the indicator navigates to the task detail page.

7. **UI: GitHub integration settings**
   - Add an "Integrations" tab to the Workspace Settings page.
   - Show the current GitHub App installation status (connected/not connected).
   - "Connect GitHub" button that initiates the GitHub App installation flow.
   - Once connected, show the GitHub account name and a list of connected repositories.
   - "Disconnect" button that removes the installation (with confirmation).
   - Configurable options:
     - "Auto-close tasks on merge" toggle (default: on).
     - "Auto-set IN_REVIEW on PR open" toggle (default: off).

### Non-Functional Requirements

1. **Webhook processing must be fast**: Return 200 to GitHub within 10 seconds. If processing takes longer, acknowledge the webhook and process asynchronously.
2. **Idempotent processing**: Re-delivering the same webhook event must not create duplicate PullRequest records or trigger duplicate status updates. Use the GitHub delivery ID (`X-GitHub-Delivery` header) for deduplication.
3. **Graceful degradation**: If the webhook endpoint is temporarily unavailable, GitHub will retry. The system must handle retries without side effects.
4. **Security**: Webhook signature verification is mandatory. The webhook secret is stored as an environment variable (`GITHUB_WEBHOOK_SECRET`), never in the database.
5. **Audit trail**: Log all webhook events (event type, delivery ID, repository, PR number) for debugging. Do not log webhook payloads in production (they may contain sensitive repo names).

## Architecture & Design

### Overview

```
GitHub ──webhook──> Bun HTTP server ──/webhooks/github──> WebhookHandler
                                                              │
                                                              ├── verifySignature()
                                                              ├── parseEvent()
                                                              ├── extractDisplayIds()
                                                              ├── resolveTask()
                                                              └── upsertPullRequest()
                                                                    │
                                                                    ├── Prisma (PullRequest, Task)
                                                                    └── PubSub (taskChanged)
```

The webhook endpoint is a plain HTTP POST handler registered on the Bun server alongside the existing `/health` and `/graphql` routes. It does not go through GraphQL or the auth plugin — it uses webhook signature verification instead.

### Data Model Changes

#### New: `PullRequest` model

```prisma
enum PullRequestStatus {
  OPEN
  MERGED
  CLOSED
}

enum ReviewStatus {
  NONE
  APPROVED
  CHANGES_REQUESTED
  COMMENTED
}

model PullRequest {
  id             String            @id @default(cuid())
  githubId       Int               @unique          // GitHub's internal PR ID (globally unique)
  number         Int                                 // PR number within the repo
  title          String
  url            String
  status         PullRequestStatus @default(OPEN)
  reviewStatus   ReviewStatus      @default(NONE)
  repository     String                              // "owner/repo" format
  headBranch     String
  author         String                              // GitHub username
  taskId         String
  task           Task              @relation(fields: [taskId], references: [id], onDelete: Cascade)
  workspaceId    String
  workspace      Workspace         @relation(fields: [workspaceId], references: [id])
  createdAt      DateTime          @default(now())
  updatedAt      DateTime          @updatedAt

  @@index([taskId])
  @@index([workspaceId])
  @@index([repository, number])
}
```

#### New: `GitHubInstallation` model

```prisma
model GitHubInstallation {
  id              String    @id @default(cuid())
  installationId  Int       @unique                // GitHub App installation ID
  accountLogin    String                           // GitHub org or user login
  accountType     String                           // "Organization" or "User"
  workspaceId     String
  workspace       Workspace @relation(fields: [workspaceId], references: [id], onDelete: Cascade)
  repositories    String[]                         // List of "owner/repo" strings
  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt

  @@index([workspaceId])
}
```

#### New: `WebhookDelivery` model (for idempotency)

```prisma
model WebhookDelivery {
  id          String   @id                          // GitHub's X-GitHub-Delivery header
  event       String                                // e.g., "pull_request.opened"
  processedAt DateTime @default(now())

  @@index([processedAt])
}
```

Old `WebhookDelivery` records can be pruned periodically (e.g., older than 7 days). This table is append-only and only queried by primary key, so it stays fast.

#### Updated: `Task` model

Add the reverse relation:

```prisma
model Task {
  // ... existing fields ...
  pullRequests  PullRequest[]
}
```

#### Updated: `Workspace` model

Add the reverse relations:

```prisma
model Workspace {
  // ... existing fields ...
  pullRequests        PullRequest[]
  githubInstallations GitHubInstallation[]
}
```

#### New: `WorkspaceSettings` model

```prisma
model WorkspaceSettings {
  id                      String    @id @default(cuid())
  workspaceId             String    @unique
  workspace               Workspace @relation(fields: [workspaceId], references: [id], onDelete: Cascade)
  autoCloseOnMerge        Boolean   @default(true)
  autoInReviewOnPrOpen    Boolean   @default(false)
  createdAt               DateTime  @default(now())
  updatedAt               DateTime  @updatedAt
}
```

### Design Decisions

- **`githubId` as unique key**: GitHub's internal PR ID (`pull_request.id` in the webhook payload) is globally unique across all repositories. Using this as the unique key (rather than `repository + number`) simplifies upserts and avoids issues if a repository is renamed or transferred.
- **`repository` as a string, not a foreign key**: We store `"owner/repo"` as a denormalized string rather than creating a `Repository` model. This keeps the schema simple — we don't need to track repositories as first-class entities. The `GitHubInstallation.repositories` array tracks which repos the installation covers.
- **`WorkspaceSettings` as a separate model**: Rather than adding boolean columns to `Workspace`, a separate settings model keeps workspace core data clean and allows adding more settings later without migrating the workspace table. Created lazily on first access (with defaults).
- **Cascade delete from Task to PullRequest**: If a task is deleted, its linked PRs are deleted too. PR records are metadata about the task, not independent entities.
- **No cascade from Workspace to PullRequest**: PullRequest records have their own `workspaceId` for querying efficiency, but workspace soft-delete already makes them inaccessible through normal queries (access helpers filter by `deletedAt`).

### GraphQL Schema Changes

#### New Types

```graphql
enum PullRequestStatus {
  OPEN
  MERGED
  CLOSED
}

enum ReviewStatus {
  NONE
  APPROVED
  CHANGES_REQUESTED
  COMMENTED
}

type PullRequest {
  id: ID!
  number: Int!
  title: String!
  url: String!
  status: PullRequestStatus!
  reviewStatus: ReviewStatus!
  repository: String!
  headBranch: String!
  author: String!
  createdAt: String!
  updatedAt: String!
}

type GitHubInstallation {
  id: ID!
  accountLogin: String!
  accountType: String!
  repositories: [String!]!
  createdAt: String!
}

type WorkspaceSettings {
  autoCloseOnMerge: Boolean!
  autoInReviewOnPrOpen: Boolean!
}
```

#### Updated `Task` Type

```graphql
type Task {
  id: ID!
  displayId: String!
  title: String!
  description: String
  status: TaskStatus!
  priority: TaskPriority!
  projectId: ID!
  project: Project!
  pullRequests: [PullRequest!]!
  pullRequestCount: Int!
  createdAt: String!
  updatedAt: String!
}
```

- `pullRequests` returns all linked PRs (for the detail page).
- `pullRequestCount` returns the count of open PRs (for the table row indicator). This avoids fetching full PR data when only the count is needed.

#### Updated `Workspace` Type

```graphql
type Workspace {
  # ... existing fields ...
  githubInstallation: GitHubInstallation
  settings: WorkspaceSettings!
}
```

Note: `githubInstallation` is singular and nullable. A workspace can have at most one GitHub App installation. If we later need multi-installation support (e.g., for GitHub Enterprise + GitHub.com), this can become a list.

#### New Queries

```graphql
type Query {
  # ... existing queries ...
  githubAppInstallUrl(workspaceId: ID!): String!
}
```

Returns the GitHub App installation URL with the workspace ID encoded in the `state` parameter for the OAuth callback.

#### New Mutations

```graphql
type Mutation {
  # ... existing mutations ...
  completeGitHubInstallation(workspaceId: ID!, installationId: Int!, setupAction: String!): GitHubInstallation!
  removeGitHubInstallation(workspaceId: ID!): Boolean!
  updateWorkspaceSettings(workspaceId: ID!, input: UpdateWorkspaceSettingsInput!): WorkspaceSettings!
}

input UpdateWorkspaceSettingsInput {
  autoCloseOnMerge: Boolean
  autoInReviewOnPrOpen: Boolean
}
```

- `completeGitHubInstallation`: Called by the client after the GitHub App installation redirect. The client receives `installation_id` and `setup_action` as URL query parameters from GitHub's callback. The backend uses the installation ID to fetch installation details from the GitHub API and stores them.
- `removeGitHubInstallation`: Removes the stored installation. Does NOT uninstall the GitHub App from GitHub — the user must do that separately from GitHub's settings. We could add a link to the GitHub App settings page in the UI.

### Webhook Flow

#### 1. Receiving and Verifying

```
POST /webhooks/github
Headers:
  X-Hub-Signature-256: sha256=<hmac>
  X-GitHub-Delivery: <uuid>
  X-GitHub-Event: pull_request
Body: { action: "opened", pull_request: { ... }, installation: { id: ... } }
```

Verification steps:
1. Read raw request body as bytes.
2. Compute HMAC-SHA256 of the body using `GITHUB_WEBHOOK_SECRET`.
3. Compare with `X-Hub-Signature-256` header using timing-safe comparison.
4. If verification fails, return 401.

#### 2. Idempotency Check

1. Read `X-GitHub-Delivery` header.
2. Check if a `WebhookDelivery` record with this ID exists.
3. If yes, return 200 immediately (already processed).
4. If no, proceed with processing and create the `WebhookDelivery` record at the end.

#### 3. Routing by Event Type

```typescript
// Pseudocode
switch (`${event}.${action}`) {
  case 'pull_request.opened':
  case 'pull_request.edited':
    handlePullRequestOpenedOrEdited(payload);
    break;
  case 'pull_request.closed':
    handlePullRequestClosed(payload);
    break;
  case 'pull_request.reopened':
    handlePullRequestReopened(payload);
    break;
  case 'pull_request_review.submitted':
    handleReviewSubmitted(payload);
    break;
  case 'installation.created':
    handleInstallationCreated(payload);
    break;
  case 'installation.deleted':
    handleInstallationDeleted(payload);
    break;
  default:
    // Acknowledge unknown events with 200
    break;
}
```

#### 4. PR Opened/Edited Flow

1. Look up `GitHubInstallation` by `payload.installation.id`.
2. If no installation found, return 200 (webhook from an unlinked installation).
3. Extract display IDs from `payload.pull_request.title` and `payload.pull_request.head.ref` (branch name).
4. For each display ID:
   a. Look up the task by `displayId` (case-insensitive) within the installation's workspace.
   b. If found, upsert a `PullRequest` record (keyed by `githubId`).
   c. If `autoInReviewOnPrOpen` is enabled and the task status is `TODO` or `IN_PROGRESS`, update task status to `IN_REVIEW`.
   d. Publish `taskChanged` event via PubSub (so subscribed clients see the update in real time).
5. For `edited` events: also check if the display ID has _changed_. If the old title referenced `ORCA-42` but the new title references `ORCA-43`, unlink from 42 and link to 43. However, do NOT delete the PullRequest record for 42 if it was also linked via the branch name.

#### 5. PR Closed Flow

1. Find the `PullRequest` record by `githubId`.
2. If not found, attempt to parse and link (in case the `opened` event was missed).
3. Update status to `MERGED` or `CLOSED` based on `payload.pull_request.merged`.
4. If merged and `autoCloseOnMerge` is enabled:
   a. Check if the task has any other open PRs.
   b. If no other open PRs, update task status to `DONE`.
   c. If other open PRs exist, leave task status unchanged (the task is still in flight).
5. Publish `taskChanged` event.

#### 6. PR Reopened Flow

1. Find the `PullRequest` record by `githubId`.
2. Update status back to `OPEN`.
3. If the linked task is `DONE` and `autoCloseOnMerge` is enabled, update task status to `IN_REVIEW` (reopening a PR implies the work is not actually done).
4. Publish `taskChanged` event.

#### 7. Review Submitted Flow

1. Find the `PullRequest` record by `githubId`.
2. Update `reviewStatus` based on `payload.review.state`:
   - `approved` -> `APPROVED`
   - `changes_requested` -> `CHANGES_REQUESTED`
   - `commented` -> `COMMENTED` (only if current status is `NONE`)
3. Publish `taskChanged` event.

### Display ID Parsing Algorithm

The parsing must handle hyphenated workspace slugs correctly. The algorithm:

1. Define a regex pattern: `/([A-Z][A-Z0-9]+(?:-[A-Z][A-Z0-9]+)*)-(\d+)/gi`
   - This matches sequences like `ORCA-42`, `MY-TEAM-42`, `ABC-DEF-123`.
   - The slug portion is one or more hyphen-separated segments, each starting with a letter.
   - The number is the final segment after the last hyphen.
2. Extract all matches from the input string.
3. For each match, normalize the slug to uppercase.
4. Look up the workspace by slug (case-insensitive match against `Workspace.slug`).
5. Construct the `displayId` as `${slug}-${number}` and look up the task.

Edge cases:
- **Input**: `feat/MY-TEAM-42-add-feature` -- Slug: `MY-TEAM`, Number: `42`. The `-add-feature` suffix is not part of the display ID because `add` does not start a valid display ID segment (it's lowercase in the original, but even if uppercased, we validate against existing workspace slugs).
- **Input**: `ORCA-42, ORCA-43: Refactor` -- Two matches: `ORCA-42` and `ORCA-43`.
- **Input**: `fix: resolve issue in ORCA-42 component` -- One match: `ORCA-42`.

The actual implementation should attempt greedy slug matching: for a potential match like `MY-TEAM-42`, try `MY-TEAM` as a slug first, then `MY` if that fails. This handles ambiguity where the hyphenated portion could be part of the slug or part of the branch name convention.

### Webhook Endpoint Integration

The webhook endpoint is added to the existing `Bun.serve` fetch handler in `backend/src/index.ts`:

```typescript
// Pseudocode showing where the webhook handler fits
const server = Bun.serve({
  port: PORT,
  hostname: '0.0.0.0',
  fetch(request) {
    const url = new URL(request.url);
    if (url.pathname === '/health') {
      return new Response('ok', { status: 200 });
    }
    if (url.pathname === '/webhooks/github' && request.method === 'POST') {
      return handleGitHubWebhook(request);
    }
    return yoga.fetch(request);
  },
});
```

The `handleGitHubWebhook` function is defined in a new module (`backend/src/webhooks/github.ts`) and has access to `prisma` and `pubsub` directly (not through GraphQL context). It does not require JWT authentication — it uses webhook signature verification instead.

### GitHub App Configuration

The GitHub App needs the following configuration:

- **Name**: `Orca Work Management` (or similar)
- **Permissions**:
  - Repository: `pull_requests: read`, `metadata: read`
  - No write permissions needed (we only read PR events)
- **Events**:
  - `Pull request`
  - `Pull request review`
  - `Installation`
- **Webhook URL**: `https://orca-api.fly.dev/webhooks/github`
- **Setup URL**: `https://orca-api.fly.dev/github/setup` (for the post-installation callback)
  - Alternatively, the callback can go to the Electron app via a custom protocol or to the Vite dev server URL during development. This is an open question.
- **Callback URL**: Used during the OAuth-like installation flow. After the user installs the app, GitHub redirects to this URL with `installation_id` and `setup_action` query parameters.

#### Environment Variables

| Variable | Description | Required |
|---|---|---|
| `GITHUB_APP_ID` | The GitHub App's numeric ID | Yes (for API calls) |
| `GITHUB_APP_PRIVATE_KEY` | PEM-encoded private key for authenticating as the GitHub App | Yes (for API calls) |
| `GITHUB_WEBHOOK_SECRET` | Shared secret for webhook signature verification | Yes |
| `GITHUB_CLIENT_ID` | GitHub App's OAuth client ID | Yes (for installation flow) |
| `GITHUB_CLIENT_SECRET` | GitHub App's OAuth client secret | Yes (for installation flow) |

These are set as Fly.io secrets for production and in `backend/.env` for local development.

### Component Design

#### Backend

| Module | Responsibility |
|---|---|
| `backend/src/webhooks/github.ts` | Main webhook handler: signature verification, event routing, idempotency |
| `backend/src/webhooks/github-events.ts` | Individual event handlers (PR opened, closed, reopened, review, installation) |
| `backend/src/webhooks/display-id-parser.ts` | Extract display IDs from strings (title, branch name) |
| `backend/src/webhooks/github-api.ts` | Thin wrapper for GitHub API calls (fetch installation details, list repos) |
| `backend/src/schema/pull-request.ts` | GraphQL resolvers for PullRequest type |
| `backend/src/schema/github-installation.ts` | GraphQL resolvers for installation queries/mutations |
| `backend/src/schema/workspace-settings.ts` | GraphQL resolvers for workspace settings |

#### Client

| Module | Responsibility |
|---|---|
| `web/src/renderer/components/tasks/PullRequestList.tsx` | PR list on task detail page |
| `web/src/renderer/components/tasks/PullRequestBadge.tsx` | Status badge (open/merged/closed) for a PR |
| `web/src/renderer/components/tasks/PullRequestIndicator.tsx` | Small icon + count for task table rows |
| `web/src/renderer/components/settings/GitHubIntegration.tsx` | GitHub integration settings tab |
| `web/src/renderer/components/settings/WorkspaceSettingsForm.tsx` | Workspace settings (auto-close toggle, etc.) |

## Implementation Steps

| # | Step | Description | Dependencies |
|---|---|---|---|
| 1 | **Prisma schema changes** | Add `PullRequest`, `GitHubInstallation`, `WebhookDelivery`, `WorkspaceSettings` models. Add reverse relations on `Task` and `Workspace`. Generate and apply migration. | None |
| 2 | **Display ID parser** | Implement and test `extractDisplayIds(text: string): string[]` function. This is pure logic with no database dependency — easy to test in isolation. | None |
| 3 | **Webhook signature verification** | Implement `verifyGitHubSignature(body: ArrayBuffer, signature: string, secret: string): boolean` using HMAC-SHA256 with timing-safe comparison. | None |
| 4 | **Webhook HTTP endpoint** | Register `/webhooks/github` route in `backend/src/index.ts`. Wire up signature verification, idempotency check, and event routing skeleton. Return 200 for all recognized events. | Steps 1, 3 |
| 5 | **PR event handlers** | Implement `handlePullRequestOpened`, `handlePullRequestClosed`, `handlePullRequestReopened`, `handlePullRequestEdited`. Each handler parses display IDs, resolves tasks, and upserts PullRequest records. | Steps 1, 2, 4 |
| 6 | **Review event handler** | Implement `handleReviewSubmitted` to update `reviewStatus` on PullRequest records. | Steps 1, 4 |
| 7 | **Installation event handlers** | Implement `handleInstallationCreated` and `handleInstallationDeleted`. | Steps 1, 4 |
| 8 | **Auto-status-update logic** | Add configurable task status transitions on merge/PR open, respecting `WorkspaceSettings`. | Steps 1, 5 |
| 9 | **GraphQL schema + resolvers** | Add `PullRequest` and `GitHubInstallation` types, `pullRequests` and `pullRequestCount` fields on `Task`, `githubInstallation` and `settings` fields on `Workspace`, installation mutations, settings mutation. Run codegen. | Steps 1, 5, 7 |
| 10 | **UI: Task detail PR list** | Add `PullRequestList` component to `TaskDetail.tsx`. Fetch `pullRequests` in the task query. | Step 9 |
| 11 | **UI: Task table PR indicator** | Add `PullRequestIndicator` to `TaskTableRow`. Fetch `pullRequestCount` in the task list query. | Step 9 |
| 12 | **UI: GitHub integration settings** | Add "Integrations" tab to `WorkspaceSettings.tsx`. Build `GitHubIntegration` component with connect/disconnect flow. | Step 9 |
| 13 | **UI: Workspace settings form** | Add auto-close and auto-in-review toggles to workspace settings. | Step 9 |
| 14 | **PubSub integration** | Ensure `taskChanged` events are published when PRs are linked/updated so that subscribed clients see real-time updates. | Steps 5, 6 |
| 15 | **Webhook delivery pruning** | Add a scheduled job or startup task that deletes `WebhookDelivery` records older than 7 days. | Step 4 |
| 16 | **End-to-end testing** | Test the full flow: GitHub App installation, PR creation, webhook delivery, task status update, UI display. | All above |

## Validation & Testing Plan

### Unit Tests

| Test File | Coverage |
|---|---|
| `display-id-parser.test.ts` | All display ID parsing patterns: simple (`ORCA-42`), hyphenated slug (`MY-TEAM-42`), multiple IDs in one string, branch name formats, title formats, case insensitivity, edge cases (no match, only numbers, slug-like words that aren't real slugs) |
| `github.test.ts` | Webhook signature verification (valid, invalid, empty body, tampered), idempotency (duplicate delivery ID), unknown event types (returns 200), missing headers (returns 400) |
| `github-events.test.ts` | PR opened (creates record, links to task), PR closed+merged (updates status, triggers auto-close), PR closed+not merged (updates status only), PR reopened (reverts status), PR edited (re-links if display ID changed), review submitted (updates review status), installation created/deleted |
| `pull-request.test.ts` | GraphQL resolvers: `task.pullRequests` returns linked PRs, `task.pullRequestCount` returns correct count, access control (can't see PRs on tasks in other workspaces) |
| `workspace-settings.test.ts` | Default settings creation, update settings, settings respected by event handlers (auto-close on/off, auto-in-review on/off) |

### Integration Tests

| Scenario | Verification |
|---|---|
| Full PR lifecycle | Open PR -> link created, merge PR -> task marked DONE, reopen PR -> task back to IN_REVIEW |
| Multiple PRs per task | Task shows all linked PRs, auto-close only triggers when ALL PRs are merged |
| PR with multiple display IDs | Creates separate PullRequest records for each task |
| Installation flow | Install GitHub App -> installation stored on workspace, uninstall -> installation removed |
| Webhook replay | Same delivery ID processed twice -> no duplicate records |
| Unrecognized display ID | PR with unknown display ID -> no PullRequest record created, no error |
| Cross-workspace isolation | PR referencing task in workspace A does not create records in workspace B |

### Manual Testing

- Install the GitHub App on a test repository from the workspace settings page.
- Create a PR with a task display ID in the title.
- Verify the PR appears on the task detail page within a few seconds.
- Merge the PR and verify the task status updates to DONE.
- Verify the PR status badge changes from "Open" to "Merged".
- Reopen the PR and verify status reverts.
- Toggle auto-close off, merge another PR, verify task status does NOT change.

## Risks & Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| **Webhook delivery failures** | PRs are opened but not linked to tasks. | GitHub retries webhooks for up to 3 days. Idempotent processing ensures retries are safe. Add a manual "refresh PRs" button (future enhancement) that queries the GitHub API directly. |
| **Display ID parsing false positives** | A PR title like "Update JIRA-42 integration" could match a workspace with slug "JIRA". | Only match against workspaces that have a `GitHubInstallation` linked to the repository the PR is opened in. This scopes matching to the correct workspace. |
| **Rate limiting from GitHub API** | If we make too many API calls (e.g., fetching installation details), we could be rate-limited. | We only call the GitHub API during the installation flow and for verification, not on every webhook. Webhook payloads contain all the PR data we need. |
| **Webhook secret rotation** | Changing the webhook secret invalidates all pending webhook deliveries. | Support reading from both `GITHUB_WEBHOOK_SECRET` and `GITHUB_WEBHOOK_SECRET_OLD` during rotation. Remove the old secret after all in-flight deliveries have been processed (typically within minutes). |
| **GitHub App permissions escalation** | If we later need write permissions (e.g., to post comments on PRs), users must re-approve the app. | Start with minimal read-only permissions. Document any future permission changes clearly. |
| **Large payload processing** | A PR with a very long title or description could slow down parsing. | Limit display ID parsing to the first 500 characters of the title and 200 characters of the branch name. These limits are generous enough for any reasonable use case. |
| **Database growth** | Active repositories could generate many PullRequest records over time. | PullRequest records are lightweight (no large text fields). Index on `taskId` keeps queries fast. If needed, archive closed/merged PRs older than a configurable retention period (future enhancement). |
| **Fly.io auto-stop** | If machines are stopped, incoming webhooks need to wake them up. | `auto_start_machines = true` in `fly.toml` ensures machines start on incoming requests. The `/webhooks/github` endpoint is an HTTP request that triggers auto-start. Startup time (< 2s for Bun) is well within GitHub's 10-second timeout. |

## Open Questions

| # | Question | Options | Recommendation | Status |
|---|---|---|---|---|
| 1 | **GitHub App vs. plain webhooks** | (a) GitHub App: supports installation flow, per-repo scoping, API access for future features. (b) Plain webhooks: simpler setup, but requires manual webhook configuration per repo and no installation flow. | GitHub App. The installation flow is much better UX — users click "Install" instead of manually copying webhook URLs. It also positions us for future API use (e.g., posting task links as PR comments). | OPEN |
| 2 | **GitHub App installation callback URL** | (a) Backend HTTP endpoint that redirects to the Electron app via custom protocol (`orca://github/callback?installation_id=...`). (b) Direct to the Vite dev server URL during development, production URL for released builds. (c) A small web page served by the backend that calls `window.close()` after posting the installation ID to the app. | Option (c) is most portable — works in both Electron and browser dev mode. The backend serves a small HTML page at `/github/callback` that extracts query params and either redirects to `orca://` protocol or displays a "You can close this window" message. | OPEN |
| 3 | **Should auto-close check for all PRs merged?** | (a) Auto-close task when _any_ linked PR is merged. (b) Auto-close task only when _all_ linked PRs are merged. (c) Auto-close task when the _most recent_ PR is merged. | Option (a) for simplicity. Most tasks have exactly one PR. For multi-PR tasks, the user likely wants to be notified when the first PR merges. They can always reopen the task. | OPEN |
| 4 | **Should we track draft PR status?** | (a) Yes — show PRs as "Draft" when `pull_request.draft` is true, don't trigger auto-in-review for drafts. (b) No — treat drafts the same as regular PRs. | Option (a). Draft PRs are explicitly "not ready for review", so triggering `IN_REVIEW` would be incorrect. Add a `draft` boolean field to `PullRequest` and only trigger auto-in-review when the PR is not a draft. Detect draft-to-ready transition via `pull_request.ready_for_review` event. | OPEN |
| 5 | **Should we uninstall the GitHub App from GitHub when the user disconnects in Orca?** | (a) Yes — call the GitHub API to delete the installation. (b) No — only remove our stored record, let the user uninstall from GitHub separately. | Option (b). Uninstalling someone's GitHub App installation is destructive and could affect other tools using the same installation. We should only remove our record and show a note: "To fully remove Orca's access, uninstall the app from your GitHub settings." | OPEN |
| 6 | **How to handle repository transfers and renames?** | (a) Listen for `repository.renamed` and `repository.transferred` events and update `PullRequest.repository`. (b) Rely on `githubId` for PR identity and accept that `repository` may become stale. | Option (b) for Phase 3. The `repository` field is display-only (used for the GitHub link URL). If a repo is renamed, old links will 404 but GitHub auto-redirects. We can add rename handling as a follow-up if it becomes a real issue. | OPEN |
| 7 | **Where should the GitHub App be registered?** | (a) Orca project maintains a single GitHub App (hosted/managed centrally). (b) Each Orca deployment registers its own GitHub App. | Depends on whether Orca will be a hosted service or self-hosted. For now, assume (a) — a single GitHub App managed by the Orca project, pointed at `orca-api.fly.dev`. Self-hosted deployments would need their own GitHub App (documented in deployment docs). | OPEN |

## Files Changed

### Backend

| File | Change |
|---|---|
| `backend/prisma/schema.prisma` | Add `PullRequest`, `GitHubInstallation`, `WebhookDelivery`, `WorkspaceSettings` models. Add `PullRequestStatus` and `ReviewStatus` enums. Add reverse relations on `Task` and `Workspace`. |
| `backend/src/schema/schema.graphql` | Add `PullRequest`, `GitHubInstallation`, `WorkspaceSettings` types. Add `PullRequestStatus`, `ReviewStatus` enums. Add `pullRequests` and `pullRequestCount` to `Task`. Add `githubInstallation` and `settings` to `Workspace`. Add installation mutations, settings mutation, `githubAppInstallUrl` query. |
| `backend/src/index.ts` | Add `/webhooks/github` route and `/github/callback` route to the Bun server's fetch handler. |
| `backend/src/webhooks/github.ts` | New: main webhook handler (signature verification, idempotency, event routing). |
| `backend/src/webhooks/github-events.ts` | New: individual event handler functions. |
| `backend/src/webhooks/github.test.ts` | New: webhook handler tests. |
| `backend/src/webhooks/github-events.test.ts` | New: event handler tests. |
| `backend/src/webhooks/display-id-parser.ts` | New: display ID extraction logic. |
| `backend/src/webhooks/display-id-parser.test.ts` | New: parser tests. |
| `backend/src/webhooks/github-api.ts` | New: GitHub API client (fetch installation details, authenticate as app). |
| `backend/src/schema/pull-request.ts` | New: PullRequest resolvers (Task.pullRequests, Task.pullRequestCount). |
| `backend/src/schema/github-installation.ts` | New: GitHubInstallation resolvers and mutations. |
| `backend/src/schema/workspace-settings.ts` | New: WorkspaceSettings resolvers and mutation. |
| `backend/src/schema/index.ts` | Register new resolvers. |
| `backend/src/__generated__/graphql.ts` | Regenerated via codegen. |

### Client

| File | Change |
|---|---|
| `web/src/renderer/components/tasks/TaskDetail.tsx` | Add `PullRequestList` section below description. |
| `web/src/renderer/components/tasks/TaskTable.tsx` | Add `PullRequestIndicator` to `TaskTableRow`. Update `TaskSummary` interface to include `pullRequestCount`. |
| `web/src/renderer/components/tasks/PullRequestList.tsx` | New: list of linked PRs with status badges and GitHub links. |
| `web/src/renderer/components/tasks/PullRequestBadge.tsx` | New: colored status badge (green for open, purple for merged, gray for closed). |
| `web/src/renderer/components/tasks/PullRequestIndicator.tsx` | New: small icon + count for table rows. |
| `web/src/renderer/components/settings/WorkspaceSettings.tsx` | Add "Integrations" tab alongside existing "General" and "Members" tabs. |
| `web/src/renderer/components/settings/GitHubIntegration.tsx` | New: GitHub App connection/disconnection UI. |
| `web/src/renderer/components/settings/WorkspaceSettingsForm.tsx` | New: auto-close and auto-in-review toggles. |
| `web/src/renderer/graphql/queries.ts` | Add `pullRequests` and `pullRequestCount` to task queries. Add `githubInstallation` and `settings` to workspace query. |
| `web/src/renderer/graphql/mutations.ts` | Add `completeGitHubInstallation`, `removeGitHubInstallation`, `updateWorkspaceSettings` mutations. |
| `web/src/renderer/graphql/__generated__/generated.ts` | Regenerated via codegen. |
