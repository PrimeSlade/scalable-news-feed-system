import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("./feed.service", () => ({
  createPost: vi.fn(),
  getFeed: vi.fn(),
}));

import * as feedService from "./feed.service";
import { createPost, getFeed } from "./feed.controller";

const mockPost = {
  id: "post-1",
  authorId: "user-1",
  content: "Hello",
  createdAt: new Date("2025-01-01T12:00:00Z"),
};

function mockReq(params: Record<string, unknown>) {
  if ("body" in params) {
    return { body: params.body, query: {} } as Parameters<typeof createPost>[0];
  }
  return { body: {}, query: params } as Parameters<typeof getFeed>[0];
}

function mockRes() {
  const res: Record<string, unknown> = {
    statusCode: 200,
    body: null,
  };
  res.status = vi.fn((code: number) => {
    res.statusCode = code;
    return res;
  });
  res.json = vi.fn((data: unknown) => {
    res.body = data;
    return res;
  });
  return res as unknown as Parameters<typeof getFeed>[1];
}

describe("feedController.createPost", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 201 with the created post", async () => {
    vi.mocked(feedService.createPost).mockResolvedValue(mockPost);
    const req = mockReq({ body: { content: "Hello", authorId: "user-1" } });
    const res = mockRes();

    await createPost(req, res);

    expect(feedService.createPost).toHaveBeenCalledWith({
      content: "Hello",
      authorId: "user-1",
    });
    expect(res.status).toHaveBeenCalledWith(201);
  });

  it("throws ValidationError when authorId is missing", async () => {
    const req = mockReq({ body: { content: "Hello" } });
    const res = mockRes();

    await expect(createPost(req, res)).rejects.toThrow("authorId is required");
  });
});

describe("feedController.getFeed", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 200 with paginated feed", async () => {
    vi.mocked(feedService.getFeed).mockResolvedValue({
      posts: [mockPost],
      hasMore: false,
    });
    const req = mockReq({ userId: "user-1" });
    const res = mockRes();

    await getFeed(req, res);

    expect(feedService.getFeed).toHaveBeenCalledWith(
      "user-1",
      undefined,
      undefined,
    );
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "success",
        data: { posts: [mockPost] },
        pagination: expect.objectContaining({ hasMore: false }),
      }),
    );
  });

  it("passes cursor and limit to service", async () => {
    vi.mocked(feedService.getFeed).mockResolvedValue({
      posts: [],
      hasMore: false,
    });
    const req = mockReq({
      userId: "user-1",
      cursor: "1680000000000_post-abc",
      limit: "10",
    });
    const res = mockRes();

    await getFeed(req, res);

    expect(feedService.getFeed).toHaveBeenCalledWith(
      "user-1",
      "1680000000000_post-abc",
      10,
    );
  });

  it("throws ValidationError when userId is missing", async () => {
    const req = mockReq({});
    const res = mockRes();

    await expect(getFeed(req, res)).rejects.toThrow(
      "userId query parameter is required",
    );
  });

  it("throws ValidationError when limit is not a positive number", async () => {
    const req = mockReq({ userId: "user-1", limit: "0" });
    const res = mockRes();

    await expect(getFeed(req, res)).rejects.toThrow(
      "limit must be a positive number",
    );
  });

  it("includes nextCursor in pagination when hasMore", async () => {
    vi.mocked(feedService.getFeed).mockResolvedValue({
      posts: [mockPost],
      hasMore: true,
      nextCursor: "1680000000000_post-abc",
    });
    const req = mockReq({ userId: "user-1" });
    const res = mockRes();

    await getFeed(req, res);

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        pagination: {
          limit: 1,
          hasMore: true,
          nextCursor: "1680000000000_post-abc",
        },
      }),
    );
  });
});
