import type { Request, Response } from "express";
import { describe, expect, it, vi } from "vitest";
import { ForbiddenError } from "../../utils/errors";
import {
  clearRefreshCookie,
  requireAllowedOrigin,
  setRefreshCookie,
} from "./auth.cookies";

describe("auth cookies and Origin policy", () => {
  it("sets and clears the scoped HttpOnly Strict cookie", () => {
    const res = {
      cookie: vi.fn(),
      clearCookie: vi.fn(),
    } as unknown as Response;

    setRefreshCookie(res, "refresh");
    clearRefreshCookie(res);

    expect(res.cookie).toHaveBeenCalledWith(
      "refresh_token",
      "refresh",
      expect.objectContaining({
        httpOnly: true,
        sameSite: "strict",
        path: "/v1/auth",
      }),
    );
    expect(res.clearCookie).toHaveBeenCalledWith(
      "refresh_token",
      expect.objectContaining({ path: "/v1/auth" }),
    );
  });

  it("allows the configured exact Origin", () => {
    const req = {
      get: vi.fn(() => "http://localhost:3000"),
    } as unknown as Request;

    expect(() => requireAllowedOrigin(req)).not.toThrow();
  });

  it.each([undefined, "https://evil.example"])(
    "rejects Origin %s",
    (origin) => {
      const req = { get: vi.fn(() => origin) } as unknown as Request;

      expect(() => requireAllowedOrigin(req)).toThrow(ForbiddenError);
    },
  );
});
