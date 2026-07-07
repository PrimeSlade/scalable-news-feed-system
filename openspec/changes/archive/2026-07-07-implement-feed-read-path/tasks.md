## 1. Types and module scaffolding

- [x] 1.1 Add `GetFeedQuery` (cursor as string, limit) and `FeedResponse` (posts, hasMore, nextCursor as string) interfaces to `src/modules/feed/feed.types.ts`

## 2. Data access layer

- [x] 2.1 Add `getPostsByIds(postIds: string[])` to `src/modules/feed/feed.repo.ts` that batch-fetches posts from MongoDB via `prisma.post.findMany({ where: { id: { in: postIds } } })`
- [x] 2.2 Add `getCelebrityFollowees(userId: string, threshold: number)` to query users the given user follows who have `followersCount > threshold` (single query with relational filter)
- [x] 2.3 Add `getCelebrityPosts(celebrityIds, since, cursor?)` to query recent celebrity posts with ID-based cursor pagination

## 3. Core service logic

- [x] 3.1 Add `getFeed(userId, cursor?, limit?)` to `src/modules/feed/feed.service.ts` that:
  - Parses composite cursor `"timestamp_postId"` into fanout timestamp and celebrity ObjectId
  - Queries Redis fan-out ZSET via `ZREVRANGEBYSCORE` with exclusive timestamp cursor
  - Fetches `limit + 1` entries for `hasMore` detection
  - Batch-checks Redis feed cache via `MGET post:{id}` for each postId
  - Collects missing IDs and fetches from MongoDB via `feedRepo.getPostsByIds`
  - Populates Redis feed cache via pipeline `SET post:{id} {JSON} EX {TTL}` with TTL of 3 hours
  - (Optional) Performs celebrity pull-on-read with ObjectId cursor if user follows any celebrities
  - Sorts merged posts by `createdAt` descending
  - Computes `hasMore` and composite `nextCursor` (guards against empty `paginatedPosts`)
  - Returns `{ posts, hasMore, nextCursor }`

## 4. Controller and routes

- [x] 4.1 Add `getFeed` to `src/modules/feed/feed.controller.ts` that validates `userId` and `limit` query params, passes cursor as string
- [x] 4.2 Create `src/modules/feed/me.feed.routes.ts` with `GET /feed` wired to `feedController.getFeed`
- [x] 4.3 Mount `meFeedRoutes` at `/v1/me` in `src/index.ts`

## 5. Tests

- [x] 5.1 Add unit tests in `src/modules/feed/feed.service.test.ts` for `getFeed` (mock Redis, Prisma)
- [x] 5.2 Add unit tests in `src/modules/feed/feed.controller.test.ts` for `getFeed` validation
- [x] 5.3 Add integration tests in `src/modules/feed/feed.integration.test.ts` for `GET /v1/me/feed`

## 6. Polish and verify

- [x] 6.1 Run `npx prisma generate` if schema changed
- [x] 6.2 Run `npm run format:check && npm run lint && npx tsc --noEmit && npm test`
