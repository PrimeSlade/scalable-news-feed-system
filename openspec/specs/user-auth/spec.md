# user-auth

## Purpose

Authenticates local username/password users, issues short-lived access tokens, rotates durable refresh sessions, and supplies authoritative identity to protected feed operations.

## Requirements

### Requirement: Register and login

The system SHALL register unique normalized usernames with bcrypt password hashes and SHALL return access tokens without exposing password or refresh-token material.

#### Scenario: Register valid account

- **WHEN** a caller sends `POST /v1/auth/register` with username, displayName, and a valid password
- **THEN** the system atomically creates the user and refresh session, returns `201` with an access token and safe profile, and sets the protected refresh cookie

#### Scenario: Login valid account

- **WHEN** a credentialed user sends valid username/password credentials to `POST /v1/auth/login`
- **THEN** the system returns `200` with an access token and safe profile and creates an independent refresh session

#### Scenario: Invalid credentials

- **WHEN** the username is unknown, has no password hash, or the password is wrong
- **THEN** the system returns the same generic `401` response

### Requirement: Rotate refresh sessions

The system SHALL rotate the refresh token and stored token hash using compare-and-swap semantics.

#### Scenario: Valid refresh

- **WHEN** an allowed-Origin request presents the current refresh cookie to `POST /v1/auth/refresh`
- **THEN** the system returns a new access token, rotates the cookie and stored hash, and invalidates the old token

#### Scenario: Refresh replay

- **WHEN** an already rotated refresh token is presented
- **THEN** the system revokes that session family, clears the cookie, and returns generic `401`

### Requirement: Logout

The system SHALL require an allowed Origin before logout side effects and SHALL make logout idempotent across refresh-token states.

#### Scenario: Allowed-Origin logout

- **WHEN** an allowed-Origin request sends `POST /v1/auth/logout`
- **THEN** the system revokes any identifiable active session, clears the cookie, and returns `204`

#### Scenario: Disallowed-Origin logout

- **WHEN** the Origin is missing or disallowed
- **THEN** the system returns `403` without changing the session or cookie

### Requirement: Current user

The system SHALL return only the access-token subject's safe profile from `GET /v1/me`.

#### Scenario: Valid current-user request

- **WHEN** a caller presents a valid access bearer to `GET /v1/me`
- **THEN** the system returns the safe user profile without credential or session fields
