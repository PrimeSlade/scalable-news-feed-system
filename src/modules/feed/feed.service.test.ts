import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../lib/queue", () => ({
  feedGenerationQueue: { add: vi.fn() },
}));

vi.mock("../../lib/redis", () => ({
  getRedis: vi.fn(),
}));

vi.mock("./feed.repo", () => ({
  createPost: vi.fn(),
  getFollowersCount: vi.fn(),
  getPostsByIds: vi.fn(),
  getCelebrityFollowees: vi.fn(),
  getCelebrityPosts: vi.fn(),
}));

import { feedGenerationQueue } from "../../lib/queue";
import { getRedis } from "../../lib/redis";
import * as feedRepo from "./feed.repo";
import * as feedService from "./feed.service";

function mockRedis(overrides: Record<string, unknown> = {}) {
  return {
    zrevrangebyscore: vi.fn().mockResolvedValue([]),
    zrevrange: vi.fn().mockResolvedValue([]),
    zmscore: vi.fn().mockResolvedValue([]),
    mget: vi.fn().mockResolvedValue([]),
    pipeline: vi.fn(() => ({
      set: vi.fn(),
      exec: vi.fn().mockResolvedValue([]),
    })),
    ...overrides,
  };
}

describe("feedService.createPost", () => {
  const validInput = {
    content: "Hello world",
    authorId: "507f1f77bcf86cd799439011",
  };

  const mockPost = {
    id: "507f1f77bcf86cd799439012",
    authorId: "507f1f77bcf86cd799439011",
    content: "Hello world",
    createdAt: new Date("2024-01-01"),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates a post and enqueues fan-out for a non-celebrity user", async () => {
    vi.mocked(feedRepo.createPost).mockResolvedValue(mockPost);
    vi.mocked(feedRepo.getFollowersCount).mockResolvedValue(50);
    vi.mocked(feedGenerationQueue.add).mockResolvedValue(undefined as never);

    const result = await feedService.createPost(validInput);

    expect(feedRepo.createPost).toHaveBeenCalledWith(
      "Hello world",
      "507f1f77bcf86cd799439011",
    );
    expect(result).toEqual(mockPost);
  });

  it("trims whitespace from content before saving", async () => {
    vi.mocked(feedRepo.createPost).mockResolvedValue(mockPost);
    vi.mocked(feedRepo.getFollowersCount).mockResolvedValue(50);
    vi.mocked(feedGenerationQueue.add).mockResolvedValue(undefined as never);

    await feedService.createPost({
      content: "  Hello world  ",
      authorId: "507f1f77bcf86cd799439011",
    });

    expect(feedRepo.createPost).toHaveBeenCalledWith(
      "Hello world",
      "507f1f77bcf86cd799439011",
    );
  });

  it("throws ValidationError when content is empty string", async () => {
    await expect(
      feedService.createPost({
        content: "",
        authorId: "507f1f77bcf86cd799439011",
      }),
    ).rejects.toThrow("Content must not be empty");
  });

  it("throws ValidationError when content is only whitespace", async () => {
    await expect(
      feedService.createPost({
        content: "   ",
        authorId: "507f1f77bcf86cd799439011",
      }),
    ).rejects.toThrow("Content must not be empty");
  });

  it("throws ValidationError when content exceeds 280 characters", async () => {
    const longContent = "a".repeat(281);
    await expect(
      feedService.createPost({
        content: longContent,
        authorId: "507f1f77bcf86cd799439011",
      }),
    ).rejects.toThrow("Content must be 280 characters or less");
  });

  it("saves post but skips fan-out for celebrity users", async () => {
    vi.mocked(feedRepo.createPost).mockResolvedValue(mockPost);
    vi.mocked(feedRepo.getFollowersCount).mockResolvedValue(10001);
    vi.mocked(feedGenerationQueue.add).mockResolvedValue(undefined as never);

    const result = await feedService.createPost(validInput);

    expect(feedRepo.createPost).toHaveBeenCalled();
    expect(feedGenerationQueue.add).not.toHaveBeenCalled();
    expect(result.id).toBe("507f1f77bcf86cd799439012");
  });

  it("saves post but skips fan-out when author not found", async () => {
    vi.mocked(feedRepo.createPost).mockResolvedValue(mockPost);
    vi.mocked(feedRepo.getFollowersCount).mockResolvedValue(null);

    const result = await feedService.createPost(validInput);

    expect(feedRepo.createPost).toHaveBeenCalled();
    expect(feedGenerationQueue.add).not.toHaveBeenCalled();
    expect(result.id).toBe("507f1f77bcf86cd799439012");
  });

  it("saves exactly 280-character content", async () => {
    vi.mocked(feedRepo.createPost).mockResolvedValue(mockPost);
    vi.mocked(feedRepo.getFollowersCount).mockResolvedValue(50);
    vi.mocked(feedGenerationQueue.add).mockResolvedValue(undefined as never);

    const content280 = "a".repeat(280);
    await feedService.createPost({
      content: content280,
      authorId: "507f1f77bcf86cd799439011",
    });

    expect(feedRepo.createPost).toHaveBeenCalled();
  });
});

describe("feedService.getFeed", () => {
  const mockPost = {
    id: "post-1",
    authorId: "user-1",
    content: "Hello",
    createdAt: new Date("2025-01-01T12:00:00Z"),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns empty feed for user with no posts", async () => {
    vi.mocked(getRedis).mockReturnValue(mockRedis() as never);
    vi.mocked(feedRepo.getCelebrityFollowees).mockResolvedValue([]);

    const result = await feedService.getFeed("user-x");

    expect(result).toEqual({
      posts: [],
      hasMore: false,
      nextCursor: undefined,
    });
  });

  it("returns paginated feed with cached posts", async () => {
    vi.mocked(getRedis).mockReturnValue(
      mockRedis({
        zrevrange: vi
          .fn()
          .mockResolvedValue([
            "post-1",
            mockPost.createdAt.getTime().toString(),
          ]),
        mget: vi.fn().mockResolvedValue([JSON.stringify(mockPost)]),
      }) as never,
    );
    vi.mocked(feedRepo.getCelebrityFollowees).mockResolvedValue([]);

    const result = await feedService.getFeed("user-1");

    expect(result.posts).toHaveLength(1);
    expect(result.posts[0]).toEqual(mockPost);
  });

  it("uses cursor for subsequent pages", async () => {
    const cursor = "1680000000000";

    vi.mocked(getRedis).mockReturnValue(
      mockRedis({
        zrevrangebyscore: vi.fn().mockResolvedValue([]),
      }) as never,
    );
    vi.mocked(feedRepo.getCelebrityFollowees).mockResolvedValue([]);

    await feedService.getFeed("user-1", cursor);

    expect(getRedis().zrevrangebyscore).toHaveBeenCalledWith(
      "feed:user-1",
      "(1680000000000",
      "-inf",
      "WITHSCORES",
      "LIMIT",
      0,
      21,
    );
  });

  it("caps limit at MAX_LIMIT (100)", async () => {
    vi.mocked(getRedis).mockReturnValue(mockRedis() as never);
    vi.mocked(feedRepo.getCelebrityFollowees).mockResolvedValue([]);

    await feedService.getFeed("user-1", undefined, 200);

    expect(getRedis().zrevrange).toHaveBeenCalledWith(
      "feed:user-1",
      0,
      100,
      "WITHSCORES",
    );
  });

  it("fetches missing posts from MongoDB on cache miss", async () => {
    vi.mocked(getRedis).mockReturnValue(
      mockRedis({
        zrevrange: vi.fn().mockResolvedValue(["post-1", "1700000000000"]),
        mget: vi.fn().mockResolvedValue([null]),
      }) as never,
    );
    vi.mocked(feedRepo.getCelebrityFollowees).mockResolvedValue([]);
    vi.mocked(feedRepo.getPostsByIds).mockResolvedValue([mockPost]);

    const result = await feedService.getFeed("user-1");

    expect(feedRepo.getPostsByIds).toHaveBeenCalledWith(["post-1"]);
    expect(result.posts).toHaveLength(1);
  });

  it("populates Redis cache after DB fetch", async () => {
    const setFn = vi.fn();
    const pipelineExec = vi.fn().mockResolvedValue([]);
    const pipeline = vi.fn(() => ({ set: setFn, exec: pipelineExec }));

    vi.mocked(getRedis).mockReturnValue(
      mockRedis({
        zrevrange: vi.fn().mockResolvedValue(["post-1", "1700000000000"]),
        mget: vi.fn().mockResolvedValue([null]),
        pipeline,
      }) as never,
    );
    vi.mocked(feedRepo.getCelebrityFollowees).mockResolvedValue([]);
    vi.mocked(feedRepo.getPostsByIds).mockResolvedValue([mockPost]);

    await feedService.getFeed("user-1");

    expect(setFn).toHaveBeenCalledWith(
      "post:post-1",
      JSON.stringify(mockPost),
      "EX",
      expect.any(Number),
    );
    expect(pipelineExec).toHaveBeenCalled();
  });

  it("merges celebrity posts with fan-out posts", async () => {
    const fanOutPost = {
      ...mockPost,
      id: "post-1",
      createdAt: new Date("2025-01-01T12:00:00Z"),
    };
    const celebPost = {
      ...mockPost,
      id: "post-2",
      authorId: "celebrity-1",
      createdAt: new Date("2025-01-01T11:00:00Z"),
    };

    vi.mocked(getRedis).mockReturnValue(
      mockRedis({
        zrevrange: vi
          .fn()
          .mockResolvedValue([
            "post-1",
            fanOutPost.createdAt.getTime().toString(),
          ]),
        mget: vi.fn().mockResolvedValue([JSON.stringify(fanOutPost)]),
      }) as never,
    );
    vi.mocked(feedRepo.getCelebrityFollowees).mockResolvedValue([
      "celebrity-1",
    ]);
    vi.mocked(feedRepo.getCelebrityPosts).mockResolvedValue([celebPost]);

    const result = await feedService.getFeed("user-1");

    expect(result.posts).toHaveLength(2);
    expect(result.posts[0]!.id).toBe("post-1");
    expect(result.posts[1]!.id).toBe("post-2");
  });

  it("skips celebrity pull when user follows no celebrities", async () => {
    vi.mocked(getRedis).mockReturnValue(
      mockRedis({
        zrevrange: vi
          .fn()
          .mockResolvedValue([
            "post-1",
            mockPost.createdAt.getTime().toString(),
          ]),
        mget: vi.fn().mockResolvedValue([JSON.stringify(mockPost)]),
      }) as never,
    );
    vi.mocked(feedRepo.getCelebrityFollowees).mockResolvedValue([]);

    await feedService.getFeed("user-1");

    expect(feedRepo.getCelebrityPosts).not.toHaveBeenCalled();
  });

  it("computes nextCursor from oldest post when hasMore", async () => {
    const newer = {
      ...mockPost,
      id: "post-1",
      createdAt: new Date("2025-01-01T12:00:00Z"),
    };
    const older = {
      ...mockPost,
      id: "post-2",
      createdAt: new Date("2025-01-01T10:00:00Z"),
    };

    vi.mocked(getRedis).mockReturnValue(
      mockRedis({
        zrevrange: vi
          .fn()
          .mockResolvedValue([
            "post-1",
            newer.createdAt.getTime().toString(),
            "post-2",
            older.createdAt.getTime().toString(),
          ]),
        mget: vi
          .fn()
          .mockResolvedValue([JSON.stringify(newer), JSON.stringify(older)]),
      }) as never,
    );
    vi.mocked(feedRepo.getCelebrityFollowees).mockResolvedValue([]);

    const result = await feedService.getFeed("user-1", undefined, 1);

    expect(result.hasMore).toBe(true);
    expect(result.nextCursor).toBe(`${newer.createdAt.getTime()}`);
  });

  it("round-trips composite cursor: build then parse yields same values", async () => {
    vi.mocked(getRedis).mockReturnValue(
      mockRedis({
        zrevrangebyscore: vi.fn().mockResolvedValue([]),
      }) as never,
    );
    vi.mocked(feedRepo.getCelebrityFollowees).mockResolvedValue([]);
    vi.mocked(feedRepo.getCelebrityPosts).mockResolvedValue([]);

    const cursor = "1700000000000";
    await feedService.getFeed("user-1", cursor);

    expect(getRedis().zrevrangebyscore).toHaveBeenCalledWith(
      "feed:user-1",
      "(1700000000000",
      "-inf",
      "WITHSCORES",
      "LIMIT",
      0,
      21,
    );
  });

  it("silently skips posts not found in MongoDB", async () => {
    vi.mocked(getRedis).mockReturnValue(
      mockRedis({
        zrevrange: vi.fn().mockResolvedValue(["deleted-post", "1700000000000"]),
        mget: vi.fn().mockResolvedValue([null]),
      }) as never,
    );
    vi.mocked(feedRepo.getCelebrityFollowees).mockResolvedValue([]);
    vi.mocked(feedRepo.getPostsByIds).mockResolvedValue([]);

    const result = await feedService.getFeed("user-1");

    expect(result.posts).toHaveLength(0);
    expect(result.hasMore).toBe(false);
  });

  it("handles invalid cursor gracefully (returns first page)", async () => {
    vi.mocked(getRedis).mockReturnValue(
      mockRedis({
        zrevrange: vi.fn().mockResolvedValue([]),
      }) as never,
    );
    vi.mocked(feedRepo.getCelebrityFollowees).mockResolvedValue([]);

    const result = await feedService.getFeed("user-1", "not-a-valid-cursor");

    expect(getRedis().zrevrange).toHaveBeenCalled();
    expect(getRedis().zrevrangebyscore).not.toHaveBeenCalled();
    expect(result.posts).toHaveLength(0);
  });

  it("returns undefined nextCursor when paginatedPosts is empty but hasMore is true", async () => {
    vi.mocked(getRedis).mockReturnValue(
      mockRedis({
        zrevrange: vi
          .fn()
          .mockResolvedValue([
            "deleted-1",
            "1700000000000",
            "deleted-2",
            "1700000000001",
            ...Array.from({ length: 19 }, (_, i) => [
              `deleted-${i + 3}`,
              `17000000000${i + 2}`,
            ]).flat(),
          ]),
        mget: vi.fn().mockResolvedValue(Array(21).fill(null)),
      }) as never,
    );
    vi.mocked(feedRepo.getCelebrityFollowees).mockResolvedValue([]);
    vi.mocked(feedRepo.getPostsByIds).mockResolvedValue([]);

    const result = await feedService.getFeed("user-1");

    expect(result.hasMore).toBe(true);
    expect(result.nextCursor).toBeUndefined();
  });

  it("calls getCelebrityPosts without cursor (24h window only)", async () => {
    vi.mocked(getRedis).mockReturnValue(
      mockRedis({
        zrevrangebyscore: vi.fn().mockResolvedValue([]),
      }) as never,
    );
    vi.mocked(feedRepo.getCelebrityFollowees).mockResolvedValue(["celeb-1"]);
    vi.mocked(feedRepo.getCelebrityPosts).mockResolvedValue([]);

    await feedService.getFeed("user-1", "1700000000000");

    expect(feedRepo.getCelebrityPosts).toHaveBeenCalledWith(
      ["celeb-1"],
      expect.any(Date),
    );
  });
});
