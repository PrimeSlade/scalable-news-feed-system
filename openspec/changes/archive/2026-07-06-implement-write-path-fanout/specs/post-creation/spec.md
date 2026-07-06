## ADDED Requirements

### Requirement: Create a post

The system SHALL allow an authenticated user to create a post with content text, persist it to MongoDB, and trigger fan-out to followers.

#### Scenario: Valid post creation
- **WHEN** a user sends `POST /v1/posts` with `{ "content": "Hello world" }`
- **THEN** the system saves the post to MongoDB with the author's userId, sets `createdAt` to current timestamp, enqueues a `feed-generation` BullMQ job with `{ postId, authorId, content, createdAt }`, and returns `201` with the created post

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
