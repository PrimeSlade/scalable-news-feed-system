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
