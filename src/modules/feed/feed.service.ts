import { feedGenerationQueue } from "../../lib/queue";
import { ValidationError } from "../../utils/errors";
import { CreatePostInput, PostResponse } from "./feed.types";
import * as feedRepo from "./feed.repo";

const CELEBRITY_THRESHOLD = Number(process.env.CELEBRITY_THRESHOLD) || 10000;

const MAX_CONTENT_LENGTH = 280;

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
