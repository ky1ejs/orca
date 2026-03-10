# Backend (@orca/backend)

Bun + GraphQL (graphql-yoga) + Prisma + Postgres server for shared collaborative state.

## Bootstrapping

```bash
# 1. Install dependencies
bun install

# 2. Start Postgres (from repo root)
docker compose up -d

# 3. Copy env and configure
cp .env.example .env
# Requires: DATABASE_URL, JWT_SECRET, INVITE_CODE, PORT (default 4000)

# 4. Generate Prisma client
bun run db:generate

# 5. Run migrations
bun run db:migrate

# 6. Generate GraphQL types
bun run codegen

# 7. Seed dev user (dev@orca.local / dev-password)
bun run seed:dev
```

## Commands

| Command                | Description                                               |
| ---------------------- | --------------------------------------------------------- |
| `bun run dev`          | Start dev server with watch mode                          |
| `bun run lint`         | ESLint check                                              |
| `bun run lint:fix`     | ESLint auto-fix                                           |
| `bun run format`       | Prettier format                                           |
| `bun run format:check` | Prettier check                                            |
| `bun run typecheck`    | TypeScript check (`tsc --noEmit`)                         |
| `bun run test`         | Run tests (`vitest run`)                                  |
| `bun run knip`         | Dead code detection                                       |
| `bun run validate`     | All checks: lint + format:check + knip + typecheck + test |
| `bun run codegen`      | Generate GraphQL TypeScript types                         |
| `bun run db:generate`  | Generate Prisma client                                    |
| `bun run db:migrate`   | Create/run Prisma migrations                              |
| `bun run db:push`      | Push schema to DB without migration                       |
| `bun run seed`         | Create/update a user (`--email`, `--name`, `--password`)  |
| `bun run seed:dev`     | Create default dev user                                   |

## Code Generation

Two codegen steps, both must be run after schema changes:

1. **Prisma** (`bun run db:generate`) — generates `@prisma/client` types from `prisma/schema.prisma`
2. **GraphQL** (`bun run codegen`) — generates `src/__generated__/graphql.ts` from `src/schema/schema.graphql` using `codegen.ts` config. Maps Prisma models to GraphQL types.

After changing `schema.graphql`, run `bun run codegen`. After changing `schema.prisma`, run `bun run db:generate` (and `bun run db:migrate` if schema changed).

## Source Structure

```
src/
├── __generated__/graphql.ts   — Generated GraphQL types (do not edit)
├── index.ts                   — Server entry point
├── context.ts                 — GraphQL context (auth, Prisma client)
├── pubsub.ts                  — Pub/Sub for subscriptions
├── auth/                      — JWT, password hashing, token ops
├── db/client.ts               — Prisma client init
├── schema/
│   ├── schema.graphql         — SDL schema definition (source of truth)
│   ├── index.ts               — Schema composition
│   ├── scalars.ts             — Custom scalars (DateTime)
│   ├── auth.ts                — Auth resolvers
│   ├── task.ts                — Task CRUD
│   ├── project.ts             — Project CRUD
│   ├── initiative.ts          — Initiative CRUD
│   ├── label.ts               — Label CRUD
│   ├── pull-request.ts        — PR resolvers
│   ├── membership.ts          — Workspace membership
│   └── workspace.ts           — Workspace resolvers
├── scripts/                   — Seed and backfill scripts
└── webhooks/                  — GitHub webhook handlers
```

## Testing

- **Framework**: Vitest
- **Pattern**: `*.test.ts` co-located next to source files
- **Run**: `bun run test`

## Schema Workflow

When adding/modifying a GraphQL feature:

1. Edit `prisma/schema.prisma` if DB changes needed
2. Run `bun run db:migrate` to create migration
3. Edit `src/schema/schema.graphql` for API changes
4. Run `bun run codegen` to regenerate types
5. Implement/update resolvers in `src/schema/`
6. Run `bun run validate` before pushing
