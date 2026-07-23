# post-creation

## Purpose

Handles post creation with content validation, MongoDB persistence, and conditional fan-out triggering based on celebrity follower thresholds.

## Requirements

### Requirement: Create a post as the authenticated user

The system SHALL allow an authenticated user to create a post with content text, persist it to MongoDB, and trigger fan-out to followers.

#### Scenario: Valid post creation
- **WHEN** a user sends authenticated `POST /v1/feed` with `{ "content": "Hello world" }`
- **THEN** the system saves the post using the access-token subject as `authorId`, sets `createdAt`, conditionally enqueues fan-out, and returns `201`

#### Scenario: Legacy authorId cannot impersonate
- **WHEN** authenticated user A sends `POST /v1/feed` with an `authorId` for user B
- **THEN** the system ignores the deprecated `authorId` field and creates the post as user A

#### Scenario: Missing authentication rejected
- **WHEN** a caller sends `POST /v1/feed` without a valid access token
- **THEN** the system returns `401`

#### Scenario: Empty content rejected
- **WHEN** a user sends `POST /v1/posts` with `{ "content": "" }`
- **THEN** the system returns `400` with an error message indicating content must not be empty

#### Scenario: Missing content rejected
- **WHEN** a user sends `POST /v1/posts` with `{}`
- **THEN** the system returns `400` with an error message indicating content is required

#### Scenario: Content too long rejected
- **WHEN** a user sends `POST /v1/posts` with content exceeding 280 characters
- **THEN** the system returns `400` with an error message indicating content must be 280 characters or less

### Requirement: Skip fan-out for celebrities

The system SHALL skip enqueuing a fan-out job when the post author's `followersCount` exceeds a configurable celebrity threshold.

#### Scenario: Celebrity user creates a post
- **WHEN** a user with `followersCount` greater than `CELEBRITY_THRESHOLD` creates a post
- **THEN** the system saves the post to MongoDB, does NOT enqueue a fan-out job, and returns `201` with the created post

#### Scenario: Non-celebrity user creates a post
- **WHEN** a user with `followersCount` less than or equal to `CELEBRITY_THRESHOLD` creates a post
- **THEN** the system saves the post AND enqueues a fan-out job
