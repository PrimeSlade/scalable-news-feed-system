# feed-fanout

## Purpose

Distributes new posts to followers' Redis feeds via a BullMQ worker, with idempotent job handling, self-feed inclusion, and automatic feed trimming.

## Requirements

### Requirement: Fan-out post to followers

The system SHALL distribute a new post's ID to the Redis sorted set of each follower when a `feed-generation` job is processed.

#### Scenario: Worker processes a fan-out job
- **WHEN** the worker receives a job with `{ postId, authorId, content, createdAt }`
- **THEN** the worker queries MongoDB `follows` collection for all followers of `authorId`, and for each follower (including the author), writes `postId` to Redis key `{followerId}` using `ZADD` with `createdAt` as score

#### Scenario: Worker trims old feed entries
- **WHEN** the worker writes a post to a follower's Redis feed
- **THEN** the worker trims the feed sorted set to the latest 1000 entries using `ZREMRANGEBYRANK` with start `0` and stop `-1001`

#### Scenario: Worker uses Redis pipeline for batch writes
- **WHEN** the worker writes to multiple followers' feeds
- **THEN** all `ZADD` and `ZREMRANGEBYRANK` operations are batched in a single Redis pipeline and executed as one round-trip

### Requirement: Idempotent fan-out jobs

The system SHALL ensure that duplicate fan-out jobs for the same post do not cause duplicate feed entries.

#### Scenario: Duplicate job for same post
- **WHEN** a `feed-generation` job is enqueued with job ID `fan-out:{postId}` and a job with the same ID already exists
- **THEN** the duplicate enqueue is a no-op and the existing job continues processing

### Requirement: Author self-feed

The system SHALL include the post author in their own feed fan-out.

#### Scenario: Author sees their own post
- **WHEN** the worker processes a fan-out job for a post
- **THEN** the author's own Redis feed key receives the postId alongside their followers
