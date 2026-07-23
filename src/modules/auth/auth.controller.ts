import type { Request, Response } from "express";
import { authConfig } from "../../config/auth";
import { UnauthorizedError } from "../../utils/errors";
import { respond } from "../../utils/response";
import * as authService from "./auth.service";
import {
  clearRefreshCookie,
  requireAllowedOrigin,
  setRefreshCookie,
} from "./auth.cookies";
import { validateLogin, validateRegistration } from "./auth.validation";

export async function register(req: Request, res: Response): Promise<void> {
  const input = validateRegistration(req.body);
  const result = await authService.register(input);

  setRefreshCookie(res, result.refreshToken);
  respond(
    res,
    { accessToken: result.accessToken, user: result.user },
    { statusCode: 201 },
  );
}

export async function login(req: Request, res: Response): Promise<void> {
  const input = validateLogin(req.body);
  const result = await authService.login(input);

  setRefreshCookie(res, result.refreshToken);
  respond(res, { accessToken: result.accessToken, user: result.user });
}

export async function refresh(req: Request, res: Response): Promise<void> {
  requireAllowedOrigin(req);
  const refreshToken = req.cookies[authConfig.cookieName] as unknown;

  if (typeof refreshToken !== "string" || refreshToken.length === 0) {
    clearRefreshCookie(res);
    throw new UnauthorizedError();
  }

  try {
    const result = await authService.refresh(refreshToken);
    setRefreshCookie(res, result.refreshToken);
    respond(res, { accessToken: result.accessToken });
  } catch (error) {
    clearRefreshCookie(res);
    throw error;
  }
}

export async function logout(req: Request, res: Response): Promise<void> {
  requireAllowedOrigin(req);
  const value = req.cookies[authConfig.cookieName] as unknown;
  const refreshToken = typeof value === "string" ? value : undefined;

  try {
    await authService.logout(refreshToken);
  } finally {
    clearRefreshCookie(res);
  }

  res.status(204).send();
}

export async function me(req: Request, res: Response): Promise<void> {
  if (!req.auth) {
    throw new UnauthorizedError();
  }

  const user = await authService.getCurrentUser(req.auth.userId);
  respond(res, user);
}
