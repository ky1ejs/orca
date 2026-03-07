---
name: spec-writer
description: A skill for translating an idea into a plan/specification for implementation. Creates detailed specs in ./specs/ directory.
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash(git diff:*)
  - Bash(git status:*)
  - Bash(git log:*)
  - Bash(ls *)
  - Write(specs/*)
---

# Spec Writer
Interactive specification writer that transforms ideas into actionable implementation plans through collaborative dialogue.

---

## Modes

This skill operates in three modes:

### Interactive Mode (Default)
**Trigger:** User invokes spec-writer directly

- Full dialogue with user
- Validation checkpoints after each phase
- Questions asked one at a time
- User confirms design decisions

Announce at start: "I'm using the spec-writer skill to create the implementation plan."

### Autonomous Mode
**Trigger:** Invoked by spec-orchestrator with `{ mode: "autonomous", request: string }`

- Makes design decisions independently
- No validation checkpoints
- Documents reasoning for decisions made
- Produces complete spec in one pass

Announce at start: "I'm writing a spec autonomously for orchestrator review."

### Revision Mode
**Trigger:** Invoked by spec-orchestrator with `{ mode: "revision", currentSpec: string, feedback: object, iteration: number }`

- Receives existing spec + reviewer feedback
- Updates spec to address feedback
- Maintains Review Discussion section
- Appends Revision Notes

Announce at start: "I'm revising the spec based on reviewer feedback (iteration N)."

---

## Mode-Specific Behavior

| Phase | Interactive | Autonomous | Revision |
|-------|-------------|------------|----------|
| Understanding | Ask questions | Infer from context | Skip (spec exists) |
| YAGNI checkpoint | User validates | Self-assess, document reasoning | N/A |
| Design alternatives | Present options, user chooses | Choose best, document alternatives | Address feedback |
| Section checkpoints | Pause for validation | Continue without pause | N/A |
| Review Discussion | N/A (first draft) | N/A (first draft) | Update with feedback |
| Revision Notes | N/A | N/A | Required |

---

This skill typically used after the idea-explorer skill has gathered refined an idea into an understood problem space and success criteria, but before any implementation work begins. The output is a detailed spec file saved to `./specs/` that the spec-executor skill can then implement.

If you feel the idea that's being presented is not yet well understood, or has ambiguity, encourage the user to use the idea-explorer skill first to refine the idea.

## Core Philosophy

**Understand before writing spec**

This skill prioritizes:
1. **Dialogue over assumptions** - Ask any questions that may clarify ambiguity (interactive mode)
2. **YAGNI (you aren't gonna need it) ruthlessly** - Eliminate unnecessary scope early
3. **Incremental validation** - Confirm understanding at each step (interactive mode)
4. **Parallelization-aware design** - Structure work for concurrent execution WHEN beneficial
5. **Preserve decision rationale** - Document key trade-offs and reasoning between choices and alternatives

---

## Phase 1: Understanding (Exploring Requirements)

> **Mode note:** In autonomous mode, infer answers from context and document assumptions. In revision mode, skip this phase.

### Entry Point
When the user describes a feature or change (typically by after the idea has been explorered using the idea-explorer skill):
1. **Examine current state**
   - Read relevant existing files mentioned by user
   - Review the input from idea exploration prio to this skill
   - If not on main, check what changes have been made so far on the current branch in comparison to main
   - Identify existing patterns and documentation that apply to the goal

2. **Apply YAGNI checkpoint**

After gathering initial requirements, explicitly ask:
```
**Scope Check:** Based on what you've described, I'm considering these features:

- [Feature 1] - Essential / Nice-to-have / Not needed?
- [Feature 2] - Essential / Nice-to-have / Not needed?
- [Feature 3] - Essential / Nice-to-have / Not needed?

Let's mark "Nice-to-have" items as future work and focus on essentials.
```

---

## Phase 2: Design (Exploring Approaches)

> **Mode note:** In autonomous mode, choose the best approach and document alternatives considered. In revision mode, focus on addressing feedback rather than exploring new approaches.

### Present Alternatives

When there are multiple valid approaches:

```
**Design Decision: [Topic]**

I see 2-3 viable approaches. Here's my analysis:

---

**Recommended: Option A - [Name]**

[2-3 sentence description]

Pros:
- [Advantage 1]
- [Advantage 2]

Cons:
- [Tradeoff 1]

---

**Alternative: Option B - [Name]**

[2-3 sentence description]

Pros:
- [Advantage 1]

Cons:
- [Tradeoff 1]
- [Tradeoff 2]

---

**My recommendation:** Option A because [specific reasoning tied to requirements].

Does this align with your thinking, or would you prefer a different direction?
```

--- 

## Phase 3: Write the Specification

> **Mode note:** In autonomous mode, skip validation checkpoints and write the complete spec. In revision mode, use the Revision Mode Workflow below instead.

1. As you write each section, as detailed below, pause after each to confirm that your understanding and plan is correct. **(Interactive mode only)**
2. Be prepared to iterate on sections based on user feedback and also update earlier sections if new information arises later.

### Design Sections

Present design in digestible sections (100-300 words each):

1. **Architecture Overview** - High-level component diagram, service boundaries, data flow
2. **Data Model Changes** - Schema modifications, new types, migrations
3. **API Design** (if applicable) - GraphQL schema, queries/mutations, breaking changes
4. **Component Design** - Key modules, responsibilities, interfaces
5. **Error Handling** - Failure modes, recovery strategies
6. **Testing Strategy** - Unit tests, integration tests, edge cases

### Validation Checkpoint

**(Interactive mode only)** After EACH section:

```
**Checkpoint: [Section Name]**

Does this design approach work for you? Any questions before we continue?
```

---

## Revision Mode Workflow

When invoked with `{ mode: "revision", currentSpec, feedback, iteration }`:

### Step 1: Analyze Feedback

Review the feedback object:
- **mustAddress** — Blocking issues that must be resolved
- **shouldConsider** — Important suggestions, address or justify skipping
- **minorOptional** — Quick wins, address if easy
- **disagreements** — Conflicting reviewer perspectives

### Step 2: Update the Spec

For each piece of feedback:
1. Make the necessary changes to the spec content
2. Integrate changes coherently (don't just append)
3. Maintain the spec's overall structure and flow

### Step 3: Update Review Discussion Section

Add or update the **Review Discussion** section in the spec:

```markdown
## Review Discussion

### Key Feedback Addressed
- **[Issue]** ([Reviewer]): [How it was resolved]

### Tradeoffs Considered
- **[Alternative]**: [Why it was rejected or deferred]

### Dissenting Perspectives
- **[Concern]** ([Reviewer]): [Why not fully addressed, reasoning]
```

This section accumulates across iterations—add to it, don't replace.

### Step 4: Append Revision Notes

At the end of the spec, append:

```markdown
---

## Revision Notes (Iteration N)

### Addressed
- [Feedback item]: [How addressed]

### Intentionally Not Addressed
- [Feedback item]: [Reasoning — this may trigger escalation]

### Other Changes
- [Any additional improvements]
```

### Handling Disagreements

If you believe feedback is incorrect:
1. Still acknowledge the concern in Review Discussion
2. Explain your reasoning clearly in "Intentionally Not Addressed"
3. Accept that this may trigger escalation to human review

If reviewers disagree with each other:
1. Note both perspectives in Review Discussion
2. Make a reasoned choice and document why
3. Or flag for human decision if truly unresolvable

---

## Phase 4: Specification Output

### File Naming

1. Create a git worktree for the spec if not already done.
2. Save specs to: `./specs/YYYY-MM-DD-<topic>-spec.md` (example: `./specs/2024-12-21-task-templates-spec.md`)

### Spec Template

Use the template defined in `@spec-template.md` when creating specification files.

---

## Workflow Summary

```
User Request
     │
     ▼
┌─────────────────────────────────┐
│ PHASE 1: UNDERSTANDING          │
│ • Examine current state         │
│ • Ask questions (one at a time) │
│ • Apply YAGNI checkpoint        │
└─────────────────────────────────┘
     │
     ▼
┌─────────────────────────────────┐
│ PHASE 2: DESIGN                 │
│ • Present 2-3 approaches        │
│ • Lead with recommendation      │
│ • Validate each section         │
└─────────────────────────────────┘
     │
     ▼
┌─────────────────────────────────┐
│ PHASE 3: SPECIFICATION          │
│ • Generate spec document        │
│ • Save to ./specs/              │
│ • Include parallelization if    │
│   work is parallelizable        │
└─────────────────────────────────┘
     │
     ▼
Ready for Implementation
```

---

## Orca-Specific Considerations

### Service Awareness

When designing features, always consider impact on:
- **Backend** (`/backend/`) — Bun + GraphQL (graphql-yoga) + Prisma + Postgres
- **Web** (`/web/`) — Electron + React (electron-vite)

### Breaking Change Protocol

If spec involves GraphQL schema changes:
1. Identify all client queries that may be affected
2. Document breaking vs. non-breaking changes
3. Include migration strategy in spec

---

## Example Interaction

**User:** I want to add task templates so users can create tasks from predefined templates

**Spec Writer:**
```
I'll help you design a task templates feature. Let me understand your vision.

**Question 1 of ~5:** Template Scope

Where should templates live?

A) Global templates available to all projects
B) Per-project templates defined by project members
C) Both global and per-project templates
D) Something else (please describe)

Which fits your vision?

---

## Alternative Decisions Considered
[If applicable, document any significant alternatives that were considered but not chosen, along with reasoning.]
```

---

## Phase 5: After Writing the Spec (Interactive Mode Only)

> **Mode note:** Skip this phase in autonomous and revision modes—the orchestrator handles the workflow.

Asks these questions one at a time to the user:
1. Ask if the user would like to create a worktree to continue this work on. If yes:
     1. use the `/create-worktree` command with a suitable name and new branch off main.
     2. add the worktree name to the spec frontmatter.
     3. copy the spec to the new worktree's `./specs/` directory and commit it there.
2. Ask if the user would like to make a commit and do so if desired
