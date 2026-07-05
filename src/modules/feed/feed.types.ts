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
