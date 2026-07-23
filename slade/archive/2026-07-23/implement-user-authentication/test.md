# Test design: Implement User Authentication

Test approval: APPROVED
Approved by: user
Approved on: 2026-07-22

## Strategy

Selected boundary: Risk-focused unit and HTTP integration coverage with real MongoDB integration for persistence guarantees.

- Run deterministic unit tests for validation, hashing boundaries, JWT claim enforcement, configuration parsing, and middleware failure mapping.
- Run Supertest HTTP integration tests for response envelopes, cookies, Origin enforcement, protected identity, profile safety, and logout behavior.
- Run persistence integration tests against an isolated `TEST_DATABASE_URL` MongoDB replica set. Never point these tests at `DATABASE_URL`; fail before cleanup if the test database marker is absent.
- Reset only auth test fixtures in the isolated database. Exercise actual unique indexes, transactions, and compare-and-swap refresh rotation.
- Mock BullMQ and Redis in auth HTTP tests because rate limiting is excluded and feed queue/cache behavior is already covered elsewhere.
- Run the repository CI sequence after focused tests. Do not measure performance or run browser automation under the selected boundary.

## Agreed tests

### T-001: Registration validation and password boundaries

- Level: unit
- Covers: AC-001, AC-002, TASK-003
- Setup: Registration validator with representative usernames, display names, ASCII passwords, multibyte passwords, and mocked bcrypt.
- Action: Validate missing fields, normalized usernames, 11-character passwords, 12-character passwords, exactly 72 UTF-8 bytes, and more than 72 UTF-8 bytes.
- Expected: Valid input is trimmed and normalized; invalid input returns 400-class validation errors; overlong input never reaches bcrypt.
- Result: PASS

### T-002: Successful registration persists an atomic account and session

- Level: integration
- Covers: AC-001, TASK-004
- Setup: Isolated MongoDB replica-set database with no matching normalized username; real Prisma client, bcrypt, token signing, and Supertest agent.
- Action: POST valid registration fields to `/v1/auth/register`.
- Expected: Response is 201 with safe user and access token; refresh cookie has the configured attributes; user stores a bcrypt hash and normalized key; one active hashed refresh session exists; neither response nor database session stores a plaintext refresh token.
- Result: SKIPPED -- user explicitly skipped Docker/real MongoDB verification on 2026-07-23.

### T-003: Normalized duplicate registration conflicts

- Level: integration
- Covers: AC-002, TASK-004
- Setup: Isolated database containing username `Alice` with normalized key `alice`.
- Action: Register `ALICE` concurrently and sequentially.
- Expected: Every losing request returns 409; exactly one normalized identity exists; no orphan refresh session is created.
- Result: SKIPPED -- user explicitly skipped Docker/real MongoDB verification on 2026-07-23.

### T-004: Registration transaction rolls back on session persistence failure

- Level: integration
- Covers: AC-002, TASK-004
- Setup: Isolated database and deterministic token/session fixture that forces the session write to violate a test unique constraint after the user write begins.
- Action: Register a new otherwise-valid user.
- Expected: The request returns the mapped operational error and neither the user nor a partial session remains after transaction rollback.
- Result: SKIPPED -- user explicitly skipped Docker/real MongoDB verification on 2026-07-23.

### T-005: Login succeeds only for credentialed users with correct passwords

- Level: integration
- Covers: AC-003, TASK-005
- Setup: Credentialed user, legacy user with null password hash, and absent username in the isolated database.
- Action: Login with correct credentials, wrong password, unknown username, and legacy username.
- Expected: Correct credentials return 200, safe user, access token, cookie, and a new independent session; every failure returns the same generic 401 body without sensitive data.
- Result: SKIPPED -- user explicitly skipped Docker/real MongoDB verification on 2026-07-23.

### T-006: Access-token verifier enforces token class and claims

- Level: unit
- Covers: AC-004, TASK-002, TASK-006
- Setup: Valid access JWT plus variants that are missing, expired, malformed, signed with the refresh or wrong secret, use a disallowed algorithm, have wrong issuer/audience/type, or lack subject.
- Action: Pass each Authorization header through the authentication middleware.
- Expected: Only the valid access token attaches the expected user ID; every invalid variant returns the same generic 401 and never calls the protected handler.
- Result: PASS

### T-007: Protected feed operations derive identity only from the token

- Level: integration
- Covers: AC-005, TASK-007
- Setup: Valid access token for user A; mocked feed service; legacy `authorId` and `userId` values for user B.
- Action: POST `/v1/feed` and GET `/v1/me/feed` with user B in the deprecated input while authenticating as user A.
- Expected: Both endpoints pass user A to the service and never user B; missing or invalid access authentication returns 401.
- Result: PASS

### T-008: Refresh rotates token and stored hash

- Level: integration
- Covers: AC-006, TASK-008
- Setup: Supertest agent with an active refresh cookie and matching session record in the isolated database.
- Action: POST `/v1/auth/refresh` once, then inspect the response cookie and session.
- Expected: Response is 200 with a new access token and rotated refresh cookie; the stored hash changes atomically; no refresh token appears in JSON; the prior refresh token no longer succeeds.
- Result: SKIPPED -- user explicitly skipped Docker/real MongoDB verification on 2026-07-23.

### T-009: Rotated-token replay revokes its session family

- Level: integration
- Covers: AC-007, TASK-008
- Setup: Capture an old refresh cookie, rotate it successfully, and retain the new cookie for the same session family.
- Action: Replay the old cookie, then attempt refresh with the new cookie.
- Expected: Replay returns generic 401 and clears the cookie; the session family is revoked; the newer cookie also returns 401.
- Result: SKIPPED -- user explicitly skipped Docker/real MongoDB verification on 2026-07-23.

### T-010: Concurrent refresh race has one rotation winner and safe revocation

- Level: integration
- Covers: AC-006, AC-007, TASK-008
- Setup: One active refresh cookie and session in the isolated database.
- Action: Send two refresh requests concurrently with the same cookie.
- Expected: At most one compare-and-swap rotation succeeds; the losing reuse path revokes the family; no two active descendants remain; subsequent refresh requires login.
- Result: SKIPPED -- user explicitly skipped Docker/real MongoDB verification on 2026-07-23.

### T-011: Replay does not revoke unrelated device sessions

- Level: integration
- Covers: AC-007, TASK-008
- Setup: Two independently logged-in sessions for one user; rotate and retain tokens for both.
- Action: Replay a rotated token from session A, then refresh session B.
- Expected: Session A is revoked and returns 401; session B remains active and rotates successfully.
- Result: SKIPPED -- user explicitly skipped Docker/real MongoDB verification on 2026-07-23.

### T-012: Logout is idempotent and revokes identifiable sessions

- Level: integration
- Covers: AC-008, TASK-009
- Setup: Active, revoked, expired, malformed, and absent refresh-cookie cases using Supertest agents, an allowed Origin, and isolated session records.
- Action: POST `/v1/auth/logout` for each case and retry logout.
- Expected: Every request returns 204 and an expired refresh cookie; an identifiable active session becomes revoked; no response reveals prior validity.
- Result: PASS

### T-013: Current-user profile is authenticated and safe

- Level: integration
- Covers: AC-009, TASK-010
- Setup: Credentialed user with password hash, normalized key, avatar, and active access token.
- Action: GET `/v1/me` with valid, absent, and invalid access tokens.
- Expected: Valid request returns only approved profile fields; invalid requests return generic 401; password and session fields never appear.
- Result: PASS

### T-014: Cookie and Origin policy is enforced

- Level: integration
- Covers: AC-010, TASK-011
- Setup: Development and production cookie configuration fixtures, allowed and disallowed Origin values, and active refresh session.
- Action: Register/login to inspect cookies, then call refresh/logout with allowed, missing, and disallowed Origin headers.
- Expected: Cookie flags and path match configuration; production cookies are Secure; allowed Origin succeeds; missing/disallowed Origin returns 403 for refresh and logout; rejected logout does not revoke the session or clear the cookie.
- Result: PASS

### T-015: Auth configuration fails fast

- Level: unit
- Covers: AC-011, TASK-001
- Setup: Manual configuration loader with isolated environment maps.
- Action: Load valid settings and variants with missing/short secrets, equal access/refresh secrets, invalid lifetimes, invalid bcrypt cost, invalid issuer/audience, or malformed allowed origins.
- Expected: Valid configuration produces typed settings; every invalid configuration throws a clear startup error without printing secret values.
- Result: PASS

### T-016: Username backfill succeeds or reports collisions without partial rollout

- Level: integration
- Covers: AC-011, TASK-012
- Setup: Isolated database first with collision-free legacy usernames, then with case-folding conflicts.
- Action: Run the proposed normalized-username backfill/check routine in each dataset.
- Expected: Collision-free users receive normalized keys before uniqueness enforcement; conflicts abort with involved user IDs; no conflicting dataset is partially modified or indexed.
- Result: SKIPPED -- user explicitly skipped Docker/real MongoDB verification on 2026-07-23.

### T-017: OpenAPI exposes the approved auth and deprecation contract

- Level: contract
- Covers: AC-012, TASK-013
- Setup: Generated `swaggerSpec` from route annotations after auth changes.
- Action: Inspect auth paths, bearer security schemes, response shapes, cookie behavior descriptions, protected feed security, and deprecated legacy identity fields.
- Expected: The generated contract matches the approved endpoints and marks legacy fields deprecated and ignored; sensitive credential fields are absent from response schemas.
- Result: PASS

### T-018: Repository verification remains green

- Level: integration
- Covers: AC-001, AC-002, AC-003, AC-004, AC-005, AC-006, AC-007, AC-008, AC-009, AC-010, AC-011, AC-012, TASK-014
- Setup: Installed dependencies, generated Prisma client, test environment, and isolated MongoDB replica-set database.
- Action: Run focused auth tests, then `npm run format:check && npm run lint && npx tsc --noEmit && npm test`.
- Expected: All focused and existing checks pass without changing established feed behavior beyond the approved authentication contract.
- Result: PASS

## Verification log

| Date | Command | Result | Notes |
| --- | --- | --- | --- |
| 2026-07-22 | `npx vitest run src/config/auth.test.ts` | PASS | 12 configuration cases passed. |
| 2026-07-22 | `npx vitest run src/modules/auth/token.service.test.ts && npx tsc --noEmit` | PASS | 10 JWT/hash cases and TypeScript passed; middleware half of T-006 remained pending. |
| 2026-07-22 | `npx vitest run src/modules/auth/token.service.test.ts src/middleware/authenticate.test.ts && npx tsc --noEmit` | FAIL | 6 middleware assertions exposed incorrect `AppError` subclass prototypes. |
| 2026-07-22 | `npx vitest run src/modules/auth/token.service.test.ts src/middleware/authenticate.test.ts && npx tsc --noEmit` | PASS | 17 strict JWT and bearer middleware cases passed after correcting subclass prototypes. |
| 2026-07-22 | `npx vitest run src/modules/auth/auth.validation.test.ts && npx tsc --noEmit` | PASS | 10 registration/login validation cases and TypeScript passed. |
| 2026-07-22 | `npx prisma generate && npx tsc --noEmit` | PASS | Prisma Client generated for auth schema and repository compiled. |
| 2026-07-22 | `TEST_DATABASE_URL` presence check and Docker daemon check | SKIPPED | Real MongoDB tests T-002 through T-004 could not run: test URL missing and local Docker daemon unavailable. |
| 2026-07-22 | `npx vitest run src/modules/auth/auth.service.test.ts && npx tsc --noEmit` | FAIL | Registration fixture incorrectly returned a password field outside the repository's safe projection contract. |
| 2026-07-22 | `npx vitest run src/modules/auth/auth.service.test.ts src/modules/auth/auth.controller.test.ts && npx tsc --noEmit` | PASS | 7 focused registration/login service and controller cases passed; real MongoDB parts of T-002, T-003, and T-005 remain blocked. |
| 2026-07-22 | `npx vitest run src/modules/feed/feed.controller.test.ts src/modules/feed/feed.auth.integration.test.ts src/middleware/authenticate.test.ts && npx tsc --noEmit` | FAIL | Sandbox denied Supertest ephemeral listeners with `listen EPERM`; unit cases passed. |
| 2026-07-22 | Escalated focused feed auth suite, then `npx tsc --noEmit` | PASS | 18 tests passed and TypeScript passed; idle escalated wrapper was terminated after Vitest completion. |
| 2026-07-22 | `npx vitest run src/modules/auth/auth.service.test.ts src/modules/auth/token.service.test.ts && npx tsc --noEmit` | PASS | 18 focused login, rotation, replay, race-loss, and token cases passed; T-008 through T-011 still require real MongoDB. |
| 2026-07-22 | Escalated single-worker auth cookie/logout suite | PASS | 22 service, cookie, Origin, refresh, and idempotent logout cases passed. |
| 2026-07-22 | Escalated cookie/Origin/config suite, then `npx tsc --noEmit` | PASS | 23 policy cases and TypeScript passed; Vitest reported completion before the idle wrapper was terminated. |
| 2026-07-22 | Escalated forked current-user suite | FAIL | HTTP assertion expected `Date` objects instead of serialized ISO strings; 14 other cases passed. |
| 2026-07-22 | PTY `npx vitest run src/modules/auth/me.auth.integration.test.ts --pool=forks --maxWorkers=1 --fileParallelism=false` | PASS | 3 current-user HTTP cases passed. |
| 2026-07-22 | `npx vitest run src/scripts/backfill-normalized-usernames.test.ts && npx prisma generate && npx tsc --noEmit` | PASS | 2 collision-planning cases passed and Prisma Client regenerated; real MongoDB portion of T-016 remains blocked. |
| 2026-07-22 | `npx vitest run src/swagger.test.ts && npx tsc --noEmit` | PASS | 2 OpenAPI endpoint, bearer security, and deprecation contract cases passed. |
| 2026-07-22 | `npm run format:check` | FAIL | Prettier reported formatting drift in 11 new source/test files. |
| 2026-07-22 | `npm run format:check && npm run lint && npx tsc --noEmit` | PASS | Formatting, ESLint, and TypeScript checks passed after applying Prettier. |
| 2026-07-22 | `npm test` (sandboxed) | FAIL | 96 tests passed; 25 Supertest cases were denied ephemeral listeners with `listen EPERM`. |
| 2026-07-23 | PTY `npx vitest run --maxWorkers=1 --fileParallelism=false` | FAIL | 112 tests passed; 9 existing feed integration tests still expected pre-auth contracts. |
| 2026-07-23 | PTY `npx vitest run --maxWorkers=1 --fileParallelism=false` | PASS | All 16 files and 121 tests passed after updating legacy feed integration expectations. |
| 2026-07-23 | `npm run format:check && npm run lint && npx tsc --noEmit` | PASS | Final formatting, lint, and TypeScript checks passed. |
| 2026-07-23 | Escalated PTY `npm test` | PASS | All 16 files and 121 tests passed; wrapper was terminated only after Vitest reported completion. |
| 2026-07-23 | Docker/real MongoDB boundary | SKIPPED | User explicitly instructed to skip Docker; T-002 through T-005, T-008 through T-011, and T-016 remain unverified against a replica set. |
