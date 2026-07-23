# Decisions: Implement User Authentication

Design approval: APPROVED
Approved by: user
Approved on: 2026-07-22

Proposal approval: APPROVED
Approved by: user
Approved on: 2026-07-22
Test approval: APPROVED
Approved by: user
Approved on: 2026-07-22
Outcome approval: APPROVED
Approved by: user
Approved on: 2026-07-23

## D-001: Identity ownership

Status: SELECTED
Selected: Local username/password authentication owned by this API.
Reason: Keeps the news-feed service self-contained without an external identity provider.

### Options considered

1. Local auth -- self-contained; owns credential-security responsibility.
2. External provider -- reduces password custody; adds provider coupling and configuration.
3. Development tokens -- fastest demo path; unsuitable for real authentication.

## D-002: Session architecture

Status: SELECTED
Selected: Short-lived access JWTs and rotating refresh JWTs with server-side session state.
Reason: Keeps access checks stateless while supporting logout, rotation, and replay detection.

### Options considered

1. Access plus refresh JWTs -- scalable and revocable at refresh boundaries; moderate complexity.
2. Access JWT only -- simplest; forces frequent login and cannot revoke access immediately.
3. Opaque sessions -- immediately revocable; adds Redis lookup to every protected request.

## D-003: Token delivery

Status: SELECTED
Selected: Return access tokens in JSON and store refresh tokens in HttpOnly cookies.
Reason: Prioritizes browser security by keeping the long-lived credential out of JavaScript.

### Options considered

1. Browser-first cookie refresh -- safer browser storage; requires cookie and CSRF policy.
2. JSON tokens -- supports generic clients; clients must safely store refresh tokens.
3. Both contracts -- broad compatibility; doubles security-sensitive behavior.

## D-004: Login identifier

Status: SELECTED
Selected: Username and password.
Reason: Reuses the existing unique username without adding email verification or recovery.

### Options considered

1. Username -- smallest coherent change; no email recovery.
2. Email -- conventional recovery path; expands schema and validation scope.
3. Username or email -- flexible; adds collision and normalization complexity.

## D-005: Capability scope

Status: SELECTED
Selected: Register, login, refresh, logout, current-user profile, and route protection.
Reason: Provides a complete core authentication loop without broad account lifecycle work.

### Options considered

1. Core auth plus profile -- complete client bootstrap; focused scope.
2. Core auth only -- smaller; no current-user resolution endpoint.
3. Full lifecycle -- includes password and deletion workflows; materially broader security scope.

## D-006: Existing identity parameters

Status: SELECTED
Selected: Temporarily accept `authorId` and `userId` but ignore them in favor of token identity.
Reason: Closes impersonation while allowing one compatibility release.

### Options considered

1. Accept and ignore -- eases migration; temporarily preserves redundant inputs.
2. Remove immediately -- clean contract; breaks existing clients.
3. Require a match -- explicit mismatch errors; retains redundant identity inputs.

## D-007: Compatibility duration

Status: SELECTED
Selected: Remove ignored legacy identity fields in the release following the auth release.
Reason: Provides a bounded transition instead of permanent dead inputs.

### Options considered

1. Next release -- fast cleanup; introduces a scheduled v1 break.
2. API v2 -- stronger version compatibility; prolongs redundant fields.
3. Keep indefinitely -- avoids breakage; leaves a misleading contract.

## D-008: Password hashing

Status: SELECTED
Selected: bcrypt with a configurable cost.
Reason: Matches project backend guidance and has straightforward CommonJS support.

### Options considered

1. bcrypt -- established Node pattern; not memory-hard.
2. Argon2id -- memory-hard; adds native deployment complexity.
3. Node scrypt -- no dependency; requires custom encoding and parameter management.

## D-009: JWT library

Status: SELECTED
Selected: `jsonwebtoken`.
Reason: Matches project guidance and the CommonJS module setup.

### Options considered

1. `jsonwebtoken` -- mature and compatible; older API design.
2. `jose` -- modern JOSE primitives; requires more module-interoperability care.

## D-010: Refresh-session store

Status: SELECTED
Selected: MongoDB.
Reason: Provides durable rotation and revocation state without adding Redis to access checks.

### Options considered

1. MongoDB -- durable and auditable; database lookup on refresh and logout.
2. Redis -- fast with automatic TTL; continuity depends on Redis persistence.
3. MongoDB plus Redis -- durable and fast; unnecessary dual-store complexity.

## D-011: Existing users

Status: SELECTED
Selected: Preserve users without credentials as auth-ineligible.
Reason: Keeps existing users, posts, and follows without inventing or distributing passwords.

### Options considered

1. Preserve as auth-ineligible -- no data loss; needs a future provisioning flow.
2. Shared development password -- convenient demos; unsafe outside disposable data.
3. Clean reseed -- clean schema; destroys existing data.

## D-012: Credential model

Status: SELECTED
Selected: Nullable `passwordHash` on `User` with explicit safe projections.
Reason: Minimizes query complexity while representing legacy users without credentials.

### Options considered

1. Optional field on `User` -- simple query path; sensitive data shares the domain model.
2. Separate credential model -- isolates hashes; adds a relation and query complexity.

## D-013: Cookie and CSRF boundary

Status: SELECTED
Selected: Same-site deployment with Strict SameSite, HttpOnly, production Secure, auth-path scope, and allowed-Origin checks for refresh and logout.
Reason: Provides a strong browser posture without a cross-site CSRF-token protocol.

### Options considered

1. Same-site policy -- simpler strong controls; requires same-site deployment.
2. Cross-site policy -- supports unrelated domains; needs credentialed CORS and explicit CSRF tokens.

## D-014: Token lifetimes

Status: SELECTED
Selected: 15-minute access tokens and 7-day refresh sessions.
Reason: Balances access-token exposure with sign-in frequency.

### Options considered

1. 15 minutes and 7 days -- balanced; moderate refresh traffic.
2. 5 minutes and 30 days -- short access exposure; long refresh risk and more traffic.
3. 1 hour and 7 days -- fewer refreshes; larger stolen-access-token window.

## D-015: Refresh replay response

Status: SELECTED
Selected: Revoke the affected login-session family, clear its cookie, and require login.
Reason: Contains confirmed replay without logging out unrelated device sessions.

### Options considered

1. Revoke family -- strongest containment; concurrent refreshes may force login.
2. Revoke one token -- less disruption; descendants may remain valid.
3. Reject only -- simplest; weak containment.

## D-016: Brute-force protection

Status: SELECTED
Selected: Rate limiting is outside this change; production readiness is blocked until supplied externally or later.
Reason: The user explicitly excluded application, edge-only, and in-memory limits from this scope.

### Options considered

1. Out of scope -- focused change; leaves a production hardening requirement.
2. Redis-backed limits -- distributed protection; adds dependencies and Redis auth coupling.
3. Edge-only limits -- small code surface; repository is unsafe without external infrastructure.
4. Account lockout -- durable; enables account-denial attacks.

## D-017: Username normalization

Status: SELECTED
Selected: Preserve public casing and add a unique lowercase normalized login key.
Reason: Provides case-insensitive login without discarding display casing.

### Options considered

1. Normalized login key -- intuitive login; adds an indexed field.
2. Lowercase-only usernames -- simplest uniqueness; removes display casing.
3. Case-sensitive usernames -- no schema addition; permits visually equivalent accounts.

## D-018: Normalization collisions

Status: SELECTED
Selected: Abort rollout and report conflicting legacy user IDs for manual resolution.
Reason: Never silently renames or ambiguously authenticates existing identities.

### Options considered

1. Abort and report -- preserves identities; requires manual remediation.
2. Auto-suffix -- automated rollout; silently changes public identities.
3. Grandfather duplicates -- avoids renames; retains login ambiguity.

## D-019: Password policy

Status: SELECTED
Selected: Minimum 12 characters, maximum 72 UTF-8 bytes, and no composition rules.
Reason: Supports passphrases and prevents bcrypt from silently truncating input.

### Options considered

1. 12 characters and 72 bytes -- strong passphrase baseline; rejects very long inputs.
2. 8 characters and 72 bytes -- lower friction; permits weaker passwords.
3. Pre-hash then bcrypt -- supports longer input; creates a permanent custom transform.

## D-020: Registration session

Status: SELECTED
Selected: Successful registration immediately establishes a session.
Reason: Avoids a second credential round trip after account creation.

### Options considered

1. Auto-login -- smooth client flow; registration creates session state.
2. Require login -- simpler registration semantics; adds user friction.

## D-021: Registration profile

Status: SELECTED
Selected: Require `username`, `displayName`, and `password`.
Reason: Preserves the current required domain profile instead of inventing a display name.

### Options considered

1. Require display name -- explicit profile; one more required input.
2. Default to username -- simpler signup; less intentional profile data.

## D-022: Logout behavior

Status: SELECTED
Selected: After Origin validation, always clear the cookie and return idempotent 204 regardless of session validity; missing or disallowed Origin returns 403 without session side effects.
Reason: Logout does not expose token validity, while Origin security prevents cross-site forced logout.

### Options considered

1. Origin-gated idempotent 204 -- robust client behavior and CSRF defense; invalid Origin returns 403.
2. Absolute idempotent 204 -- simplest client behavior; permits cross-site forced logout.
3. Strict 401 -- precise token semantics; exposes session validity and logout can fail visibly.

## D-023: Auth observability

Status: SELECTED
Selected: No auth-specific security-event logs in this change.
Reason: Avoids expanding the change into application logging.

### Options considered

1. No auth events -- smallest scope; weak incident visibility.
2. Safe existing logs -- some visibility; unstructured operations.
3. Structured logger -- better operations; cross-cutting dependency and scope.

## D-024: Validation strategy

Status: SELECTED
Selected: Manual request and fail-fast environment validation.
Reason: Follows the current code without adding a validation dependency.

### Options considered

1. Manual validation -- consistent and dependency-free; easier to implement inconsistently.
2. Zod -- declarative and aligned with OpenSpec context; adds a shared configuration layer.

## D-025: Public auth contract

Status: SELECTED
Selected: `POST /v1/auth/register`, `/login`, `/refresh`, `/logout`, and `GET /v1/me`.
Reason: A cohesive namespace supports route ownership and refresh-cookie path scoping.

### Options considered

1. Auth namespace -- cohesive and cookie-friendly; action-oriented routes.
2. User/session resources -- resource-oriented; less aligned with existing module naming.

## D-026: JWT signing

Status: SELECTED
Selected: Independent HS256 access and refresh secrets with strict claim validation.
Reason: Fits one issuing/verifying service while isolating the two token classes.

### Options considered

1. Separate HS256 secrets -- simple single-service operation; secrets must be shared with future verifiers.
2. Asymmetric keys -- safer verifier distribution; adds key-management complexity.

## D-027: Refresh-cookie parsing

Status: SELECTED
Selected: Use `cookie-parser` and its TypeScript types.
Reason: Uses established Express middleware instead of owning cookie parsing edge cases.

### Options considered

1. `cookie-parser` -- maintained and conventional; adds a runtime dependency and types.
2. Internal single-cookie parser -- avoids a dependency; makes the project responsible for parsing correctness.
