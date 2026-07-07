export interface CreatePostInput {
  content: string;
  authorId: string;
}

export interface PostResponse {
  id: string;
  authorId: string;
  content: string;
  createdAt: Date;
}

export interface GetFeedQuery {
  userId: string;
  cursor?: string;
  limit?: number;
}

export interface FeedResponse {
  posts: PostResponse[];
  hasMore: boolean;
  nextCursor?: string;
}
