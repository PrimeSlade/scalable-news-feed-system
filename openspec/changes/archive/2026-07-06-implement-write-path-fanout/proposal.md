## Why

The feed system currently has infrastructure (Prisma, Redis, BullMQ) wired up but no application logic. Posts cannot be created and distributed to followers. This change implements the fan-out-on-write path -- when a user creates a post, it gets distributed to all their followers' Redis feeds via a BullMQ background worker.

## What Changes

- Add `POST /v1/posts` endpoint to create a post and trigger fan-out
- Save posts to MongoDB `posts` collection
- Enqueue a BullMQ job for each post, passing post data to the worker
- Implement the worker processor that queries followers from MongoDB and writes postIds into each follower's Redis sorted set
- Skip fan-out for users above a follower threshold (celebrities use pull model on read -- not in this change)
- Wire post and feed module routes into the Express app
- Wire the error handler middleware

## Capabilities

### New Capabilities
- `post-creation`: Create posts via REST API, persist to MongoDB, trigger fan-out job
- `feed-fanout`: BullMQ worker distributes postIds to followers' Redis sorted sets, with celebrity threshold skip

### Modified Capabilities
<!-- None -->

## Impact

- **New code**: `src/modules/post/` (controller, service, routes), `src/modules/feed/` (routes only for now)
- **Modified code**: `src/lib/queue.ts` (worker processor logic), `src/index.ts` (mount routes, error handler)
- **MongoDB**: writes to `posts` collection, reads from `follows` collection
- **Redis**: writes to per-user sorted sets (key: `{userId}`, score: timestamp, value: postId)
