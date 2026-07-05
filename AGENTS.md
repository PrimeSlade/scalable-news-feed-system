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
