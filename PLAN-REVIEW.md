# PLAN.md Persona Review

Four personas (Simplifier, Product Strategist, Pragmatic Architect, User Advocate) independently reviewed PLAN.md. This document synthesizes their findings.

---

## Cross-Cutting Themes (raised by 3+ personas)

### 1. Postgres + Docker is overkill

Simplifier, Product Strategist, and Pragmatic Architect all say SQLite would reduce onboarding friction and validate faster. Prisma supports both, so migration cost is low. Requiring Docker + Postgres for a 5-10 user prototype adds setup friction that doesn't serve the hypothesis.

### 2. Workspace/Project/Task hierarchy adds friction

Simplifier and User Advocate both flag that three entity-creation steps before launching an agent is too many. Simplifier says flatten to Tasks+Agents. User Advocate says at minimum auto-create defaults so users get to the core action faster. The verification checklist reveals the pain: "Create a workspace -> project -> task" is three clicks before the user reaches the thing being tested.

### 3. Error handling is core, not polish

Pragmatic Architect and User Advocate both call out that agent crash/failure handling is in Phase 5 but should be in Phase 3. Agent spawning is the product's core action; silent failures destroy trust. Common failure modes (Claude Code not installed, auth not configured, PTY spawn failure) each need human-readable messages and next-step guidance.

### 4. No success metrics defined

Product Strategist flags there's no definition of what "validated" means. No thresholds, no kill criteria. The Verification section is all technical ("does it start, does the WebSocket work") with no user-facing success criteria. Without predefined metrics, there's a risk of interpreting ambiguous feedback as validation.

### 5. The riskiest assumptions are product risks, not technical

Product Strategist and Simplifier both note the risk table is entirely technical (node-pty compatibility, WebSocket latency). The real risks are: "developers don't actually need a GUI for this" and "we spend 3+ weeks building before getting feedback."

---

## Per-Persona Highlights

### Simplifier

The most aggressive on cuts:

- **Drop Workspaces entirely**, flatten to Tasks + Agents
- **Web app instead of Electron** — you already have WebSocket infra; send testers a URL instead of packaging a desktop app
- **Reduce to 3 agent states**: RUNNING, STOPPED, ERROR — let the terminal itself convey nuance
- **Collapse 5 phases into 2**: core loop first (xterm.js + node-pty + status indicator), then just enough product (task CRUD, persistence, multi-agent)
- **Drop the shared types package** — tRPC already handles type sharing between client and server
- **Add a scope-creep risk**: "We spend 3+ weeks building before getting user feedback." Mitigation: timebox to 1 week for a functional demo.

### Product Strategist

Challenges the "why":

- **Validate the problem exists before building** — 5 user interviews, 15 minutes each, with developers who use Claude Code daily. Don't pitch Orca, just listen. This costs days, not weeks.
- **The stated PM-integration differentiator isn't demonstrated in the MVP** — the task board is just a container for launching agents. Either include one concrete PM feature or reframe the hypothesis honestly.
- **"Collaboration" rationale for client/server is unvalidated scope** — collaboration isn't in the hypothesis, the MVP features, or the success criteria, but it's driving architectural complexity.
- **Add "Alternatives Considered" at the product level** — VS Code extension? CLI wrapper? tmux config with custom status bars? Contribution to Conductor? Apply the same rigor used for tech choices to the product approach.
- **Set a hard time-box** — e.g., "The prototype must be in testers' hands within 4 weeks."
- **Define kill criteria** — what specific feedback would make you stop building this?

### Pragmatic Architect

Flags things that will bite you in implementation:

- **Security (non-negotiable)**: The WebSocket PTY endpoint (`/ws/terminal/:agentId`) has zero auth. A PTY session has access to the developer's filesystem, env vars, and API keys. Bind to `127.0.0.1` and add a session token generated at server start. Cost: ~1 hour. Risk of not doing it: credential leak through an open PTY.
- **Missing `workingDirectory`**: The Task/Project model has no path field. Claude Code needs to run in a specific directory. Phase 3 will stall on "where does the agent run?" Add `path: String` to Project and optionally `workingDirectory: String?` to Task.
- **PID tracking is fragile**: PIDs are recycled by the OS. On server startup, sweep for stale RUNNING/STARTING agents and mark them ERROR. Register SIGTERM/SIGINT handlers to kill managed PTY processes on shutdown. ~30 lines of code.
- **Terminal output persistence**: If a user switches tabs or reconnects, all prior output is gone. At minimum, keep a ring buffer per agent in server memory and replay on WebSocket connect.
- **Clarify WebSocket channels**: Separate connections for tRPC subscriptions vs. raw PTY streams. Don't multiplex structured data and binary data on the same connection.
- **Vet node-pty + Bun compatibility** as a gating Phase 1 task. If it doesn't work, the fallback should be documented before Phase 2 begins.
- **Shared types package is premature** — tRPC's type inference already handles this. Extract shared types only when non-tRPC types genuinely need sharing.

### User Advocate

Focuses on the experience:

- **Task-to-Agent should be one-to-many**: Users will retry. The current `@unique` constraint means retrying a task overwrites the previous agent run, losing history. Make it one-to-many (AgentRuns), show the latest by default, let users see previous attempts.
- **Define what "task context" gets passed to Claude Code on launch**: This is the most important UX moment — the bridge between "I described what I want" and "the agent starts doing it." At minimum: task title + description as prompt, working directory from project. Ideally let the user review/edit before launch.
- **Task status and Agent status need defined transition rules**: Two independent status systems with no relationship will create contradictory states (task IN_PROGRESS, agent COMPLETED). Define: agent starts → task moves to IN_PROGRESS; agent completes → task moves to IN_REVIEW; agent errors → task stays IN_PROGRESS for retry.
- **Server crash reconciliation**: On restart, check for agents marked RUNNING, verify their PIDs, update statuses. Surface to user: "2 agents were interrupted when the server stopped."
- **Merge Phases 3+4** so testers see the core feature sooner. A rough "launch and view agent" at the end of Phase 3 beats a polished task board with no agents.
- **Consider "Run" naming over "Agent"**: "Agent" implies autonomy that may make users nervous. "Launch Run" / "Active Runs" positions the tool as something the user controls.

---

## Recommended Priority Actions

1. **Add WebSocket auth + bind to localhost** — security, non-negotiable even for a prototype running PTY sessions
2. **Switch to SQLite** — 3 personas agree; eliminates Docker dependency, Prisma handles the abstraction
3. **Flatten the data model** — drop Workspaces, add `path` to Project, make Task-to-Agent one-to-many
4. **Define success criteria and time-box** — what feedback means continue, what means stop, hard deadline for testers
5. **Move error handling to Phase 3** — agent failures need human-readable messages from day one
6. **Define agent launch context** — what exactly gets passed to Claude Code, can the user review it
7. **Consider web app over Electron** — faster distribution, zero packaging, testers get a URL

---

## Response

<!-- Write your thoughts below -->

### Thoughts on the Plan
#### tRPC vs GraphQL
I'm not so sure on choosing tRPC over GraphQL. I do think GraphQL is more flexible and better for future-proofing if we want to add more clients (e.g. mobile, VS Code extension). The boilerplate is a bit higher but I think the benefits outweigh that cost.

We can use graphql-codegen to generate types for both client and server. 

#### lack of tmux
Do we need to consider tmux to run terminal processes?

#### Data model
I would probably focus less on a task having a relationship to agent and more so having a relationship to a terminal window?

#### Project structure
I would prefer to keep each service at the top level rather than place inside `packages`. So `server` (lets rename to `backend`) and `client` (lets rename to `web`) should be at the root.

#### Auth
The plan does not specify auth, how will we handle that?

### Thoughts on the feedback from our personas
#### SQLite vs Postgres
I want to go with Postgres from the beginning because it's easy to run via docker and will enable us to deploy quickly to start testing with others.

#### Workspace/Project/Task hierarchy
I'm happy to skip workspaces for now, but would like to keep projects. This order of work grouping will be useful for my team to validate this.

One thing that I'd like to see in the model is markdown super for descriptions.

#### No success metrics defined
I agree with this. I suppose the user success criteria is that I personally find this useful for managing my work. The next level will be my teammates finding it useful to manage their work. If it doesn't progress through both those stages, we shouldn't not carry it any further.

#### The riskiest assumptions are product risks, not technical
This is not just about developers, it's also about democratising access to agents to less experienced users. On top of that, the terminal UX will remain directly in reach and we should aim for that to feel as seamless as possible, which should give minimal trade-offs for users who prefer the terminal.

#### Per-Persona Highlights

##### Simplifier
- I want Electron from the beginning because I've not tried this stack before and would like to explore it personally. In addition, it also gives an easier path for non-developers to test it.
- I like the "WAITING_FOR_INPUT", if we can detect that, to elevate tasks that are blocked until we give input
- Don't drop shared types – we will use graphql to have a declarative contact between clients and server for typesafety and development speed.

##### Product Strategist
- I'll do the interviews another time, lets continue. I want to test with myself first.
- The point about it not being a PM tool because it's only a board is fair. We need to have view that list projects and that list tasks within those projects. Ideally with a sidebar to navigate all of this.
- VS Code is not a valid alternative – too non-developer heavy. Also, people do use other IDEs, like IntelliJ.
- Kill criteria would be:
  - we're not able to keep the UX close to using the terminal directly
  - we can't safely and reliably manage terminal state in line with tasks
  - I don't reach for this tool instead of going directly to the terminal myself

##### Pragmatic Architect
All great. Thanks.

##### User Advocate
- For now, lets keep tasks 1:1 to agents until we have a better understanding of how users will want to retry and manage multiple runs. We can always migrate to a one-to-many model later if we need to.
- I think we should create ways for users to pass this data in by choice, otherwise we perhaps start a blank TUI for now.
- **Server crash reconciliation**: this is a key point. We should not track local agent status on the server side. This should be a local side state, since local agents we just that... local. This means we perhaps need a SQLite database on the client side to track this state.

---

