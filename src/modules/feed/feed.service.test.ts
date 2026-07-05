import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../lib/prisma", () => ({
  prisma: {
    post: { create: vi.fn() },
    user: { findUnique: vi.fn() },
  },
}));

vi.mock("../../lib/queue", () => ({
  feedGenerationQueue: { add: vi.fn() },
}));

import { prisma } from "../../lib/prisma";
import { feedGenerationQueue } from "../../lib/queue";
import * as feedService from "./feed.service";

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
    vi.mocked(prisma.post.create).mockResolvedValue(mockPost);
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      followersCount: 50,
    } as never);
    vi.mocked(feedGenerationQueue.add).mockResolvedValue(undefined as never);

    const result = await feedService.createPost(validInput);

    expect(prisma.post.create).toHaveBeenCalledWith({
      data: { content: "Hello world", authorId: "507f1f77bcf86cd799439011" },
    });
    expect(result).toEqual({
      id: "507f1f77bcf86cd799439012",
      authorId: "507f1f77bcf86cd799439011",
      content: "Hello world",
      createdAt: mockPost.createdAt,
    });
  });

  it("trims whitespace from content", async () => {
    vi.mocked(prisma.post.create).mockResolvedValue(mockPost);
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      followersCount: 50,
    } as never);
    vi.mocked(feedGenerationQueue.add).mockResolvedValue(undefined as never);

    await feedService.createPost({
      content: "  Hello world  ",
      authorId: "507f1f77bcf86cd799439011",
    });

    expect(prisma.post.create).toHaveBeenCalledWith({
      data: { content: "Hello world", authorId: "507f1f77bcf86cd799439011" },
    });
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
    vi.mocked(prisma.post.create).mockResolvedValue(mockPost);
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      followersCount: 10001,
    } as never);
    vi.mocked(feedGenerationQueue.add).mockResolvedValue(undefined as never);

    const result = await feedService.createPost(validInput);

    expect(prisma.post.create).toHaveBeenCalled();
    expect(feedGenerationQueue.add).not.toHaveBeenCalled();
    expect(result.id).toBe("507f1f77bcf86cd799439012");
  });

  it("saves post but skips fan-out when author not found", async () => {
    vi.mocked(prisma.post.create).mockResolvedValue(mockPost);
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null);

    const result = await feedService.createPost(validInput);

    expect(prisma.post.create).toHaveBeenCalled();
    expect(feedGenerationQueue.add).not.toHaveBeenCalled();
    expect(result.id).toBe("507f1f77bcf86cd799439012");
  });

  it("saves exactly 280-character content", async () => {
    vi.mocked(prisma.post.create).mockResolvedValue(mockPost);
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      followersCount: 50,
    } as never);
    vi.mocked(feedGenerationQueue.add).mockResolvedValue(undefined as never);

    const content280 = "a".repeat(280);
    await feedService.createPost({
      content: content280,
      authorId: "507f1f77bcf86cd799439011",
    });

    expect(prisma.post.create).toHaveBeenCalled();
  });
});
