# AGENTS.md

## Commands

```sh
npm run dev           # start dev server (tsx watch)
npm run build         # compile TypeScript to dist/
npm start             # run compiled output
npm run lint          # ESLint on src/
npm run format        # Prettier write on src/
npm run format:check  # Prettier check on src/ (CI)
```

**CI check order (also run locally before pushing):**

```sh
npm run format:check && npm run lint && npx tsc --noEmit
```

## Pre-commit hook

Husky + lint-staged auto-runs `prettier --write` then `eslint --fix` on staged `*.ts` files. Skip with `HUSKY=0 git commit ...`.

## Architecture

```
src/
├── index.ts              # Express entry point (connect Prisma, health, 404, error handler)
├── lib/prisma.ts         # Shared PrismaClient singleton — ALWAYS import from here
├── middleware/
│   ├── error-handler.ts  # AppError-aware error handler (not yet wired into index.ts)
│   └── ...               # (asyncHandler lives in utils/)
├── modules/
│   ├── feed/             # controller, service, routes (all empty stubs)
│   └── post/             # controller, service, routes (all empty stubs)
└── utils/
    ├── async-handler.ts  # Express async wrapper: Promise.resolve(fn).catch(next)
    ├── errors.ts         # AppError hierarchy (404, 400, 401, 409)
    └── response.ts       # success(), created(), paginated() helpers
```

**Module pattern**: `controller` validates input → calls `service` (business logic / Prisma queries) → returns via response helpers. `routes` wires endpoints to controllers.

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
- `PORT` — server port (default 3000)
- `NODE_ENV` — set to `production` to hide error details in error handler
