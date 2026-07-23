import type { NextFunction, Request, Response } from "express";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  issueAccessToken,
  issueRefreshToken,
} from "../modules/auth/token.service";
import { UnauthorizedError } from "../utils/errors";
import { authenticateAccessToken } from "./authenticate";

describe("authenticateAccessToken", () => {
  let next: NextFunction;

  beforeEach(() => {
    next = vi.fn();
  });

  it("attaches identity for a valid access bearer", () => {
    const req = requestWithAuthorization(
      `Bearer ${issueAccessToken("user-1")}`,
    );

    authenticateAccessToken(req, {} as Response, next);

    expect(req.auth).toEqual({ userId: "user-1" });
    expect(next).toHaveBeenCalledWith();
  });

  it.each([
    ["missing", undefined],
    ["wrong scheme", `Basic ${issueAccessToken("user-1")}`],
    ["empty bearer", "Bearer "],
    ["multiple values", `Bearer ${issueAccessToken("user-1")} extra`],
    ["malformed token", "Bearer not-a-jwt"],
    ["refresh token", `Bearer ${issueRefreshToken("user-1", "session-1")}`],
  ])("rejects a %s authorization header", (_name, authorization) => {
    const req = requestWithAuthorization(authorization);

    authenticateAccessToken(req, {} as Response, next);

    expect(req.auth).toBeUndefined();
    expect(next).toHaveBeenCalledWith(expect.any(UnauthorizedError));
  });
});

function requestWithAuthorization(authorization?: string): Request {
  return {
    headers: authorization ? { authorization } : {},
  } as Request;
}
