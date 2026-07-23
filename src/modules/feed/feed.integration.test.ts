import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";

vi.mock("../../lib/prisma", () => ({
  prisma: {
    post: { create: vi.fn(), findMany: vi.fn() },
    user: { findUnique: vi.fn(), findMany: vi.fn() },
    follow: { findMany: vi.fn() },
    $disconnect: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock("../../lib/queue", () => ({
  feedGenerationQueue: { add: vi.fn() },
  feedGenerationWorker: {},
  closeQueues: vi.fn(),
  shutdownQueues: vi.fn(),
}));

vi.mock("../../lib/redis", () => ({
  getRedis: vi.fn(() => ({
    zrevrangebyscore: vi.fn().mockResolvedValue([]),
    zrevrange: vi.fn().mockResolvedValue([]),
    zmscore: vi.fn().mockResolvedValue([]),
    mget: vi.fn().mockResolvedValue([]),
    pipeline: vi.fn(() => ({
      set: vi.fn(),
      exec: vi.fn().mockResolvedValue([]),
    })),
    on: vi.fn(),
  })),
  disconnectRedis: vi.fn(),
}));

import { prisma } from "../../lib/prisma";
import { feedGenerationQueue } from "../../lib/queue";
import app from "../../index";
import { issueAccessToken } from "../auth/token.service";

const authenticatedUserId = "507f1f77bcf86cd799439011";
const authorization = `Bearer ${issueAccessToken(authenticatedUserId)}`;

describe("POST /v1/feed", () => {
  const mockPost = {
    id: "507f1f77bcf86cd799439012",
    authorId: "507f1f77bcf86cd799439011",
    content: "Hello world",
    createdAt: new Date("2024-01-01"),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates a post and returns 201", async () => {
    vi.mocked(prisma.post.create).mockResolvedValue(mockPost);
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      followersCount: 50,
    } as never);
    vi.mocked(feedGenerationQueue.add).mockResolvedValue(undefined as never);

    const res = await request(app)
      .post("/v1/feed")
      .set("Authorization", authorization)
      .send({ content: "Hello world", authorId: "507f1f77bcf86cd799439011" })
      .expect(201);

    expect(res.body).toEqual({
      status: "success",
      data: {
        id: "507f1f77bcf86cd799439012",
        authorId: "507f1f77bcf86cd799439011",
        content: "Hello world",
        createdAt: mockPost.createdAt.toISOString(),
      },
    });
  });

  it("returns 400 when content is empty", async () => {
    const res = await request(app)
      .post("/v1/feed")
      .set("Authorization", authorization)
      .send({ content: "", authorId: "507f1f77bcf86cd799439011" })
      .expect(400);

    expect(res.body).toEqual({
      status: "error",
      message: "Content must not be empty",
    });
  });

  it("returns 401 when access authentication is missing", async () => {
    const res = await request(app)
      .post("/v1/feed")
      .send({ content: "Hello" })
      .expect(401);

    expect(res.body).toEqual({
      status: "error",
      message: "Unauthorized",
    });
  });

  it("returns 400 when content exceeds 280 characters", async () => {
    const longContent = "a".repeat(281);

    const res = await request(app)
      .post("/v1/feed")
      .set("Authorization", authorization)
      .send({ content: longContent, authorId: "507f1f77bcf86cd799439011" })
      .expect(400);

    expect(res.body.status).toBe("error");
    expect(res.body.message).toContain("280");
  });

  it("returns 404 for unknown routes", async () => {
    const res = await request(app).get("/v1/unknown").expect(404);

    expect(res.body).toEqual({ error: "Not found" });
  });

  it("returns 200 for health check", async () => {
    const res = await request(app).get("/health").expect(200);

    expect(res.body).toEqual({ status: "ok" });
  });

  it("enqueues fan-out job with correct jobId for idempotency", async () => {
    vi.mocked(prisma.post.create).mockResolvedValue(mockPost);
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      followersCount: 50,
    } as never);
    vi.mocked(feedGenerationQueue.add).mockResolvedValue(undefined as never);

    await request(app)
      .post("/v1/feed")
      .set("Authorization", authorization)
      .send({ content: "Test", authorId: "507f1f77bcf86cd799439011" })
      .expect(201);

    expect(feedGenerationQueue.add).toHaveBeenCalledWith(
      "fan-out",
      expect.objectContaining({ postId: "507f1f77bcf86cd799439012" }),
      { jobId: "fan-out-507f1f77bcf86cd799439012" },
    );
  });

  it("skips fan-out for celebrity users", async () => {
    vi.mocked(prisma.post.create).mockResolvedValue(mockPost);
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      followersCount: 10001,
    } as never);
    vi.mocked(feedGenerationQueue.add).mockResolvedValue(undefined as never);

    await request(app)
      .post("/v1/feed")
      .set("Authorization", authorization)
      .send({ content: "Test", authorId: "507f1f77bcf86cd799439011" })
      .expect(201);

    expect(feedGenerationQueue.add).not.toHaveBeenCalled();
  });
});

describe("GET /v1/me/feed", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.follow.findMany).mockResolvedValue([]);
  });

  it("returns 401 when feed authentication is missing", async () => {
    const res = await request(app).get("/v1/me/feed").expect(401);

    expect(res.body).toEqual({
      status: "error",
      message: "Unauthorized",
    });
  });

  it("returns 400 for invalid limit", async () => {
    const res = await request(app)
      .get("/v1/me/feed")
      .set("Authorization", authorization)
      .query({ userId: "user-1", limit: "0" })
      .expect(400);

    expect(res.body).toEqual({
      status: "error",
      message: "limit must be a positive number",
    });
  });

  it("returns 200 with empty paginated feed when no posts", async () => {
    const res = await request(app)
      .get("/v1/me/feed")
      .set("Authorization", authorization)
      .query({ userId: "user-1" })
      .expect(200);

    expect(res.body.status).toBe("success");
    expect(res.body.data.posts).toEqual([]);
    expect(res.body.pagination).toEqual({
      limit: 0,
      hasMore: false,
    });
  });
});
