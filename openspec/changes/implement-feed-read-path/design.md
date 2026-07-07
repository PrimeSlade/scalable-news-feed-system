## Context

The write path is complete: `POST /v1/feed` creates posts, checks follower count against the celebrity threshold, and enqueues BullMQ fan-out jobs. The worker fans out `postId` + `createdAt` score to each follower's Redis ZSET (`{userId}` key). Full post data lives in MongoDB and the Redis feed cache (`post:{id}` key). This design covers the read path: `GET /v1/me/feed`.

## Goals / Non-Goals

**Goals:**
- `GET /v1/me/feed` endpoint for retrieving a paginated feed
- Composite cursor-based pagination via `ZREVRANGEBYSCORE` on Redis fan-out ZSET (timestamp) and ObjectId comparison on MongoDB celebrity pull
- Post hydration via cache-aside: Redis feed cache → MongoDB fallback with TTL
- Celebrity pull-on-read: merge posts from celebrities not in fan-out store
- Reuse existing `respond()` helper with `CursorPagination` support

**Non-Goals:**
- Authentication/authorization (assume `userId` is available, e.g., from a future middleware)
- Real-time feed updates (poll-based, no WebSocket)
- Feed personalization or ranking beyond chronological order
- Deleting or editing posts

## Decisions

### Decision 1: Route at `/v1/me/feed` via separate route file in feed module

**Chosen**: Add a new route file `src/modules/feed/me.feed.routes.ts` mounted at `/v1/me` in `index.ts`, with `GET /feed` inside it. All read-path logic lives in the existing feed module (controller, service, repo, types).

**Alternatives considered**:
- Add `GET /me/feed` to the existing `feed.routes.ts`: Breaks the REST convention — `/v1/feed/me/feed` is redundant and confusing. The `feed` module handles the resource (posts), while `/me` is a user-scoped view.
- Create a separate `src/modules/me/` module: Overkill — the read path shares data access with the feed module.

**Rationale**: `/v1/me` is a natural parent for user-scoped endpoints (feed, profile, settings). The read-path controller, service, and repo extend the existing feed module since they share the `Post` data access layer.

### Decision 2: Composite cursor `"timestamp_postId"` for hybrid pagination

**Chosen**: The cursor is a composite string `"1700000000000_post-abc123"` encoding both the oldest post's `createdAt` (Unix ms) and its `id`. On the next request, the cursor is split:
- Timestamp → used as exclusive bound in `ZREVRANGEBYSCORE (cursor -inf` on Redis fan-out ZSET
- PostId → used as ObjectId comparison `id < cursor` in MongoDB celebrity pull

**Alternatives considered**:
- Timestamp-only cursor: Simpler but two posts with the same millisecond timestamp would both be skipped (rare but possible).
- PostId-only cursor: No collisions, but Redis ZSET is sorted by timestamp score — would need an extra `ZSCORE` call to resolve postId → timestamp.

**Rationale**: Composite cursor avoids same-ms collisions (ObjectId breaks ties) and avoids extra Redis lookups (timestamp is already in the cursor). Each data source uses the part it can index efficiently.

### Decision 3: Cache-aside post hydration in the service layer

**Chosen**: After getting postIds from Redis, batch-check Redis feed cache via `MGET post:{id}`. Collect missing IDs, fetch from MongoDB via `findMany({ id: { in: missingIds } })`, then `SET` each fetched post into Redis with TTL of `FEED_CACHE_TTL_SECONDS` (default 10800 = 3 hours).

**Alternatives considered**:
- Always fetch from MongoDB: Higher DB load, no read caching. Redis fan-out is already the timeline index; post data should benefit from caching too.
- Store full posts in the fan-out ZSET: Memory waste — same post duplicated per follower. PostIds are cheap.

**Rationale**: The cache-aside pattern (check cache → miss → fetch → populate) is standard for read-heavy workloads. Having both Redis layers (fan-out ZSET for timeline index, key-value for post content) separates timeline indexing from content storage.

### Decision 4: Celebrity pull-on-read as optional step with ID-based cursor

**Chosen**: After getting fan-out postIds, query MongoDB for recent posts (last 24h) from users the current user follows who have `followersCount > CELEBRITY_THRESHOLD`. Filter by `id < celebrityCursor` when paginating. Merge with fan-out posts and sort by `createdAt` desc.

**Rationale**: Celebrity posts are NOT in the fan-out store (write-path Decision 5 skips fan-out for celebrities). They must be pulled on read. Uses ObjectId comparison for cursor since MongoDB ObjectId is naturally chronological — no need to resolve timestamp. The 24-hour window bounds the result size. If the user follows no celebrities, the query is skipped entirely.

### Decision 5: Post not found in MongoDB → silent skip

**Chosen**: If a postId exists in the fan-out ZSET but the post document is missing from MongoDB, silently exclude it from the response.

**Rationale**: This can happen if a post is soft-deleted or if there's eventual consistency lag. Showing an error or a placeholder is worse than omitting the post. The fan-out ZSET will eventually be trimmed past the missing entry. When `hasMore` is true but `paginatedPosts` is empty (all fetched posts were missing), `nextCursor` is safely set to `undefined` to avoid crashes.

### Decision 6: Everything in the existing feed module

**Chosen**: All read-path code lives in `src/modules/feed/`:
- `feed.types.ts` — `GetFeedQuery`, `FeedResponse` interfaces
- `feed.repo.ts` — `getPostsByIds`, `getCelebrityFollowees`, `getCelebrityPosts`
- `feed.service.ts` — `getFeed` function
- `feed.controller.ts` — `getFeed` controller
- `me.feed.routes.ts` — `GET /feed` route mounted at `/v1/me`

**Rationale**: The read path shares the `Post` data access layer with the write path. A separate `me` module would split related logic across two modules unnecessarily.

## Risks / Trade-offs

- **Redis feed cache TTL**: Cached posts could become stale if posts are edited. Mitigation: TTL of 3 hours (`FEED_CACHE_TTL_SECONDS`, configurable via env var). Edits are a future feature that can invalidate cache on write.
- **Celebrity pull query cost**: Querying MongoDB for recent celebrity posts on every feed read could be expensive for users following many celebrities. Mitigation: The 24-hour window and `take: 50` limit result size. Future: cache celebrity post lists separately.
- **Large ZSET memory**: Each user's fan-out ZSET stores up to 1000 postIds (trimmed by write-path worker). Mitigation: This is already handled by the fan-out worker's `ZREMRANGEBYRANK`.
- **No auth middleware**: The endpoint needs `userId`. Mitigation: For MVP, accept `userId` as a query parameter. Future: extract from JWT/session middleware.
- **Composite cursor format fragility**: Splitting on `_` assumes ObjectId never contains `_`. MongoDB ObjectIds are 24-char hex strings (0-9, a-f) — safe. But if the format ever changes, cursor parsing must be updated.