import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { errorHandler } from "../../middleware/error-handler";
import { issueAccessToken } from "../auth/token.service";

vi.mock("./feed.service", () => ({
  createPost: vi.fn(),
  getFeed: vi.fn(),
}));

import * as feedService from "./feed.service";
import feedRoutes from "./feed.routes";
import meFeedRoutes from "./me.feed.routes";

const app = express();
app.use(express.json());
app.use("/v1/feed", feedRoutes);
app.use("/v1/me", meFeedRoutes);
app.use(errorHandler);

describe("authenticated feed routes", () => {
  beforeEach(() => vi.clearAllMocks());

  it("uses token identity for post creation and ignores authorId", async () => {
    vi.mocked(feedService.createPost).mockResolvedValue({
      id: "post-1",
      authorId: "user-a",
      content: "Hello",
      createdAt: new Date("2026-01-01"),
    });

    await request(app)
      .post("/v1/feed")
      .set("Authorization", `Bearer ${issueAccessToken("user-a")}`)
      .send({ content: "Hello", authorId: "user-b" })
      .expect(201);

    expect(feedService.createPost).toHaveBeenCalledWith({
      content: "Hello",
      authorId: "user-a",
    });
  });

  it("uses token identity for feed reads and ignores userId", async () => {
    vi.mocked(feedService.getFeed).mockResolvedValue({
      posts: [],
      hasMore: false,
    });

    await request(app)
      .get("/v1/me/feed")
      .set("Authorization", `Bearer ${issueAccessToken("user-a")}`)
      .query({ userId: "user-b" })
      .expect(200);

    expect(feedService.getFeed).toHaveBeenCalledWith(
      "user-a",
      undefined,
      undefined,
    );
  });

  it.each([
    ["missing", undefined],
    ["invalid", "Bearer invalid"],
  ])("returns generic 401 for %s authentication", async (_name, header) => {
    const operation = request(app).get("/v1/me/feed");
    if (header) operation.set("Authorization", header);

    const response = await operation.expect(401);

    expect(response.body).toEqual({
      status: "error",
      message: "Unauthorized",
    });
    expect(feedService.getFeed).not.toHaveBeenCalled();
  });
});
