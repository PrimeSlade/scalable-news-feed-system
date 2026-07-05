import { describe, it, expect, vi, beforeEach } from "vitest";
import { ValidationError } from "../../utils/errors";

vi.mock("./feed.service", () => ({
  createPost: vi.fn(),
}));

import * as feedService from "./feed.service";
import { createPost } from "./feed.controller";

describe("feedController.createPost", () => {
  const mockPost = {
    id: "507f1f77bcf86cd799439012",
    authorId: "507f1f77bcf86cd799439011",
    content: "Hello",
    createdAt: new Date("2024-01-01"),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  function mockReq(body: Record<string, unknown>) {
    return { body } as Parameters<typeof createPost>[0];
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
    return res as unknown as Parameters<typeof createPost>[1];
  }

  it("returns 201 with the created post", async () => {
    vi.mocked(feedService.createPost).mockResolvedValue(mockPost);
    const req = mockReq({
      content: "Hello",
      authorId: "507f1f77bcf86cd799439011",
    });
    const res = mockRes();

    await createPost(req, res);

    expect(feedService.createPost).toHaveBeenCalledWith({
      content: "Hello",
      authorId: "507f1f77bcf86cd799439011",
    });
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith({
      status: "success",
      data: mockPost,
    });
  });

  it("throws ValidationError when authorId is missing", async () => {
    const req = mockReq({ content: "Hello" });
    const res = mockRes();

    await expect(createPost(req, res)).rejects.toThrow("authorId is required");
    expect(feedService.createPost).not.toHaveBeenCalled();
  });

  it("propagates ValidationError from service", async () => {
    vi.mocked(feedService.createPost).mockRejectedValue(
      new ValidationError("Content must not be empty"),
    );
    const req = mockReq({ content: "", authorId: "507f1f77bcf86cd799439011" });
    const res = mockRes();

    await expect(createPost(req, res)).rejects.toThrow(
      "Content must not be empty",
    );
  });
});
