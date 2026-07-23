import type { NextFunction, Request, Response } from "express";
import { verifyAccessToken } from "../modules/auth/token.service";
import { UnauthorizedError } from "../utils/errors";

export function authenticateAccessToken(
  req: Request,
  _res: Response,
  next: NextFunction,
): void {
  const authorization = req.headers.authorization;

  if (!authorization?.startsWith("Bearer ")) {
    next(new UnauthorizedError());
    return;
  }

  const token = authorization.slice("Bearer ".length).trim();
  if (!token || token.includes(" ")) {
    next(new UnauthorizedError());
    return;
  }

  try {
    req.auth = verifyAccessToken(token);
    next();
  } catch {
    next(new UnauthorizedError());
  }
}
