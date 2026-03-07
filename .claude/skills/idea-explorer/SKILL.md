---
name: idea-explorer
description: Skill for exploring ideas and developing them into the basis needed to write a spec (usually using spec-orchestrator or spec-writer). Explores user intent, requirements and design before implementation.
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

# Explore, understand and refine ideas ready to be turned into designs and specs.

## Overview
Through collaboration, help turn ideas into better understood initiatives and goals that can be used by the spec-orchestrator or spec-writer skill to create detailed specifications and implementation plans.

Start by understanding the current project context, then ask questions one at a time to refine the idea. Once you understand what you're building, present the approach and understanding a succinct summary (200-500 words), checking after each section whether it looks right so far.

## The Process

**1. Understand the context:**
Check out the current project state first by reading the repository contents, docs, recent commits

**2. Understanding the idea and develop the intention, problem space and opportunity presented by the idea:**
This purpose of this step is to narrow down and clarify the idea, its purpose, constraints and success criteria.

- Ask questions one at a time to refine the idea
- Prefer multiple choice questions when possible, but open-ended is fine too
- Only one question per message - if a topic needs more exploration, break it into multiple questions
- Where possible, provide 2-4 options to choose from
- You must evaluate the options yourself before presenting them to the user and provide a recommendation with reasoning
- Focus on understanding: problem to be solved, constraints, success criteria and the minimum viable solution
- Avoid feature creep - ruthlessly apply YAGNI (You Ain't Gonna Need It) to remove unnecessary features

**3. High level solutionizing:**
Think deeply about the discussion that's been had so far and propose a high level approach to solving the problem.

- Propose 2-4 different approaches with trade-offs
- Present options conversationally with your recommendation and reasoning
- Lead with your recommended option and explain why

**4. Presenting the the refined idea:**
- Now that you understand the idea, problem, success criteria and what we're building, present agreed design
- Break it into sections of 100-200 words
- Ask after each section whether it looks right so far
- Key areas to cover are: architecture, components, data flow, error handling, testing
- Be ready to go back and clarify if something doesn't make sense

## After the Design

**Handing over to the next stage (spec-orchestrator):**
Ask the user if they'd like to hand this idea discovery to the spec-orchestrator skill to formalize as a spec.

## Key Principles
- **One question at a time** - Don't overwhelm with multiple questions
- **Multiple choice preferred** - Easier to answer than open-ended when possible
- **YAGNI ruthlessly** - Remove unnecessary features from all designs
- **Explore alternatives** - Always propose 2-4 approaches before settling
- **Incremental validation** - Present design in sections, validate each
- **Be flexible** - Go back and clarify when something doesn't make sense
