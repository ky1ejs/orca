# Orca

## Intro

I believe that paralellizing work across agents is has a natural and intuitive relationship to managing and shaping projects in project management tools.

An illustration of the power of the relationship between agents and project management tools can be seen in the story of how Anthropic build Claude Clode plugins over a weekend by giving an agent a spec and an Asana board:
https://www.reddit.com/r/ClaudeCode/comments/1rjs83j/anthropic_gave_claude_code_a_product_spec_and/

## The Problem

Running multiple agents in terminal tabs is difficult to do due to the lack of metadata you can pin to a tab (e.g. status, description etc.).

We usually house this type of metadata in a project management tool such as Linear, Jira, Asana etc.

However, those tools don't solve the problem of you having an easily visible overview of your agents that are currently running, their status and offer you tools to interact with them in a fast way, espcially when they're running on your local machine.

I believe that local agents will remain just as important as background agents due to challenges with environment configuration, context provision, access and security.

## Solutions Considered

1. **[Conductor](https://www.conductor.build/)** – looks great but does not treat project management tools as first class citizens
2. **[Intent](https://www.augmentcode.com/product/intent)** – similar to conductor

### Other options claude found during research

- **[OpCode](https://github.com/winfunc/opcode)**
- **[ruflo](https://github.com/ruvnet/ruflo?utm_source=chatgpt.com)**

## The Orca Solution

Orca is a prototype work management tool that allows you to work alongside both local and remote agents.

### Stack

Still being figure out, but likely:

- **Backend**: Bun, Typescript, Prisma, Postgres
- **Frontend**: React, Electron, tmux
- **API**: GraphQL, Websockets

### Data Model

- **Workspace**: A workspace is a collection of projects. Each workspace has a name and a list of projects. Typically, a company would have one workspace that all employees are a part of.
- **Project**: A project is a collection of tasks that are related to a common goal. Each project has a name, description, and a list of tasks.
- **Task**: A task is a unit of work that needs to be completed. Each task has a name, description, status, and assignee.

### Future Problems to Solve

- Company Wide skill and workflow management
- How swarms of agents can attack projects together with Orca
