## Why

The write path (fan-out) is complete — posts are persisted and fanned out to followers' Redis feeds. But there's no way for users to read their feed. This implements the `GET /v1/me/feed` endpoint to close the loop and make the feed system usable end-to-end.

## What Changes

- Add `GET /v1/me/feed` endpoint with composite cursor-based pagination
- Query Redis fan-out ZSET to retrieve precomputed postIds
- Hydrate full post content via cache-aside (Redis feed cache → MongoDB fallback)
- Merge celebrity posts via pull-on-read for users following celebrities (>10k followers)
- Return paginated response with `posts`, `hasMore`, and `nextCursor` (composite `"timestamp_postId"`)

## Capabilities

### New Capabilities

- `feed-read`: Retrieve a user's feed via composite cursor-based pagination, hydrate posts from cache or MongoDB, and optionally merge celebrity posts on read.

### Modified Capabilities

_None._ The existing write path and fan-out specs are unchanged.

## Impact

- **New route**: `GET /v1/me/feed` via `src/modules/feed/me.feed.routes.ts` mounted at `/v1/me`
- **New controller/service/repo functions**: `getFeed` in feed module
- **New types**: `GetFeedQuery`, `FeedResponse` in `src/modules/feed/feed.types.ts`
- **Redis reads**: `ZREVRANGEBYSCORE` on fan-out ZSET, `MGET`/`MSET` on feed cache
- **MongoDB reads**: `findMany` on posts collection for cache misses + celebrity pull (ID-based cursor)
- **No new dependencies** — uses existing Redis, MongoDB, and Express
