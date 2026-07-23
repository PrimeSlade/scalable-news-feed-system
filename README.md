# Scalable News Feed System

A scalable news feed backend implementing the **fan-out-on-write** pattern with hybrid celebrity pull-on-read, built with Express, MongoDB, Redis, and BullMQ.

## Overview

This project implements a Twitter/X-style feed system with two paths:

- **Write path** -- `POST /v1/feed` creates a post, fans it out to followers' Redis feeds via a BullMQ worker
- **Read path** -- `GET /v1/me/feed` retrieves a user's feed with cursor-based pagination, hydrating posts via cache-aside (Redis -> MongoDB fallback)

### Hybrid feed model

| User type | Mechanism | Why |
| --- | --- | --- |
| Regular users (<10k followers) | Fan-out on write (push to Redis ZSET) | Fast reads, precomputed feed |
| Celebrities (>10k followers) | Pull on read (query MongoDB live) | Avoids millions of fan-out writes |

Both are merged into one paginated feed at read time.

## Architecture

### Write path (fan-out on write)

```mermaid
flowchart TD
    Client -->|POST /v1/feed| Server
    Server -->|save post| MongoDB[(MongoDB)]
    Server -->|check followersCount| UserCheck{followersCount<br/><= 10000?}
    UserCheck -->|Yes| BullMQ[BullMQ Queue]
    UserCheck -->|No - celebrity| Skip[Skip fan-out]
    BullMQ -->|deliver job| Worker
    Worker -->|get followers| GraphDB[(MongoDB follows)]
    Worker -->|ZADD feed:userId| RedisFanout[(Redis ZSET)]
    Worker -->|trim to 1000| RedisFanout
    Server -->|201 created| Client
```

### Read path (cache-aside + celebrity pull)

```mermaid
flowchart TD
    Client -->|GET /v1/me/feed| Server
    Server -->|get postIds| FanOut[(Redis ZSET)]
    FanOut -->|postIds| Server
    Server -->|hydrate posts| Cache[(Redis cache)]
    Cache -->|miss?| DB[(MongoDB)]
    DB -->|fetch + cache| Cache
    Server -->|celebrity posts 24h| DB
    Server -->|merge + sort + paginate| Client
```

> Detailed editable diagrams in `diagrams/` -- open any `.excalidraw` file at [excalidraw.com](https://excalidraw.com)

## Tech stack

- **Express 5** -- API server with OpenAPI/Swagger docs
- **MongoDB + Prisma** -- users, posts, follows collections
- **Redis (ioredis)** -- fan-out ZSET (per-user feed list) + feed cache (post content)
- **BullMQ** -- background job queue for fan-out worker
- **TypeScript** -- strict mode, CommonJS
- **Vitest** -- unit + integration tests
- **ESLint + Prettier + Husky** -- code quality and pre-commit hooks

## Getting started

### Prerequisites

- Node.js 20+
- MongoDB (Atlas or local)
- Redis (Upstash or local)

### Installation

```sh
git clone https://github.com/PrimeSlade/scalable-news-feed-system.git
cd scalable-news-feed-system
npm install
```

### Environment variables

Create a `.env` file in the root:

```env
DATABASE_URL="mongodb+srv://<user>:<pass>@<host>/<db>"
REDIS_URL="rediss://default:<password>@<host>:<port>"
PORT=3000
CELEBRITY_THRESHOLD=10000
FEED_CACHE_TTL_SECONDS=10800
NODE_ENV=development
AUTH_ACCESS_TOKEN_SECRET="replace-with-at-least-32-bytes"
AUTH_REFRESH_TOKEN_SECRET="replace-with-a-different-32-byte-secret"
AUTH_ALLOWED_ORIGINS="http://localhost:3000"
```

| Variable | Description | Default |
| --- | --- | --- |
| `DATABASE_URL` | MongoDB connection string | Required |
| `REDIS_URL` | Redis connection string | `redis://localhost:6379` |
| `PORT` | Server port | `3000` |
| `CELEBRITY_THRESHOLD` | Follower count above which fan-out is skipped | `10000` |
| `FEED_CACHE_TTL_SECONDS` | TTL for cached post content in Redis | `10800` (3 hours) |
| `NODE_ENV` | `production` hides error details, `test` skips `app.listen()` | `development` |
| `AUTH_ACCESS_TOKEN_SECRET` | HS256 access-token secret (32 bytes minimum) | Required outside tests |
| `AUTH_REFRESH_TOKEN_SECRET` | Separate HS256 refresh-token secret (32 bytes minimum) | Required outside tests |
| `AUTH_TOKEN_ISSUER` | Required JWT issuer | `scalable-news-feed-system` |
| `AUTH_TOKEN_AUDIENCE` | Required JWT audience | `scalable-news-feed-client` |
| `AUTH_ACCESS_TTL_SECONDS` | Access-token lifetime (60-3600 seconds) | `900` |
| `AUTH_REFRESH_TTL_SECONDS` | Refresh-session lifetime | `604800` (7 days) |
| `AUTH_BCRYPT_ROUNDS` | bcrypt work factor (10-15) | `12` |
| `AUTH_ALLOWED_ORIGINS` | Comma-separated exact browser origins for refresh/logout | `http://localhost:3000` outside production |
| `AUTH_COOKIE_SECURE` | Require HTTPS for the refresh cookie | `true` in production |

### Run

```sh
npx prisma generate    # generate Prisma client
npm run seed           # (optional) seed test data
npm run dev            # start dev server with hot reload
```

Server runs at `http://localhost:3000`. Swagger docs at `http://localhost:3000/api`.

## API

### Register and authenticate

```sh
curl -i -c cookies.txt -X POST http://localhost:3000/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{"username":"alice","displayName":"Alice","password":"correct horse battery staple"}'
```

Registration and login return an access token in `data.accessToken` and set a rotating,
HttpOnly refresh cookie. Use the access token as `Authorization: Bearer <token>` on protected
requests. Refresh and logout also require an `Origin` header matching
`AUTH_ALLOWED_ORIGINS`.

For one transition release, `authorId` in post bodies and `userId` in feed queries are
accepted but ignored. Token identity always wins, and both legacy fields are scheduled for
removal in the next release.

```sh
curl -b cookies.txt -c cookies.txt -X POST http://localhost:3000/v1/auth/refresh \
  -H "Origin: http://localhost:3000"

curl -H "Authorization: Bearer <access-token>" http://localhost:3000/v1/me
```

### Create a post

```sh
curl -X POST http://localhost:3000/v1/feed \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <access-token>" \
  -d '{"content":"Hello world"}'
```

Response (`201`):
```json
{
  "status": "success",
  "data": {
    "id": "507f1f77bcf86cd799439012",
    "authorId": "507f1f77bcf86cd799439002",
    "content": "Hello world",
    "createdAt": "2024-01-01T00:00:00.000Z"
  }
}
```

### Read feed

```sh
# Page 1
curl -H "Authorization: Bearer <access-token>" \
  "http://localhost:3000/v1/me/feed?limit=20"

# Page 2 (use nextCursor from page 1)
curl -H "Authorization: Bearer <access-token>" \
  "http://localhost:3000/v1/me/feed?limit=20&cursor=1704110400000"
```

Response (`200`):
```json
{
  "status": "success",
  "data": {
    "posts": [
      { "id": "...", "authorId": "...", "content": "...", "createdAt": "..." }
    ]
  },
  "pagination": {
    "limit": 20,
    "hasMore": true,
    "nextCursor": "1704110400000"
  }
}
```

### Health check

```sh
curl http://localhost:3000/health
# { "status": "ok" }
```

## Commands

```sh
npm run dev           # start dev server (tsx watch)
npm run build         # compile TypeScript to dist/
npm start             # run compiled output
npm run lint          # ESLint on src/
npm run format        # Prettier write on src/
npm run format:check  # Prettier check on src/ (CI)
npm test              # vitest run (unit + integration)
npm run test:watch    # vitest in watch mode
npm run test:coverage # vitest with coverage report
npm run seed          # seed database with test data
```

**CI check order (run before pushing):**

```sh
npm run format:check && npm run lint && npx tsc --noEmit && npm test
```

## Project structure

```
src/
├── index.ts                  # Express entry point
├── lib/
│   ├── prisma.ts             # PrismaClient singleton
│   ├── redis.ts              # Redis singleton
│   └── queue.ts              # BullMQ queue + fan-out worker
├── middleware/
│   └── error-handler.ts      # AppError-aware error handler
├── modules/
│   └── feed/
│       ├── feed.types.ts     # CreatePostInput, PostResponse, GetFeedQuery, FeedResponse
│       ├── feed.repo.ts      # Prisma queries (createPost, getPostsByIds, getCelebrityFollowees, ...)
│       ├── feed.service.ts   # Business logic (createPost + fan-out, getFeed + cache-aside)
│       ├── feed.controller.ts# Request validation, calls service
│       ├── feed.routes.ts    # POST /v1/feed
│       └── me.feed.routes.ts # GET /v1/me/feed
└── utils/
    ├── errors.ts             # AppError hierarchy (404, 400, 401, 409)
    └── response.ts           # success/created/paginated helpers
```

## How it works

### Write path (fan-out on write)

```mermaid
sequenceDiagram
    participant C as Client
    participant S as Server
    participant M as MongoDB
    participant Q as BullMQ
    participant W as Worker
    participant R as Redis

    C->>S: POST /v1/feed {authorId, content}
    S->>S: validate (non-empty, <= 280 chars)
    S->>M: save post
    M-->>S: post {id, createdAt}
    S->>M: get author followersCount
    M-->>S: followersCount
    alt followersCount <= 10000
        S->>Q: enqueue fan-out job {postId, authorId, createdAt}
        Q-->>S: ack
        S-->>C: 201 {post}
        Q->>W: deliver job
        W->>M: findMany follows {followeeId: authorId}
        M-->>W: followerIds[]
        loop each follower
            W->>R: ZADD feed:{followerId} {createdAt} {postId}
        end
        W->>R: ZREMRANGEBYRANK (trim to 1000)
    else followersCount > 10000 (celebrity)
        S-->>C: 201 {post}
        Note over S,R: Fan-out skipped -- pulled on read instead
    end
```

### Read path (cache-aside + celebrity pull)

```mermaid
sequenceDiagram
    participant C as Client
    participant S as Server
    participant R as Redis
    participant M as MongoDB

    C->>S: GET /v1/me/feed?userId &cursor &limit
    S->>R: ZREVRANGEBYSCORE feed:{userId} (cursor -inf LIMIT 21
    R-->>S: [postId1, postId2, ...]
    S->>R: MGET post:{id1} post:{id2} ...
    R-->>S: [cached, null, cached, ...]
    alt cache miss
        S->>M: findMany {id: {in: missingIds}}
        M-->>S: post documents
        S->>R: SET post:{id} {json} EX 10800
    end
    S->>M: getCelebrityFollowees {followerId: userId, followersCount > 10000}
    M-->>S: celebrityIds[]
    alt follows celebrities
        S->>M: findMany {authorId: in celebrityIds, createdAt >= 24h ago}
        M-->>S: celebrity posts
    end
    S->>S: merge + sort by createdAt desc + slice to limit
    S-->>C: 200 {posts, hasMore, nextCursor}
```

## Diagrams

Reference `diagrams/` for visual documentation:

```
diagrams/
├── architecture/
│   ├── ReadPath.excalidraw       # Read path component diagram
│   └── WritePath.excalidraw      # Write path fan-out architecture
└── sequence/
    ├── ReadPathSeqDiagram.excalidraw   # Read path UML sequence
    └── WritePathSeqDiagram.excalidraw  # Write path UML sequence
```

Open any `.excalidraw` file at [excalidraw.com](https://excalidraw.com).

## License

ISC
