import { Response } from "express";

interface CursorPagination {
  limit: number;
  hasMore: boolean;
}

interface RespondOptions {
  statusCode?: number;
  pagination?: CursorPagination;
}

export function respond<T>(
  res: Response,
  data: T,
  options: RespondOptions = {},
) {
  const { statusCode = 200, pagination } = options;

  const body: Record<string, unknown> = {
    status: "success",
    data,
  };

  if (pagination) {
    body.pagination = pagination;
  }

  return res.status(statusCode).json(body);
}
