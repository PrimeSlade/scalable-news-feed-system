## 1. Prisma & config setup

- [x] 1.1 Regenerate Prisma client: `npx prisma generate`

## 2. Post creation module

- [x] 2.1 Define TypeScript interfaces for post request/response in `src/modules/post/post.types.ts`
- [x] 2.2 Implement `postService.createPost()` in `src/modules/post/post.service.ts`: validate content, save to MongoDB `posts` collection, check `User.followersCount` against `CELEBRITY_THRESHOLD`, enqueue `feed-generation` job with id `fan-out:{postId}` if under threshold
- [x] 2.3 Implement `postController.createPost()` in `src/modules/post/post.controller.ts`: extract input, call service, return `201` with `created()` helper
- [x] 2.4 Wire `POST /v1/posts` in `src/modules/post/post.routes.ts` with `asyncHandler`
- [x] 2.5 Add `CELEBRITY_THRESHOLD` env var with default `10000`

## 3. Feed fan-out worker

- [x] 3.1 Replace stub processor in `src/lib/queue.ts` with real fan-out logic: receive job, query `follows.findMany({ where: { followeeId: authorId } })`, extract follower IDs, ensure author ID is included for self-feed
- [x] 3.2 Build Redis pipeline: for each follower ID, `ZADD {followerId} {createdAt} {postId}` and `ZREMRANGEBYRANK {followerId} 0 -1001`

## 4. Wire Express app

- [x] 4.1 Mount `postRoutes` in `src/index.ts` at `/v1/posts`
- [x] 4.2 Mount `feedRoutes` in `src/index.ts` at `/v1` (placeholder, no endpoints yet)
- [x] 4.3 Wire `errorHandler` middleware from `src/middleware/error-handler.ts` in `src/index.ts`, fixing the missing `return` in the AppError branch
- [x] 4.4 Verify graceful shutdown sequence: HTTP server → queues → Prisma → Redis

## 5. Cleanup & verify

- [x] 5.1 Fill in `src/modules/feed/feed.routes.ts` as a placeholder router (no endpoints yet, export for wiring)
- [x] 5.2 Run `npm run format:check && npm run lint && npx tsc --noEmit` and fix all issues
- [x] 5.3 Manual smoke test: dev server starts, `POST /v1/posts` route responds, validation works, controller/service/error-handler execute correctly. MongoDB Atlas connectivity blocked from this network (IP whitelist / TLS), needs valid DATABASE_URL with network access for full end-to-end

## 6. Testing

- [x] 6.1 Install vitest, supertest, @vitest/coverage-v8, @types/supertest
- [x] 6.2 Configure vitest.config.ts and add test scripts to package.json
- [x] 6.3 Write unit tests: post.service.createPost (validation, Prisma calls, queue enqueue, celebrity skip)
- [x] 6.4 Write unit tests: post.controller.createPost (request handling, error propagation)
- [x] 6.5 Write unit tests: processFanOutJob worker (Redis pipeline, ZADD, guarded ZREMRANGEBYRANK)
- [x] 6.6 Write integration tests: POST /v1/posts full HTTP cycle (200, 400, 404, idempotent jobId, celebrity skip)
- [x] 6.7 Run `npm test` — 25 tests pass
