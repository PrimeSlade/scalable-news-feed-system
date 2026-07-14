# AGENTS.md

## Commands

```sh
npm run dev           # start dev server (tsx watch)
npm run build         # compile TypeScript to dist/
npm start             # run compiled output
npm run lint          # ESLint on src/
npm run format        # Prettier write on src/
npm run format:check  # Prettier check on src/ (CI)
npm test              # vitest run (unit + integration)
npm run test:watch    # vitest in watch mode
npm run test:coverage # vitest with coverage report
```

**CI check order (also run locally before pushing):**

```sh
npm run format:check && npm run lint && npx tsc --noEmit && npm test
```

## Pre-commit hook

Husky + lint-staged auto-runs `prettier --write` then `eslint --fix` on staged `*.ts` files. Skip with `HUSKY=0 git commit ...`.

## Architecture

```
src/
├── index.ts              # Express entry point (health, feed routes, 404, error handler, graceful shutdown)
├── lib/
│   ├── prisma.ts         # Shared PrismaClient singleton — ALWAYS import from here
│   ├── redis.ts          # Shared Redis singleton — ALWAYS import from here
│   └── queue.ts          # BullMQ queue + "feed-generation" worker with fan-out processor
├── middleware/
│   └── error-handler.ts  # AppError-aware error handler (wired into index.ts)
├── modules/
│   └── feed/             # types, service, controller, routes (POST /v1/feed)
└── utils/
    ├── async-handler.ts  # Express async wrapper: Promise.resolve(fn).catch(next)
    ├── errors.ts         # AppError hierarchy (404, 400, 401, 409)
    └── response.ts       # success(), created(), paginated() helpers
```

**Module pattern**: `controller` validates input → calls `service` (business logic / Prisma queries) → returns via response helpers. `routes` wires endpoints to controllers.

**Feed write path**: `POST /v1/feed` → save post to MongoDB → check follower count (skip fan-out for celebrities) → enqueue BullMQ `feed-generation` job → worker fans out `postId` to each follower's Redis ZSET (`{userId}` key, timestamp score).

## Dependency decisions

Before adding a new npm package, always check in this order:

1. **`package.json`** -- see what's already installed
2. **`.agents/skills/`** -- some skills reference preferred libraries (e.g. `nodejs-backend-patterns` prefers `ioredis` over `redis`)
3. **`openspec/config.yaml`** -- the project's tech stack spec may mandate a specific choice

Picking the wrong library without checking these sources can lead to rewrites. When in doubt, ask the user.

### bullmq ↔ ioredis version alignment

`bullmq` bundles its own `ioredis`. The project-level `ioredis` version **must match** the version bundled by bullmq, otherwise TypeScript will fail with structural type mismatches (e.g. `protected` property differences between versions).

Check the bundled version before bumping `ioredis`:

```sh
node -e "console.log(require('bullmq/node_modules/ioredis/package.json').version)"
```

If they drift, reinstall the matching version:

```sh
npm install ioredis@<version>
npm ls ioredis   # verify deduped — both should show the same version
```

## Skills

When starting work on a task that matches an available skill's scope, **call the skill first** before writing code. Skills contain project-specific patterns, up-to-date API references, and anti-pitfalls (e.g. `bullmq-specialist` covers the exact `ioredis` + `maxRetriesPerRequest` setup needed here). Running without the skill can lead to rewrites.

Available skills are listed in the system prompt's `<available_skills>` block. Trigger on mentions of: bullmq, queue, background job, worker, Prisma query patterns, database setup, etc.

## Subagents

Custom subagents live in `.opencode/agents/`:

**Apply-time (code review + parallel implementation):**

- **`spec-reviewer`** -- read-only auditor (`edit: deny`, `bash: deny`). Reviews code against an OpenSpec delta spec + AGENTS.md conventions. Returns findings as CRITICAL / MINOR / SUGGESTION with `file:line` references. Invokable manually via `@spec-reviewer review these files: <paths>` (then mention the spec path).
- **`spec-implementer`** -- scoped implementer (`edit: allow`, `bash: allow`) used in pipeline mode. Implements one task group at a time and returns the list of files it touched. Invokable manually via `@spec-implementer`.

The `/opsx-apply` flow spawns `spec-reviewer` after each task group completes to audit the group's output before moving on. For independent groups, `spec-implementer` runs concurrently with `spec-reviewer` (hybrid serial/pipeline mode, decided by a dependency check between group pairs).

**Proposal-time (artifact review before code is written):**

- **`spec-impact-reviewer`** -- read-only (`edit: deny`, `bash: deny`). Reviews `proposal.md` for scope creep, breaking changes against existing `openspec/specs/`, missing migrations, and impact accuracy. Invokable manually via `@spec-impact-reviewer <proposal path>`.
- **`spec-architect`** -- read-only. Reviews `design.md` for architecture quality, scalability, module boundaries, convention alignment, and integration with existing capabilities. Invokable manually via `@spec-architect <design path>`.
- **`spec-security-auditor`** -- read-only. Reviews `design.md` for auth gaps, data exposure, input validation, dependency vulnerabilities, and configuration security. Invokable manually via `@spec-security-auditor <design path>`.
- **`spec-task-planner`** -- removed. The `/opsx-apply` flow performs its own runtime dependency check (file overlap, symbol import, cross-reference cues) to decide serial vs pipeline mode, so a pre-computed task graph is not required.

The `/opsx-propose` flow spawns these after each artifact is written: `spec-impact-reviewer` after `proposal.md`, `spec-architect` + `spec-security-auditor` in parallel after `design.md`. CRITICAL findings are fixed before proceeding to the next artifact.

### Watching subagents live

Every subagent spawn creates a **child session**. Navigate into it to watch its tool calls and reasoning in real time:

| Keybind (default) | Action                                        |
| ----------------- | --------------------------------------------- |
| `<Leader>+Down`   | Enter the first child session from the parent |
| `Right`           | Cycle to the next child session               |
| `Left`            | Previous child session                        |
| `Up`              | Return to the parent session                  |

## Diagrams

Reference `diagrams/` for sequence and architecture diagrams before making design decisions:

```
diagrams/
├── architecture/   # High-level architecture & component relationships
└── sequence/       # Request/event flow diagrams
```

## Key conventions

- **PrismaClient**: import `{ prisma }` from `src/lib/prisma.ts` — never create a new instance
- **Errors**: throw subclasses of `AppError` from services; the error handler middleware catches them
- **Async routes**: wrap controllers with `asyncHandler()` from utils
- **Unused vars**: prefix with `_` (e.g. `_req`, `_next`) — tsconfig has `noUnusedLocals`/`noUnusedParameters`
- **Module system**: CommonJS (`"type": "commonjs"` in package.json) — use `import`/`export` with TypeScript, but no ESM
- **Prettier**: double quotes, semicolons, 2-space, trailing commas
- **No em dashes**: use `--` instead of `—` in commit messages, notes, and prose

## Database

MongoDB via Prisma. After schema changes, run:

```sh
npx prisma generate
```

Connection string via `DATABASE_URL` in `.env` (gitignored). Default port 3000.

## Environment

- `DATABASE_URL` — MongoDB connection string (required, in `.env`)
- `REDIS_URL` — Redis connection string (defaults to `redis://localhost:6379`)
- `PORT` — server port (default 3000)
- `NODE_ENV` — set to `production` to hide error details; set to `test` to skip `app.listen()` for integration tests
- `CELEBRITY_THRESHOLD` — follower count above which fan-out is skipped (default 10000)
