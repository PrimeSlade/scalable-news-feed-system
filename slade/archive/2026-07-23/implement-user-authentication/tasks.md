# Tasks: Implement User Authentication

Change status: ARCHIVED

- [x] SUCCESS TASK-001: Add approved auth dependencies and a manually validated auth configuration module that fails fast without exposing secrets. (tests: T-015)
- [x] SUCCESS TASK-002: Implement access/refresh JWT issuance, hashing, and strict verification with independent HS256 secrets and required claims. (tests: T-006, T-015)
- [x] SUCCESS TASK-003: Add auth request/types and registration validation, including normalized usernames and bcrypt-safe password boundaries. (tests: T-001)
- [ ] BLOCKED TASK-004: Extend Prisma with user credential/normalization fields and auth sessions, then implement atomic registration and session repositories using the shared Prisma client. (tests: T-002, T-003, T-004) -- implementation compiles; real MongoDB verification requires missing `TEST_DATABASE_URL` or a running local replica set.
- [ ] BLOCKED TASK-005: Implement bcrypt registration/login services and controllers with uniform credential failures and safe response projections. (tests: T-002, T-003, T-005) -- focused service/controller tests pass; real MongoDB verification requires `TEST_DATABASE_URL`.
- [x] SUCCESS TASK-006: Register `cookie-parser` and implement bearer access-token middleware with typed request identity and generic 401 failures. (tests: T-006)
- [x] SUCCESS TASK-007: Protect post creation and personal-feed routes, derive service identity from the token, and accept-but-ignore deprecated caller IDs. (tests: T-007)
- [ ] BLOCKED TASK-008: Implement MongoDB compare-and-swap refresh rotation, family replay revocation, and independent device sessions. (tests: T-008, T-009, T-010, T-011) -- focused rotation/replay tests pass; concurrency and independent-session proofs require `TEST_DATABASE_URL`.
- [x] SUCCESS TASK-009: Implement allowed-Origin-gated, idempotent logout that revokes identifiable sessions and clears the cookie. (tests: T-012, T-014)
- [x] SUCCESS TASK-010: Implement authenticated `GET /v1/me` with an explicit safe profile response. (tests: T-013)
- [x] SUCCESS TASK-011: Centralize refresh-cookie options and enforce allowed-Origin checks and production cookie flags on refresh/logout. (tests: T-014)
- [ ] BLOCKED TASK-012: Add a collision-checking normalized-username backfill that aborts without partial mutation, then generate Prisma Client. (tests: T-016) -- planner tests and Prisma generation pass; transactional MongoDB proof requires `TEST_DATABASE_URL`.
- [x] SUCCESS TASK-013: Update OpenAPI, README, seed behavior, environment documentation, and feed specs for bearer auth, deprecated ignored IDs, and the next-release removal boundary. (tests: T-017)
- [ ] BLOCKED TASK-014: Run focused tests against an isolated MongoDB replica set and complete the repository CI check sequence. (tests: T-018) -- local CI checks pass; user explicitly skipped Docker and real MongoDB verification on 2026-07-23.
