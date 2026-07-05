import { prisma } from "../../lib/prisma";

import type { PostResponse } from "./feed.types";

export async function createPost(
  content: string,
  authorId: string,
): Promise<PostResponse> {
  const post = await prisma.post.create({
    data: {
      content,
      authorId,
    },
  });

  return {
    id: post.id,
    authorId: post.authorId,
    content: post.content,
    createdAt: post.createdAt,
  };
}

export async function getFollowersCount(
  userId: string,
): Promise<number | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { followersCount: true },
  });

  return user?.followersCount ?? null;
}
