# Orca Implementation Tracker

## Status

| Wave | Description | Status | Agents |
|------|------------|--------|--------|
| 0 | Foundation (interactive) | Not Started | - |
| 1 | Schema + Data Layer / Electron Shell | Not Started | 1A, 1B |
| 2 | Navigation UI / PTY Engine | Not Started | 2A, 2B |
| 3 | Terminal UI / Agent Launch | Not Started | 3A, 3B |
| 4 | Polish / Hardening | Not Started | 4A, 4B |

## Wave Dependency Graph

```
Wave 0: Foundation (interactive with user)
  |
  v
Wave 1: Backend Data Layer (1A) || Electron Shell (1B)
  |
  v
Wave 2: Navigation UI (2A) || PTY Engine (2B) [GATING CHECK]
  |
  v
Wave 3: Terminal UI (3A) || Agent Launch+Status (3B)
  |
  v
Wave 4: Polish (4A) || Hardening+Distribution (4B)
  |
  v
PROTOTYPE READY FOR SELF-TESTING
```

## How These Docs Work

### For the developer (you)
- This README is your dashboard. Update the status table as waves complete.
- Review PRs on GitHub. CI runs automatically.
- Each wave file has checkboxes — tick them off as deliverables land.

### For agents
Each agent reads exactly 2 files:
1. `agent-protocol.md` — git workflow, validation steps, conventions
2. Their specific `wave-N.md` — deliverables, file ownership, tests

Agents should NOT read other wave files or this README.

### For context
- Full architecture: `/PLAN.md`
- Dependency rules: `/DEPS.md`
- Design decisions: `/PLAN-REVIEW.md`
- Project conventions: `/CLAUDE.md` (created in Wave 0)

## Quick Reference

| What | Where |
|------|-------|
| Agent protocol | `docs/implementation/agent-protocol.md` |
| Wave 0 (foundation) | `docs/implementation/wave-0.md` |
| Wave 1 (schema + shell) | `docs/implementation/wave-1.md` |
| Wave 2 (nav UI + PTY) | `docs/implementation/wave-2.md` |
| Wave 3 (terminal + launch) | `docs/implementation/wave-3.md` |
| Wave 4 (polish + hardening) | `docs/implementation/wave-4.md` |
