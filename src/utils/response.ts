import { Response } from "express";

export function success<T>(res: Response, data: T, statusCode = 200) {
  return res.status(statusCode).json({ status: "success", data });
}

export function created<T>(res: Response, data: T) {
  return success(res, data, 201);
}

export function paginated<T>(
  res: Response,
  data: T[],
  page: number,
  limit: number,
  total: number,
) {
  return res.json({
    status: "success",
    data,
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
  });
}
