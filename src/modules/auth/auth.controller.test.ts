import type { Request, Response } from "express";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./auth.service", () => ({
  register: vi.fn(),
  login: vi.fn(),
}));

import * as authService from "./auth.service";
import { login, register } from "./auth.controller";

const safeUser = {
  id: "507f1f77bcf86cd799439011",
  username: "Alice",
  displayName: "Alice",
  avatarUrl: null,
  createdAt: new Date("2026-01-01"),
  updatedAt: new Date("2026-01-01"),
};

describe("auth controller", () => {
  beforeEach(() => vi.clearAllMocks());

  it("registers, sets a protected refresh cookie, and omits it from JSON", async () => {
    vi.mocked(authService.register).mockResolvedValue({
      accessToken: "access",
      refreshToken: "refresh",
      user: safeUser,
    });
    const req = {
      body: {
        username: "Alice",
        displayName: "Alice",
        password: "correct horse battery staple",
      },
    } as Request;
    const res = mockResponse();

    await register(req, res);

    expect(res.cookie).toHaveBeenCalledWith(
      "refresh_token",
      "refresh",
      expect.objectContaining({
        httpOnly: true,
        sameSite: "strict",
        path: "/v1/auth",
      }),
    );
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith({
      status: "success",
      data: { accessToken: "access", user: safeUser },
    });
  });

  it("logs in with normalized input and returns the safe envelope", async () => {
    vi.mocked(authService.login).mockResolvedValue({
      accessToken: "access",
      refreshToken: "refresh",
      user: safeUser,
    });
    const req = {
      body: { username: " Alice ", password: "password" },
    } as Request;
    const res = mockResponse();

    await login(req, res);

    expect(authService.login).toHaveBeenCalledWith({
      username: "Alice",
      password: "password",
    });
    expect(res.status).toHaveBeenCalledWith(200);
  });
});

function mockResponse(): Response {
  const res = {
    cookie: vi.fn(),
    status: vi.fn(),
    json: vi.fn(),
  };
  res.status.mockReturnValue(res);
  res.json.mockReturnValue(res);
  return res as unknown as Response;
}
