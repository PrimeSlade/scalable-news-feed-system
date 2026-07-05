import { prisma } from "../../lib/prisma";
import { feedGenerationQueue } from "../../lib/queue";
import { ValidationError } from "../../utils/errors";
import { CreatePostInput, PostResponse } from "./feed.types";

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

  const post = await prisma.post.create({
    data: {
      content: content.trim(),
      authorId,
    },
  });

  const author = await prisma.user.findUnique({
    where: { id: authorId },
    select: { followersCount: true },
  });

  if (author && author.followersCount <= CELEBRITY_THRESHOLD) {
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

  return {
    id: post.id,
    authorId: post.authorId,
    content: post.content,
    createdAt: post.createdAt,
  };
}
