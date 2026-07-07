# feed-read

## Purpose

Retrieves a user's precomputed feed via composite cursor-based pagination, hydrates full post content through cache-aside (Redis → MongoDB fallback), and optionally merges celebrity posts on read.

## ADDED Requirements

### Requirement: Retrieve feed with composite cursor pagination

The system SHALL return a user's feed as a cursor-paginated list of posts, ordered by `createdAt` descending (newest first). The cursor is a composite string `"timestamp_postId"` encoding both the oldest post's `createdAt` (Unix ms) and its `id`, used to paginate two data sources (Redis fan-out ZSET by timestamp, MongoDB celebrity pull by ObjectId).

#### Scenario: First page request (no cursor)

- **WHEN** a user sends `GET /v1/me/feed?userId={id}&limit=20` with no `cursor` parameter
- **THEN** the system queries Redis ZSET `{userId}` via `ZREVRANGE` for the 21 newest postIds (limit+1 for hasMore detection), and returns up to 20 posts

#### Scenario: Subsequent page request (with composite cursor)

- **WHEN** a user sends `GET /v1/me/feed?userId={id}&cursor=1680000000000_post-abc&limit=20`
- **THEN** the system parses the cursor into timestamp `1680000000000` and postId `post-abc`, queries Redis ZSET via `ZREVRANGEBYSCORE (1680000000000 -inf LIMIT 0 21` (exclusive timestamp), and queries MongoDB celebrity posts with `id < post-abc`

#### Scenario: Empty feed

- **WHEN** a user with no posts in their feed ZSET requests their feed
- **THEN** the system returns `200` with an empty `posts` array, `hasMore: false`, and no `nextCursor`

#### Scenario: Partial page at end of feed

- **WHEN** a user requests their feed and fewer than `limit` postIds remain in the ZSET
- **THEN** the system returns all remaining posts with `hasMore: false` and no `nextCursor`

#### Scenario: More pages available

- **WHEN** a user requests their feed and the system fetches more than `limit` posts (from fan-out ZSET or merged celebrity posts)
- **THEN** the system returns `limit` posts with `hasMore: true` and a `nextCursor` set to `"timestamp_postId"` of the oldest post in the returned page

### Requirement: Hydrate posts via cache-aside

The system SHALL batch-hydrate full post content by checking Redis feed cache first, then falling back to MongoDB for misses, and populating Redis for future reads.

#### Scenario: All posts in Redis feed cache

- **WHEN** the system has a list of postIds and all are found in Redis via `MGET post:{id}`
- **THEN** the system returns the hydrated posts without querying MongoDB

#### Scenario: Some posts missing from Redis feed cache

- **WHEN** the system has a list of postIds and some keys return nil from `MGET post:{id}`
- **THEN** the system queries MongoDB via `findMany({ id: { in: missingIds } })` for the missing posts, populates Redis via `SET post:{id} {data} EX {FEED_CACHE_TTL_SECONDS}` for each fetched post, and returns all posts sorted by `createdAt` descending

#### Scenario: Post not found in MongoDB

- **WHEN** a postId from the fan-out ZSET no longer exists in MongoDB (e.g., soft-deleted)
- **THEN** the system silently excludes that post from the response without error

### Requirement: Optional celebrity pull-on-read

The system SHALL merge recent posts from celebrities the user follows when those posts are not in the fan-out store (since fan-out was skipped for celebrities). Celebrity posts are paginated by ObjectId cursor (not timestamp) since MongoDB ObjectId is naturally chronological.

#### Scenario: User follows a celebrity

- **WHEN** a user requests their feed and follows one or more users with `followersCount > CELEBRITY_THRESHOLD`
- **THEN** the system queries MongoDB for recent posts (last 24 hours) from those celebrity users, filtered by `id < celebrityCursor` when a cursor is present, merges them with fan-out posts, sorts by `createdAt` descending, and returns the combined result

#### Scenario: No celebrities followed

- **WHEN** a user requests their feed and does not follow any celebrity users
- **THEN** the system skips the celebrity pull query entirely

#### Scenario: Celebrity has no recent posts

- **WHEN** a user requests their feed and follows celebrity users who have no posts in the last 24 hours
- **THEN** the celebrity pull returns no posts and the feed contains only fan-out posts

### Requirement: Response format

The system SHALL return a JSON response with status, data, and pagination metadata.

#### Scenario: Successful feed response

- **WHEN** a feed request completes successfully
- **THEN** the system returns `200` with:
  ```json
  {
    "status": "success",
    "data": {
      "posts": [{ "id": "...", "authorId": "...", "content": "...", "createdAt": "..." }]
    },
    "pagination": {
      "limit": 20,
      "hasMore": true,
      "nextCursor": "1680000000000_post-abc123"
    }
  }
  ```

#### Scenario: Empty page response

- **WHEN** a feed request returns no posts and `hasMore` is false
- **THEN** the system returns `200` with `pagination: { limit: 0, hasMore: false }` and no `nextCursor` field
