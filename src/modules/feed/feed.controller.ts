import { Request, Response } from "express";
import * as feedService from "./feed.service";
import { respond } from "../../utils/response";
import { ValidationError } from "../../utils/errors";

export async function createPost(req: Request, res: Response): Promise<void> {
  const { content, authorId } = req.body;

  if (!authorId) {
    throw new ValidationError("authorId is required");
  }

  const post = await feedService.createPost({ content, authorId });
  respond(res, post, { statusCode: 201 });
}

export async function getFeed(req: Request, res: Response): Promise<void> {
  const userId = req.query.userId as string | undefined;

  if (!userId) {
    throw new ValidationError("userId query parameter is required");
  }

  const cursor = (req.query.cursor as string) || undefined;
  const limit = req.query.limit ? Number(req.query.limit) : undefined;

  if (req.query.limit && (isNaN(limit as number) || (limit as number) <= 0)) {
    throw new ValidationError("limit must be a positive number");
  }

  const feed = await feedService.getFeed(userId, cursor, limit);

  respond(
    res,
    { posts: feed.posts },
    {
      pagination: {
        limit: feed.posts.length,
        hasMore: feed.hasMore,
        ...(feed.nextCursor !== undefined
          ? { nextCursor: feed.nextCursor }
          : {}),
      },
    },
  );
}
