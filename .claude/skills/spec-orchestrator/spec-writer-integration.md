# Spec Writer Integration

This document defines the contract between the spec-orchestrator and the spec-orchestrator skill.

## Overview

The orchestrator invokes the spec writer in two scenarios:
1. **Autonomous draft**: Given a problem/request, produce a spec without user interaction
2. **Revision**: Given a spec + feedback, produce an updated spec

The spec-writer also supports an **interactive mode** for direct user invocation, but that's not used by the orchestrator.

## Input Contract

### For Autonomous Draft

The orchestrator will provide:

```
{
  mode: "autonomous",
  request: string,       // The original user request or problem statement
  context?: string       // Optional additional context
}
```

### For Revision

The orchestrator will provide:

```
{
  mode: "revision",
  currentSpec: string,   // The current spec content
  iteration: number,     // Which revision round this is (1, 2, 3...)
  feedback: {
    summary: string,           // 2-3 sentence overview
    mustAddress: string[],     // Blocking issues (with reviewer attribution)
    shouldConsider: string[],  // Important but non-blocking
    minorOptional: string[],   // Polish items
    disagreements?: string[]   // Reviewer conflicts, if any
  }
}
```

## Output Contract

The spec writer must return a valid spec in both cases.

### For Autonomous Draft

Return the complete spec following the spec-template. Include:
- All standard sections
- Documented reasoning for design decisions made
- Alternatives considered (in Architecture & Design section)

### For Revision

Return the updated spec with:
1. **Review Discussion section** — updated with feedback addressed
2. **Revision Notes** — appended at the end

```markdown
[... updated spec content ...]

---

## Revision Notes (Iteration N)

### Addressed
- [Feedback item]: [How it was addressed]
- [Feedback item]: [How it was addressed]

### Intentionally Not Addressed
- [Feedback item]: [Why it was not addressed — this will be reviewed]

### Other Changes
- [Any additional improvements made]
```

## Handling Feedback

### Must Address Items

These are blocking. The spec writer should:
1. Address each one, OR
2. Provide a compelling reason why it should not be addressed

If the spec writer believes feedback is incorrect or misguided, they should:
- Still acknowledge the concern in Revision Notes
- Explain why they chose not to address it
- Accept that this may trigger `needs-discussion` status

### Should Consider Items

These are important but not blocking. The spec writer should:
1. Address if straightforward
2. Note in "Intentionally Not Addressed" with reasoning if skipped

### Minor/Optional Items

Address as quick wins if easy. Otherwise, can be ignored.

### Maintaining Review Discussion

The spec writer must maintain a **Review Discussion** section in the spec that captures:

1. **Key Feedback Addressed** — Significant issues raised and how they were resolved
2. **Tradeoffs Considered** — Alternatives discussed, why rejected or deferred
3. **Dissenting Perspectives** — Concerns acknowledged but not fully addressed, with reasoning

This section should be updated with each revision, accumulating the discussion history. It becomes part of the permanent spec record—not just process metadata.

## Revision Behavior Guidelines

```markdown
## For the Spec Writer: Revision Mode

When revising based on feedback:

1. **Be receptive, not defensive**
   - Reviewers are trying to improve the spec, not attack it
   - If feedback is valid, incorporate it gracefully
   - Don't argue for the sake of arguing

2. **Address the intent, not just the letter**
   - If a reviewer asks "what about error handling?" don't just add a sentence
   - Think about why they asked and whether the concern is deeper

3. **Maintain coherence**
   - Don't just append fixes — integrate them
   - A revision should read as a unified document, not a patchwork

4. **Be honest about tradeoffs**
   - If addressing one concern creates a new issue, note it
   - If you're making a judgment call, say so

5. **Know when to escalate**
   - If you genuinely believe feedback is wrong, say so clearly
   - Provide your reasoning
   - Accept that a human may need to decide

6. **Don't gold-plate**
   - Address the feedback, but don't use revision as an excuse to expand scope
   - Stay focused on the issues raised
```

## Example Revision Flow

### Input (Revision Request)

```json
{
  "mode": "revision",
  "currentSpec": "# Auth Service Spec\n\n## Overview\nWe will add OAuth support...",
  "iteration": 1,
  "feedback": {
    "summary": "Solid foundation but missing critical security and operational details.",
    "mustAddress": [
      "No token expiration or refresh strategy defined — raised by Paranoid Engineer",
      "Missing rate limiting for auth endpoints — raised by Paranoid Engineer"
    ],
    "shouldConsider": [
      "Consider adding audit logging for auth events — raised by Operator",
      "Clarify behavior when OAuth provider is unavailable — raised by Paranoid Engineer"
    ],
    "minorOptional": [
      "Typo in section 3.2"
    ]
  }
}
```

### Output (Revised Spec)

```markdown
# Auth Service Spec

## Overview
We will add OAuth support...

## Token Lifecycle
[NEW SECTION addressing expiration and refresh]

## Rate Limiting
[NEW SECTION addressing rate limits]

## Failure Modes
### OAuth Provider Unavailable
[Addressing the "should consider" feedback]

...

---

## Review Discussion

### Key Feedback Addressed
- **Token expiration** (Paranoid Engineer): Added Token Lifecycle section with 1-hour access tokens and 30-day refresh tokens. Chose shorter access tokens to limit blast radius of token theft.
- **Rate limiting** (Paranoid Engineer): Added progressive backoff strategy. Considered fixed limits but backoff better handles burst traffic.

### Tradeoffs Considered
- **Refresh token rotation**: Discussed rotating refresh tokens on each use for added security. Deferred to Phase 2 due to added complexity in distributed session management.

### Dissenting Perspectives
- **Audit logging** (Operator): Requested auth event logging. Deferring to Phase 2 as logging infrastructure is a separate workstream. Acknowledged this limits initial observability.

---

## Revision Notes (Iteration 1)

### Addressed
- Token expiration: Added Token Lifecycle section
- Rate limiting: Added Rate Limiting section
- OAuth unavailability: Added Failure Modes section
- Fixed typo in section 3.2

### Intentionally Not Addressed
- Audit logging: Deferring to Phase 2 (see Review Discussion)

### Other Changes
- Reorganized sections for better flow
- Added diagram for token refresh flow
```

## Wiring Into Your Skill

To integrate your existing spec-writer:

1. **Add mode detection** at the start:
   ```
   IF input contains "currentSpec" and "feedback":
     mode = "revision"
   ELSE IF input contains mode == "autonomous":
     mode = "autonomous"
   ELSE:
     mode = "interactive"
   ```

2. **For revision mode**, prepend to your existing prompt:
   ```
   You are revising an existing spec based on reviewer feedback.
   
   Current spec:
   [currentSpec]
   
   Feedback to address:
   [feedback]
   
   This is revision iteration [N]. Address the feedback while maintaining
   the spec's coherence. Append Revision Notes at the end.
   ```

3. **Return format** should match your existing spec format, plus Revision Notes for revisions.

## Testing the Integration

Before running the full loop, verify:

1. Spec writer handles `mode: "autonomous"` → produces valid spec without user interaction
2. Spec writer handles `mode: "revision"` → produces updated spec with Revision Notes
3. Spec writer can gracefully decline feedback with reasoning
4. Revision Notes are parseable (for orchestrator to detect disputes)