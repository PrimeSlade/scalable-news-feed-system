import cookieParser from "cookie-parser";
import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { errorHandler } from "../../middleware/error-handler";
import { UnauthorizedError } from "../../utils/errors";

vi.mock("./auth.service", () => ({
  register: vi.fn(),
  login: vi.fn(),
  refresh: vi.fn(),
  logout: vi.fn(),
}));

import * as authService from "./auth.service";
import authRoutes from "./auth.routes";

const app = express();
app.use(express.json());
app.use(cookieParser());
app.use("/v1/auth", authRoutes);
app.use(errorHandler);

const allowedOrigin = "http://localhost:3000";

describe("auth refresh and logout routes", () => {
  beforeEach(() => vi.clearAllMocks());

  it("rotates refresh tokens only for an allowed Origin", async () => {
    vi.mocked(authService.refresh).mockResolvedValue({
      accessToken: "new-access",
      refreshToken: "new-refresh",
    });

    const response = await request(app)
      .post("/v1/auth/refresh")
      .set("Origin", allowedOrigin)
      .set("Cookie", "refresh_token=old-refresh")
      .expect(200);

    expect(authService.refresh).toHaveBeenCalledWith("old-refresh");
    expect(response.body).toEqual({
      status: "success",
      data: { accessToken: "new-access" },
    });
    expect(response.headers["set-cookie"]?.[0]).toContain("HttpOnly");
    expect(JSON.stringify(response.body)).not.toContain("new-refresh");
  });

  it.each([undefined, "https://evil.example"])(
    "rejects refresh and logout for Origin %s without side effects",
    async (origin) => {
      for (const path of ["refresh", "logout"]) {
        const operation = request(app)
          .post(`/v1/auth/${path}`)
          .set("Cookie", "refresh_token=refresh");
        if (origin) operation.set("Origin", origin);

        const response = await operation.expect(403);

        expect(response.headers["set-cookie"]).toBeUndefined();
      }
      expect(authService.refresh).not.toHaveBeenCalled();
      expect(authService.logout).not.toHaveBeenCalled();
    },
  );

  it("clears the cookie and returns 401 when refresh is missing or invalid", async () => {
    await request(app)
      .post("/v1/auth/refresh")
      .set("Origin", allowedOrigin)
      .expect(401)
      .expect("set-cookie", /refresh_token=;/);

    vi.mocked(authService.refresh).mockRejectedValue(new UnauthorizedError());
    await request(app)
      .post("/v1/auth/refresh")
      .set("Origin", allowedOrigin)
      .set("Cookie", "refresh_token=invalid")
      .expect(401)
      .expect("set-cookie", /refresh_token=;/);
  });

  it.each([
    ["active", "refresh"],
    ["missing", undefined],
    ["malformed", "malformed"],
  ])(
    "returns idempotent 204 logout for %s session state",
    async (_name, token) => {
      const operation = request(app)
        .post("/v1/auth/logout")
        .set("Origin", allowedOrigin);
      if (token) operation.set("Cookie", `refresh_token=${token}`);

      await operation.expect(204).expect("set-cookie", /refresh_token=;/);

      expect(authService.logout).toHaveBeenLastCalledWith(token);
    },
  );
});
