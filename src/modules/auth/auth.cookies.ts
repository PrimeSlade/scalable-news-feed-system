import type { CookieOptions, Request, Response } from "express";
import { authConfig } from "../../config/auth";
import { ForbiddenError } from "../../utils/errors";

export function setRefreshCookie(res: Response, token: string): void {
  res.cookie(authConfig.cookieName, token, {
    ...baseCookieOptions(),
    maxAge: authConfig.refreshTtlSeconds * 1000,
  });
}

export function clearRefreshCookie(res: Response): void {
  res.clearCookie(authConfig.cookieName, baseCookieOptions());
}

export function requireAllowedOrigin(req: Request): void {
  const origin = req.get("origin");
  if (!origin || !authConfig.allowedOrigins.has(origin)) {
    throw new ForbiddenError();
  }
}

function baseCookieOptions(): CookieOptions {
  return {
    httpOnly: true,
    sameSite: "strict",
    secure: authConfig.cookieSecure,
    path: "/v1/auth",
  };
}
