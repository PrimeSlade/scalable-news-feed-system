## Context

The project already has Prisma (MongoDB), Redis (ioredis), and BullMQ wired up with singleton patterns and graceful shutdown. The Prisma schema has `User`, `Post`, and `Follow` models with indexes optimized for fan-out queries (`@@index([followeeId])` on Follow). The BullMQ `feed-generation` queue exists with a stub worker. Post and feed modules are empty stubs. This design covers filling in the write path.

## Goals / Non-Goals

**Goals:**
- POST endpoint for creating posts and triggering fan-out
- BullMQ worker that fans out postIds to followers' Redis sorted sets
- Celebrity threshold: skip fan-out for users with follower count > CELEBRITY_THRESHOLD
- Author sees their own post in their feed (self-feed)
- Wire module routes and error handler into Express

**Non-Goals:**
- Feed read path (GET feed endpoint) -- separate change
- Celebrity pull model on read -- separate change
- Authentication/authorization
- User or follow APIs (seed data assumed to exist)
- OpenAPI spec files

## Decisions

### Decision 1: Redis sorted set for per-user feeds

**Chosen**: ZSET per user, key = `{userId}`, score = post `createdAt` (Unix ms), value = `postId`.

**Alternatives considered**:
- List (LPUSH): Simpler but no date-range queries. Must LRANGE and read everything.
- Stream: Built-in pagination but heavier API. Overkill for feed IDs.

**Rationale**: ZSET gives chronological ordering and cursor-based pagination via `ZREVRANGEBYSCORE`. Post IDs only in Redis keeps memory low; full post data is hydrated from MongoDB on read.

### Decision 2: Worker queries followers from MongoDB, not passed in job

**Chosen**: Job data contains only `postId`, `authorId`, `content`, `createdAt`. Worker queries `follows` collection to get follower IDs.

**Alternatives considered**:
- Pass follower list in job data: Bloated payload (could be millions of IDs), stale by the time worker runs.
- Query from Redis/cache: Adds complexity for no benefit at this stage.

**Rationale**: The MongoDB `follows` collection has `@@index([followeeId])` -- this query is fast. Passing follower IDs in the job would make the API slow (waiting on that query). The job payload stays small, and the worker does the heavy query. This matches the sequence diagram ("moved after queue, was on Server before").

### Decision 3: BullMQ job idempotency via unique jobId

**Chosen**: Job ID = `fan-out-{postId}`. BullMQ deduplicates by job ID, so duplicate posts can't create duplicate jobs.

**Rationale**: If the API is called twice for the same post (retry, network issue), the second enqueue is a no-op. This is critical since the worker writes to many Redis keys and can't be transactional. Note: BullMQ custom job IDs cannot contain `:` — using `-` as separator.

### Decision 4: Pipeline fan-out writes to Redis

**Chosen**: Use ioredis `pipeline()` to batch all `ZADD` + `ZREMRANGEBYRANK` operations for a single job, then execute as one round-trip.

**Alternatives considered**:
- Individual ZADD per follower: Too many round-trips for large follower counts.
- Lua script: More efficient but harder to debug.

**Rationale**: Pipeline gives near-Lua performance with simpler code. Each follower gets `ZADD feed:{followerId} {timestamp} {postId}` and `ZREMRANGEBYRANK feed:{followerId} 0 -1001` (trim to 1000 entries).

### Decision 5: Celebrity threshold as environment variable with default

**Chosen**: `CELEBRITY_THRESHOLD` env var, default `10000`. Check `User.followersCount` (denormalized) after post save.

**Rationale**: Simple, configurable per environment. No need to count followers at runtime -- the denormalized count on the User model is already indexed. Note: follower count could be stale if follow/unfollow is not updating the counter yet, but that's acceptable for MVP.

### Decision 6: Self-feed included in fan-out

**Chosen**: Always push the author's own postId to `feed:{authorId}`.

**Rationale**: Users expect to see their own posts in their feed. The author will be in their own followers list (or we add them explicitly). For non-celebrity authors, this means the author's feed key always gets the post.

## Risks / Trade-offs

- **Stale follower count**: The denormalized `followersCount` on User could be out of sync if follow/unfollow endpoints don't update it. Mitigation: This is acceptable for the celebrity threshold -- a slightly wrong threshold just means a post gets fanned out when it shouldn't (or vice versa), not data loss.
- **Worker failure**: If the worker crashes mid-fan-out, some followers get the post and others don't. Mitigation: BullMQ retries (3 attempts with backoff). The job is idempotent by postId, so re-running is safe.
- **Redis memory**: Each user's feed ZSET grows unboundedly. Mitigation: `ZREMRANGEBYRANK` trims to the latest 1000 entries per feed. Old entries are evicted.
- **Large fan-out latency**: A user with 9,000 followers has the worker writing to 9,000 Redis keys. Mitigation: Pipeline batching reduces this to a single Redis round-trip. The API response is fast (job is async).
- **No transactional guarantee**: Post save to MongoDB and job enqueue are not atomic. If the job enqueue fails after post save, the post exists but never reaches followers. Mitigation: Acceptable for MVP. Future: outbox pattern or change stream.
