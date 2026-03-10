# Orca iOS App Specification
---
created: 2026-03-09
author: spec-writer skill
status: Draft
iteration: 1
---

## TL;DR

Bootstrap a native iOS app using SwiftUI and XcodeGen that connects to the existing Orca GraphQL backend. The app allows users to log in, browse workspaces/projects, view tasks, create new tasks, and update task status/priority on the go. Targets iOS 26 only.

## Purpose

### Problem Statement

Orca users currently need to be at their desktop (Electron app) to view or create tasks. When away from their computer — in meetings, commuting, or just away from their desk — they have no way to quickly capture a task idea or check the status of work items.

### Goals

- Provide a native iOS app for viewing, creating, and triaging tasks against the existing Orca backend
- Support authentication via the existing JWT email/password flow
- Browse workspaces, projects, and tasks with filtering and search
- Create new tasks with title, description, status, priority, project, assignee, and labels
- Quick-edit task status and priority from the list and detail views
- Use SwiftUI exclusively (no UIKit) targeting iOS 26
- Use XcodeGen for project generation (no `.xcodeproj` in version control)

### Non-Goals (Out of Scope)

- Real-time subscriptions (GraphQL subscriptions via SSE/WebSocket) — view refreshes on pull-to-refresh or screen appearance
- Offline mode / local caching beyond standard URLCache
- Push notifications
- Initiative management (create/edit/archive)
- Workspace creation or settings management
- Member/invitation management
- Label management (create/edit/delete)
- GitHub PR integration views (PR status on task detail is a fast-follow)
- Registration flow (users register via desktop or web; iOS is login-only)
- iPad or macOS Catalyst support
- Widgets or App Intents
- Full inline editing of all task fields (v1 supports status, priority, and assignee only; full editing is a fast-follow)

---

## Requirements

### Functional Requirements

1. **Authentication**: Users log in with email and password. The JWT token is stored securely in the iOS Keychain with `kSecAttrAccessibleWhenUnlockedThisDeviceOnly` accessibility. Token is included as `Authorization: Bearer <token>` on all subsequent GraphQL requests. On UNAUTHENTICATED errors, the user sees a "Session expired — please log in again" message and is returned to the login screen. Concurrent UNAUTHENTICATED responses are deduplicated (only one logout triggered).
2. **Session restoration**: On app launch, a loading/splash screen is shown while the app checks for an existing token in Keychain and validates it via the `me` query. If the backend is unreachable within 10 seconds, the user is shown the login screen with a "Could not reach server" message.
3. **Workspace selection**: After login, the user sees a list of their workspaces. Selecting a workspace navigates to its contents. If the user belongs to only one workspace, skip selection and navigate directly.
4. **Workspace view**: Shows projects and unassociated tasks within the selected workspace. Projects are listed as navigable items; tapping a project shows its tasks. Workspace-level tasks (unassociated) are shown in a separate section.
5. **Task list**: Tasks displayed in a list with display ID, title, status badge, and priority indicator. Supports pull-to-refresh. Filterable by status and assignee (me / all). Supports client-side search by title and display ID.
6. **Task detail**: Tapping a task shows full detail — title, description (rendered as markdown), status, priority, assignee, labels, project, display ID, timestamps. Status and priority are editable via picker sheets (tap to open, change saves immediately via mutation). Assignee is editable via a member picker sheet.
7. **Task creation**: A form to create a new task with: title (required), description, status, priority, project, assignee, labels. Defaults: status=TODO, priority=NONE. Submit button is disabled during in-flight mutation to prevent duplicates.
8. **Task archiving**: Tasks can be archived from the detail view via `archiveTask` mutation with a confirmation prompt.
9. **Workspace switching**: Users can switch workspaces from the workspace list (accessible via back navigation or a toolbar button). Logout is available from the workspace list screen.

### Non-Functional Requirements

- **Minimum deployment target**: iOS 26
- **Swift version**: Swift 6 (strict concurrency)
- **Architecture**: MVVM with SwiftUI, using `@Observable` (Observation framework)
- **Networking**: Apollo iOS for GraphQL (type-safe codegen from existing schema)
- **Security**: JWT stored in Keychain via a thin Security framework wrapper (no third-party dependency); no tokens in UserDefaults; Apollo response logging disabled in release builds
- **Performance**: Task lists should feel instant for workspaces with <500 tasks
- **Accessibility**: Support Dynamic Type and VoiceOver (SwiftUI provides baseline support; add explicit labels where needed)
- **Build system**: XcodeGen (`project.yml`) generates the `.xcodeproj`; the `.xcodeproj` is gitignored
- **Distribution**: TestFlight-only for v1 (App Store submission is a future milestone)

---

## Architecture & Design

### Overview

```
┌─────────────────────────────────────┐
│              iOS App                │
│                                     │
│  ┌───────────┐    ┌──────────────┐  │
│  │   Views    │◄──│ ViewModels   │  │
│  │ (SwiftUI) │    │ (@Observable)│  │
│  └───────────┘    └──────┬───────┘  │
│                          │          │
│                   ┌──────▼───────┐  │
│                   │ GraphQL      │  │
│                   │ (Apollo iOS) │  │
│                   └──────┬───────┘  │
│                          │          │
│                   ┌──────▼───────┐  │
│                   │  AuthManager │  │
│                   │  (Keychain)  │  │
│                   └──────────────┘  │
└──────────────────────┬──────────────┘
                       │ HTTPS
               ┌───────▼────────┐
               │  Orca Backend  │
               │  /graphql      │
               └────────────────┘
```

### Project Structure

```
ios/
├── project.yml                    # XcodeGen spec
├── .gitignore                     # Ignores *.xcodeproj, Generated/, DerivedData/
├── Orca/
│   ├── OrcaApp.swift              # App entry point, root navigation
│   ├── Info.plist
│   ├── Assets.xcassets/
│   ├── Core/
│   │   ├── Auth/
│   │   │   ├── AuthManager.swift      # JWT lifecycle, login/logout (thread-safe)
│   │   │   └── KeychainHelper.swift   # Security framework wrapper (~30 lines)
│   │   ├── Network/
│   │   │   ├── NetworkClient.swift    # Apollo client setup w/ scheme-based URL
│   │   │   └── AuthInterceptor.swift  # Bearer token + UNAUTHENTICATED handling
│   │   └── Extensions/
│   │       └── ...
│   ├── Features/
│   │   ├── Login/
│   │   │   ├── LoginView.swift
│   │   │   └── LoginViewModel.swift
│   │   ├── Workspaces/
│   │   │   ├── WorkspaceListView.swift    # Also hosts logout button
│   │   │   └── WorkspaceListViewModel.swift
│   │   ├── Workspace/
│   │   │   ├── WorkspaceView.swift        # Projects + unassociated tasks
│   │   │   └── WorkspaceViewModel.swift
│   │   └── Tasks/
│   │       ├── TaskListView.swift
│   │       ├── TaskListViewModel.swift
│   │       ├── TaskDetailView.swift
│   │       ├── TaskDetailViewModel.swift
│   │       ├── TaskCreateView.swift
│   │       ├── TaskCreateViewModel.swift
│   │       └── Components/
│   │           ├── TaskRow.swift
│   │           ├── StatusBadge.swift
│   │           └── PriorityIndicator.swift
│   └── GraphQL/
│       ├── Operations/
│       │   ├── Auth.graphql
│       │   ├── Workspaces.graphql
│       │   ├── WorkspaceDetail.graphql
│       │   ├── Tasks.graphql
│       │   └── TaskMutations.graphql
│       └── Generated/                     # Apollo codegen output (gitignored)
├── OrcaTests/
│   ├── AuthManagerTests.swift
│   ├── AuthInterceptorTests.swift
│   └── KeychainHelperTests.swift
└── apollo-codegen-config.json             # Points to ../../backend/src/schema/schema.graphql
```

### Schema Sync

The Apollo codegen config points directly to the backend schema file:

```json
{
  "schemaSearchPaths": ["../../backend/src/schema/schema.graphql"],
  "operationSearchPaths": ["Orca/GraphQL/Operations/**/*.graphql"],
  "output": { "schemaTypes": { "path": "Orca/GraphQL/Generated" } }
}
```

No schema copy is needed. The codegen reads from `backend/` directly. CI validates that codegen succeeds, catching any schema drift.

### Data Model

No backend changes needed. The iOS app consumes the existing GraphQL schema as-is.

**Key types from schema (consumed via Apollo codegen):**

- `Task` — id, displayId, title, description, status, priority, assignee, labels, project, timestamps
- `Workspace` — id, name, slug, role, projects, tasks(unassociatedOnly), labels, members
- `Project` — id, name, description, tasks
- `User` — id, email, name
- `Label` — id, name, color
- `TaskStatus` — TODO, IN_PROGRESS, IN_REVIEW, DONE
- `TaskPriority` — NONE, LOW, MEDIUM, HIGH, URGENT

**Display strings** (consistent with desktop app):

| Enum Value | Display | Badge Color |
|------------|---------|-------------|
| `TODO` | To Do | Gray |
| `IN_PROGRESS` | In Progress | Blue |
| `IN_REVIEW` | In Review | Yellow |
| `DONE` | Done | Green |
| `NONE` | — | None |
| `LOW` | Low | Gray |
| `MEDIUM` | Medium | Yellow |
| `HIGH` | High | Orange |
| `URGENT` | Urgent | Red |

### API Changes

None. The iOS app is a new client for the existing GraphQL API.

### Component Design

#### KeychainHelper (Security Framework)

```swift
import Security

struct KeychainHelper {
    private let service = "com.orca.ios"
    private let account = "jwt-token"

    func getToken() -> String? {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
            kSecReturnData as String: true,
        ]
        var result: AnyObject?
        let status = SecItemCopyMatching(query as CFDictionary, &result)
        guard status == errSecSuccess, let data = result as? Data else { return nil }
        return String(data: data, encoding: .utf8)
    }

    func setToken(_ token: String) {
        deleteToken()
        let data = Data(token.utf8)
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
            kSecValueData as String: data,
            kSecAttrAccessible as String: kSecAttrAccessibleWhenUnlockedThisDeviceOnly,
        ]
        SecItemAdd(query as CFDictionary, nil)
    }

    func deleteToken() {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
        ]
        SecItemDelete(query as CFDictionary)
    }
}
```

#### AuthManager (Thread-Safe)

```swift
@Observable
@MainActor
final class AuthManager {
    enum State {
        case loading
        case authenticated(User)
        case unauthenticated
    }

    private(set) var state: State = .loading
    private let keychain = KeychainHelper()
    private var hasLoggedOut = false  // Deduplicates concurrent UNAUTHENTICATED errors

    var isAuthenticated: Bool {
        if case .authenticated = state { return true }
        return false
    }

    var token: String? { keychain.getToken() }

    func login(email: String, password: String) async throws {
        // Call login mutation
        // Store JWT in Keychain via keychain.setToken(token)
        // Set state = .authenticated(user)
        hasLoggedOut = false
    }

    func logout() {
        guard !hasLoggedOut else { return }  // Deduplicate
        hasLoggedOut = true
        keychain.deleteToken()
        state = .unauthenticated
    }

    func restoreSession() async {
        guard keychain.getToken() != nil else {
            state = .unauthenticated
            return
        }
        // Call `me` query with 10-second timeout
        // If valid: state = .authenticated(user), hasLoggedOut = false
        // If invalid/expired/timeout: keychain.deleteToken(), state = .unauthenticated
    }
}
```

The `@MainActor` annotation ensures all state mutations happen on the main thread, preventing data races under Swift 6 strict concurrency. The `hasLoggedOut` flag deduplicates concurrent UNAUTHENTICATED responses.

#### NetworkClient (Apollo)

```swift
final class NetworkClient {
    static func create(authManager: AuthManager) -> ApolloClient {
        let url = URL(string: Configuration.backendURL)!
        let store = ApolloStore()
        let interceptorProvider = NetworkInterceptorProvider(
            authManager: authManager,
            store: store
        )
        let transport = RequestChainNetworkTransport(
            interceptorProvider: interceptorProvider,
            endpointURL: url
        )
        return ApolloClient(networkTransport: transport, store: store)
    }
}

enum Configuration {
    #if DEBUG
    static let backendURL = "http://localhost:4000/graphql"
    #else
    static let backendURL = "https://orca-api.fly.dev/graphql"
    #endif
}
```

The `AuthInterceptor` reads the JWT from `AuthManager.token` and sets the `Authorization` header. On `UNAUTHENTICATED` GraphQL errors, it calls `authManager.logout()`. The interceptor also distinguishes "token expired" from other auth errors to show an appropriate message.

**Important**: Apollo response logging must be disabled in release builds to prevent JWT leakage in logs. The `login` mutation response (which contains the token) must never be logged.

#### App Root Navigation

```swift
@main
struct OrcaApp: App {
    @State private var authManager = AuthManager()

    var body: some Scene {
        WindowGroup {
            Group {
                switch authManager.state {
                case .loading:
                    SplashView()  // Loading indicator while restoring session
                case .authenticated:
                    WorkspaceListView()
                case .unauthenticated:
                    LoginView()
                }
            }
            .environment(authManager)
            .task { await authManager.restoreSession() }
        }
    }
}
```

### XcodeGen Configuration

```yaml
name: Orca
options:
  bundleIdPrefix: com.orca
  deploymentTarget:
    iOS: "26.0"
  xcodeVersion: "16.0"

settings:
  base:
    SWIFT_VERSION: "6.0"

packages:
  Apollo:
    url: https://github.com/apollographql/apollo-ios
    majorVersion: "1.0"

targets:
  Orca:
    type: application
    platform: iOS
    sources: [Orca]
    dependencies:
      - package: Apollo
        product: Apollo
    settings:
      base:
        INFOPLIST_FILE: Orca/Info.plist
        PRODUCT_BUNDLE_IDENTIFIER: com.orca.ios
    preBuildScripts:
      - name: "Apollo GraphQL Codegen"
        basedOnDependencyAnalysis: false
        script: |
          cd "${SRCROOT}"
          "${BUILD_DIR}/../../SourcePackages/checkouts/apollo-ios/apollo-ios-cli" generate \
            --path apollo-codegen-config.json
        inputFiles: []
        outputFiles: []
        # Note: ENABLE_USER_SCRIPT_SANDBOXING must be false for this target
        # because the codegen script needs filesystem access to read the schema
        # from the backend directory. This is scoped to this build phase only.

  OrcaTests:
    type: bundle.unit-test
    platform: iOS
    sources: [OrcaTests]
    dependencies:
      - target: Orca
    settings:
      base:
        ENABLE_USER_SCRIPT_SANDBOXING: true  # Tests don't need unsandboxed scripts
```

### GraphQL Operations

The app uses separate queries for workspace structure and tasks to enable independent loading/error states:

**Queries:**
```graphql
# Auth
query Me { me { id email name } }

# Workspaces
query Workspaces {
  workspaces { id name slug role }
}

# Workspace structure (projects, labels, members — no tasks)
query WorkspaceDetail($slug: String!) {
  workspace(slug: $slug) {
    id name slug role
    projects { id name description }
    labels { id name color }
    members { id user { id name email } role }
  }
}

# Tasks for a workspace (separate query for independent loading)
query WorkspaceTasks($slug: String!) {
  workspace(slug: $slug) {
    id
    tasks { id displayId title status priority assignee { id name } labels { id name color } project { id name } }
  }
}

# Single task detail
query TaskDetail($id: ID!) {
  task(id: $id) {
    id displayId title description status priority
    project { id name }
    assignee { id name email }
    labels { id name color }
    createdAt updatedAt
  }
}
```

**Mutations:**
```graphql
mutation Login($email: String!, $password: String!) {
  login(email: $email, password: $password) {
    token
    user { id email name }
    workspaces { id name slug role }
  }
}

mutation CreateTask($input: CreateTaskInput!) {
  createTask(input: $input) {
    id displayId title status priority
    assignee { id name }
    labels { id name color }
    project { id name }
  }
}

mutation UpdateTask($id: ID!, $input: UpdateTaskInput!) {
  updateTask(id: $id, input: $input) {
    id displayId title description status priority
    assignee { id name }
    labels { id name color }
    project { id name }
  }
}

mutation ArchiveTask($id: ID!) {
  archiveTask(id: $id) {
    id archivedAt
  }
}
```

### Error Handling

- **Network errors**: Show an inline error banner with retry action. No modal alerts.
- **No connectivity**: Show a dedicated "You're offline" state distinct from generic errors.
- **Auth errors (UNAUTHENTICATED)**: Interceptor calls `authManager.logout()` (deduplicated). User sees "Session expired — please log in again" on the login screen.
- **Validation errors**: Show inline beneath the relevant form field.
- **Empty states**: Show contextual empty state messages ("No tasks yet" with a create button).
- **Mutation in-flight**: Submit buttons disabled during mutations; show inline spinner.

---

## Implementation Steps

| Step | Task | Description | Depends On |
|------|------|-------------|------------|
| 1 | Project scaffolding | Create `ios/` directory, `project.yml`, `.gitignore`, `OrcaApp.swift`, `Info.plist`, `Assets.xcassets`. Run `xcodegen generate` to verify project generates. | None |
| 2 | Apollo setup | Add `apollo-codegen-config.json` (pointing at `../../backend/src/schema/schema.graphql`), define GraphQL operations, run codegen. Verify generated types compile. | Step 1 |
| 3 | Auth layer | Implement `KeychainHelper` (Security framework), `AuthManager` (`@MainActor`, dedup), `AuthInterceptor`, `NetworkClient` (scheme-based URL). Write `LoginView` + `LoginViewModel`. Add `SplashView` for session restoration. | Step 2 |
| 4 | Workspace list | Implement `WorkspaceListView` + `WorkspaceListViewModel`. Auto-navigate for single workspace. Include logout button. | Step 3 |
| 5 | Workspace detail | Implement `WorkspaceView` showing projects and unassociated tasks. Navigation to project task lists. | Step 4 |
| 6 | Task list | Implement `TaskListView`, `TaskRow`, `StatusBadge`, `PriorityIndicator`. Pull-to-refresh. Status/assignee filtering. Client-side search. | Step 5 |
| 7 | Task detail | Implement `TaskDetailView` with all fields, markdown description rendering. Editable status/priority/assignee via picker sheets (save on change). Archive action with confirmation. | Step 6 |
| 8 | Task creation | Implement `TaskCreateView` + `TaskCreateViewModel` with form validation. Disable submit during mutation. | Step 6 |
| 9 | CI workflow | Add `validate-ios.yml` GitHub Actions workflow: install XcodeGen, generate project, run Apollo codegen, build, run tests. | Step 1 |
| 10 | Polish & testing | Write unit tests for `AuthManager`, `AuthInterceptor`, `KeychainHelper`. UI polish, error states, empty states, loading states. | Steps 3-8 |

---

## Developer Setup

1. **Install XcodeGen**: `brew install xcodegen` (pin version via `Brewfile` in `ios/`)
2. **Install Xcode**: Xcode 18+ with iOS 26 SDK
3. **Generate project**: `cd ios && xcodegen generate`
4. **Run Apollo codegen**: Open the generated `.xcodeproj` in Xcode and build — the pre-build script runs codegen automatically. Or run manually: `.build/checkouts/apollo-ios/apollo-ios-cli generate --path apollo-codegen-config.json`
5. **Start backend** (for local dev): `cd backend && bun run dev` (requires Postgres via `docker compose up -d`)
6. **Run the app**: Select the iOS 26 simulator in Xcode and hit Run. Debug builds point to `localhost:4000`.

---

## Validation & Testing Plan

### Unit Tests

- [ ] `KeychainHelper`: setToken stores, getToken retrieves, deleteToken removes
- [ ] `KeychainHelper`: getToken returns nil when no token stored
- [ ] `AuthManager`: login stores token in Keychain, sets state to authenticated
- [ ] `AuthManager`: logout clears Keychain, resets state to unauthenticated
- [ ] `AuthManager`: logout deduplicates (second call is no-op)
- [ ] `AuthManager`: restoreSession validates existing token via `me` query
- [ ] `AuthManager`: restoreSession clears invalid/expired token
- [ ] `AuthManager`: restoreSession times out after 10 seconds
- [ ] `AuthInterceptor`: adds Authorization header with Bearer token
- [ ] `AuthInterceptor`: calls logout on UNAUTHENTICATED error

### Manual Testing

- [ ] Cold launch shows splash, then login (no token) or workspace list (valid token)
- [ ] Cold launch with expired token shows "Session expired" on login screen
- [ ] Login with valid credentials, verify navigation to workspaces
- [ ] Login with invalid credentials, verify error message
- [ ] View workspace list, select a workspace
- [ ] Navigate into a project, view its tasks
- [ ] View task detail, verify all fields display correctly
- [ ] Change task status via picker sheet — verify change persists after pull-to-refresh
- [ ] Change task priority — verify change persists
- [ ] Change task assignee — verify change persists
- [ ] Archive a task — verify confirmation prompt and task disappears from list
- [ ] Create a new task, verify it appears in the list
- [ ] Pull-to-refresh task list, verify data updates
- [ ] Search tasks by title and display ID
- [ ] Filter tasks by status, verify correct filtering
- [ ] Switch workspaces via back navigation
- [ ] Logout and verify return to login screen
- [ ] Kill and reopen app, verify session is restored from Keychain
- [ ] Turn on airplane mode, verify "offline" state appears
- [ ] Verify app works with production backend (Release build)

### Acceptance Criteria

- [ ] App builds and runs on iOS 26 simulator and device
- [ ] Project generates from `project.yml` via `xcodegen generate`
- [ ] No `.xcodeproj` or `Generated/` files committed to git
- [ ] User can log in with existing Orca credentials
- [ ] User can browse workspaces and projects
- [ ] User can view and search tasks
- [ ] User can view full task detail with all fields
- [ ] User can create a new task
- [ ] User can change task status, priority, and assignee
- [ ] User can archive a task
- [ ] JWT is stored securely in Keychain (WhenUnlockedThisDeviceOnly)
- [ ] Session persists across app restarts (with splash screen during restore)
- [ ] Expired token shows "session expired" message
- [ ] CI workflow passes (build + tests)

---

## Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Apollo iOS codegen complexity with XcodeGen | Medium | Medium | Pre-build script invokes CLI from SPM checkout. Fallback: run codegen manually before building. |
| Apollo iOS + Swift 6 strict concurrency warnings | Medium | Medium | Apollo iOS 1.x may produce `Sendable` warnings. Accept warnings initially; file issues upstream. Do not drop to Swift 5 mode. |
| iOS 26 is beta/unreleased — APIs may change | Medium | High | Pin to specific Xcode beta version. iOS 26-only means no backwards compatibility burden. |
| GraphQL schema changes break iOS codegen | Low | Medium | Apollo codegen points directly at `backend/src/schema/schema.graphql`. CI catches drift immediately by running codegen + build. |
| Large workspace with many tasks — performance | Low | Medium | Tasks are fetched in a separate query from workspace structure. Backend pagination is a future enhancement if needed. |
| macOS CI runners are expensive (GitHub Actions) | Medium | Low | Run iOS CI only on PRs that change `ios/` or `backend/src/schema/`. Use `macos-latest` runner. |

---

## Open Questions

- [x] ~~Should we add a build script to copy `schema.graphqls` from `backend/` automatically?~~ No — Apollo codegen config points directly at the backend schema file. No copy needed.
- [x] ~~Should the backend URL be configurable?~~ Yes — `#if DEBUG` uses localhost, release uses production. Defined in `Configuration` enum.
- [x] ~~Should we use Swift 6 strict concurrency?~~ Yes — greenfield iOS 26-only project. Accept Apollo compatibility warnings.
- [x] ~~KeychainAccess or direct Security framework?~~ Direct Security framework wrapper (~30 lines). No third-party dependency.

---

## Review Discussion

### Key Feedback Addressed

- **All 6 reviewers** flagged the broken XcodeGen pre-build script (executing a JSON file, referencing CocoaPods `PODS_ROOT`). Fixed to invoke the Apollo CLI from the SPM checkout path using the correct `--path` flag.
- **Architect, Simplifier, Paranoid Engineer, User Advocate, Product Strategist** (5/6) recommended dropping `KeychainAccess` in favor of a direct Security framework wrapper. Implemented — ~30 lines, no third-party dependency, explicit `kSecAttrAccessibleWhenUnlockedThisDeviceOnly`.
- **User Advocate** identified the missing loading state during session restoration (login screen flash). Added `AuthManager.State.loading` and `SplashView`.
- **Paranoid Engineer** identified race conditions on concurrent UNAUTHENTICATED handling. Fixed with `@MainActor` on `AuthManager` and `hasLoggedOut` deduplication flag.
- **Paranoid Engineer** raised token expiry UX — users dumped to login with no explanation. Added "Session expired — please log in again" message and 10-second `restoreSession()` timeout.
- **Operator** flagged missing CI workflow. Added Step 9 (`validate-ios.yml`) and path-filtered triggering.
- **Operator, Paranoid Engineer, Architect** raised undefined schema sync. Resolved by pointing Apollo codegen directly at `backend/src/schema/schema.graphql` — no copy, no drift.
- **Architect, User Advocate, Paranoid Engineer, Product Strategist, Simplifier** (5/6) flagged the monolithic Workspace query. Split into `WorkspaceDetail` (structure) and `WorkspaceTasks` (task list) for independent loading and error isolation.
- **User Advocate** requested task search. Added client-side search by title and display ID.
- **User Advocate** requested `archiveTask` mutation. Added with confirmation prompt.
- **Architect, Operator** promoted backend URL configurability from open question to requirement. Implemented via `#if DEBUG` compile-time switch.
- **User Advocate, Operator** requested developer setup instructions. Added dedicated section.
- **Paranoid Engineer** specified Keychain accessibility level (`kSecAttrAccessibleWhenUnlockedThisDeviceOnly`). Implemented in `KeychainHelper`.
- **Paranoid Engineer** raised JWT leakage via Apollo response logging. Added requirement to disable response logging in release builds.

### Tradeoffs Considered

- **Simplifier suggested dropping Apollo iOS for plain URLSession + Codable.** Apollo adds build complexity but provides type-safe codegen, normalized caching, and interceptor chains that are harder to replicate. For a growing app that will add more operations, Apollo's value increases over time. Keeping Apollo. Architect agreed.
- **Simplifier and Product Strategist suggested reducing v1 editing scope** to read-only detail + create-only. Compromise: v1 supports status, priority, and assignee editing (the most common mobile triage actions) but defers full inline editing of title, description, labels, and project to a fast-follow. This keeps the scope focused while still being useful.
- **Simplifier suggested dropping the initiative hierarchy** from workspace view. Adopted — workspace view now shows projects and unassociated tasks only. Initiatives can be added later.
- **Simplifier suggested consolidating ViewModels.** Kept separate ViewModels for TaskList, TaskDetail, and TaskCreate as they have distinct responsibilities (fetching list, loading single item, form state). The file count is modest and separation aids testability.
- **Architect warned about Swift 6 + Apollo compatibility.** Keeping Swift 6 since it's greenfield and iOS 26-only. Will accept Sendable warnings from Apollo and file upstream issues. Starting with Swift 5 mode and migrating later would be harder.

### Dissenting Perspectives

- **Product Strategist raised concern about iOS 26-only targeting** limiting the user base until fall 2026. Acknowledged, but the user explicitly requested iOS 26 only. This eliminates backwards compatibility complexity and allows use of the latest SwiftUI APIs.
- **Product Strategist noted lack of success metrics.** Valid concern for a large investment. Deferred — the iOS app is being bootstrapped as a personal/team tool first. Usage analytics can be added once the app is in TestFlight.
- **User Advocate suggested swipe actions, haptics, and optimistic UI updates.** Deferred to fast-follow. V1 focuses on correctness; polish follows once the core flow is validated.
- **Operator raised concern about missing crash reporting.** Deferred to fast-follow — TestFlight provides basic crash reports. Sentry/Crashlytics can be added before wider distribution.

---

## Appendix

### Dependencies

| Dependency | Purpose | Version |
|------------|---------|---------|
| [Apollo iOS](https://github.com/apollographql/apollo-ios) | GraphQL client with type-safe codegen | ^1.0 |
| [XcodeGen](https://github.com/yonaskolb/XcodeGen) | Project file generation from YAML | Pinned in `Brewfile` |

### Backend API Reference

- **Endpoint**: `https://orca-api.fly.dev/graphql` (production) / `http://localhost:4000/graphql` (development)
- **Auth**: `Authorization: Bearer <JWT>` header
- **Health**: `GET /health`
- **Schema**: `backend/src/schema/schema.graphql` (291 lines, source of truth)
- **JWT**: HS256, 30-day expiry, no refresh token

### Related Files

- `backend/src/schema/schema.graphql` — GraphQL SDL schema (source of truth for Apollo codegen)
- `backend/src/auth/jwt.ts` — JWT signing/verification (HS256, 30-day expiry)
- `backend/src/schema/auth.ts` — Login/register resolvers
- `backend/src/schema/task.ts` — Task CRUD resolvers
- `backend/src/schema/workspace.ts` — Workspace resolvers

### Revision Notes (Iteration 1)

Revised based on deep review from 6 personas (Pragmatic Architect, Paranoid Engineer, Operator, Simplifier, User Advocate, Product Strategist). Key changes:
- Fixed broken pre-build script
- Replaced KeychainAccess with Security framework wrapper
- Added splash screen / loading state for session restore
- Made AuthManager thread-safe with dedup
- Split monolithic Workspace query into structure + tasks
- Added task search, archiving, and "session expired" UX
- Added CI workflow requirement
- Added developer setup section
- Resolved all open questions
- Reduced v1 editing scope to status/priority/assignee only
- Removed initiative hierarchy from workspace view
