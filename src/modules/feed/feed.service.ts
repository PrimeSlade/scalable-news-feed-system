import { feedGenerationQueue } from "../../lib/queue";
import { ValidationError } from "../../utils/errors";
import { CreatePostInput, PostResponse, FeedResponse } from "./feed.types";
import * as feedRepo from "./feed.repo";
import { getRedis } from "../../lib/redis";

const CELEBRITY_THRESHOLD = Number(process.env.CELEBRITY_THRESHOLD) || 10000;

const MAX_CONTENT_LENGTH = 280;

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

const FEED_CACHE_TTL = Number(process.env.FEED_CACHE_TTL_SECONDS) || 10800;

export async function createPost(
  input: CreatePostInput,
): Promise<PostResponse> {
  const { content, authorId } = input;

  if (!content || content.trim().length === 0) {
    throw new ValidationError("Content must not be empty");
  }

  if (content.length > MAX_CONTENT_LENGTH) {
    throw new ValidationError(
      `Content must be ${MAX_CONTENT_LENGTH} characters or less`,
    );
  }

  const post = await feedRepo.createPost(content.trim(), authorId);

  const followersCount = await feedRepo.getFollowersCount(authorId);

  if (followersCount !== null && followersCount <= CELEBRITY_THRESHOLD) {
    await feedGenerationQueue.add(
      "fan-out",
      {
        postId: post.id,
        authorId: post.authorId,
        createdAt: post.createdAt.getTime(),
      },
      { jobId: `fan-out-${post.id}` },
    );
  }

  return post;
}

export async function getFeed(
  userId: string,
  cursor?: string,
  limit?: number,
): Promise<FeedResponse> {
  const effectiveLimit = Math.min(limit ?? DEFAULT_LIMIT, MAX_LIMIT);

  const redis = getRedis();

  const { fanoutCursor, celebrityCursor } = parseCursor(cursor);

  const postIdsWithScores = await getPostIdsFromFanOut(
    redis,
    userId,
    fanoutCursor,
    effectiveLimit,
  );

  const postIds = postIdsWithScores.map((e) => e.id);

  const celebrities = await feedRepo.getCelebrityFollowees(
    userId,
    CELEBRITY_THRESHOLD,
  );

  const posts = await hydratePosts(redis, postIds);

  let celebrityPosts: PostResponse[] = [];
  if (celebrities.length > 0) {
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    celebrityPosts = await feedRepo.getCelebrityPosts(
      celebrities,
      twentyFourHoursAgo,
      celebrityCursor,
    );
  }

  const allPosts = [...posts, ...celebrityPosts];

  allPosts.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

  const paginatedPosts = allPosts.slice(0, effectiveLimit);
  const hasMore =
    postIdsWithScores.length > effectiveLimit ||
    allPosts.length > effectiveLimit;
  const lastPost = paginatedPosts[paginatedPosts.length - 1];
  const nextCursor = hasMore && lastPost ? buildCursor(lastPost) : undefined;

  return {
    posts: paginatedPosts,
    hasMore,
    nextCursor,
  };
}

function parseCursor(cursor?: string): {
  fanoutCursor?: number;
  celebrityCursor?: string;
} {
  if (!cursor) return {};
  const parts = cursor.split("_");
  const ts = parts[0] ? Number(parts[0]) : undefined;
  if (ts === undefined || isNaN(ts)) return {};
  return {
    fanoutCursor: ts,
    celebrityCursor: parts[1] || undefined,
  };
}

function buildCursor(post: PostResponse): string {
  return `${post.createdAt.getTime()}_${post.id}`;
}

async function getPostIdsFromFanOut(
  redis: ReturnType<typeof getRedis>,
  userId: string,
  cursor: number | undefined,
  limit: number,
): Promise<{ id: string; score: number }[]> {
  if (cursor !== undefined) {
    const raw = await redis.zrevrangebyscore(
      `feed:${userId}`,
      "(" + cursor,
      "-inf",
      "WITHSCORES",
      "LIMIT",
      0,
      limit + 1,
    );
    return parseZrangeWithScores(raw as string[]);
  }

  const raw = await redis.zrevrange(`feed:${userId}`, 0, limit, "WITHSCORES");
  return parseZrangeWithScores(raw as string[]);
}

function parseZrangeWithScores(raw: string[]): { id: string; score: number }[] {
  console.log(raw);
  const entries: { id: string; score: number }[] = [];
  for (let i = 0; i < raw.length; i += 2) {
    entries.push({ id: raw[i]!, score: Number(raw[i + 1]) });
  }
  return entries;
}

async function hydratePosts(
  redis: ReturnType<typeof getRedis>,
  postIds: string[],
): Promise<PostResponse[]> {
  if (postIds.length === 0) return [];

  const cacheKeys = postIds.map((id) => `post:${id}`);
  const cached = await redis.mget(...cacheKeys);

  const posts: PostResponse[] = [];
  const missingIds: string[] = [];

  for (let i = 0; i < postIds.length; i++) {
    const raw = cached[i];
    if (raw) {
      const parsed = JSON.parse(raw) as PostResponse;
      parsed.createdAt = new Date(parsed.createdAt);
      posts.push(parsed);
    } else {
      missingIds.push(postIds[i]!);
    }
  }

  if (missingIds.length > 0) {
    const dbPosts = await feedRepo.getPostsByIds(missingIds);

    if (dbPosts.length > 0) {
      const pipeline = redis.pipeline();
      for (const post of dbPosts) {
        pipeline.set(
          `post:${post.id}`,
          JSON.stringify(post),
          "EX",
          FEED_CACHE_TTL,
        );
      }
      await pipeline.exec();
    }

    posts.push(...dbPosts);
  }

  return posts;
}
