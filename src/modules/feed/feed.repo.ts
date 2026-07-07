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

export async function getPostsByIds(
  postIds: string[],
): Promise<PostResponse[]> {
  if (postIds.length === 0) return [];

  const posts = await prisma.post.findMany({
    where: { id: { in: postIds } },
  });

  return posts.map((post) => ({
    id: post.id,
    authorId: post.authorId,
    content: post.content,
    createdAt: post.createdAt,
  }));
}

export async function getCelebrityFollowees(
  userId: string,
  threshold: number,
): Promise<string[]> {
  const follows = await prisma.follow.findMany({
    where: {
      followerId: userId,
      followee: { followersCount: { gt: threshold } },
    },
    select: { followeeId: true },
  });

  return follows.map((f) => f.followeeId);
}

export async function getCelebrityPosts(
  celebrityIds: string[],
  since: Date,
): Promise<PostResponse[]> {
  if (celebrityIds.length === 0) return [];

  const posts = await prisma.post.findMany({
    where: {
      authorId: { in: celebrityIds },
      createdAt: { gte: since },
    },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  return posts.map((post) => ({
    id: post.id,
    authorId: post.authorId,
    content: post.content,
    createdAt: post.createdAt,
  }));
}
