import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { errorHandler } from "../../middleware/error-handler";
import { issueAccessToken } from "./token.service";

vi.mock("./auth.service", () => ({
  getCurrentUser: vi.fn(),
}));

import * as authService from "./auth.service";
import meAuthRoutes from "./me.auth.routes";

const app = express();
app.use("/v1/me", meAuthRoutes);
app.use(errorHandler);

const safeUser = {
  id: "507f1f77bcf86cd799439011",
  username: "Alice",
  displayName: "Alice",
  avatarUrl: null,
  createdAt: new Date("2026-01-01"),
  updatedAt: new Date("2026-01-01"),
};

describe("GET /v1/me", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns only the authenticated safe profile", async () => {
    vi.mocked(authService.getCurrentUser).mockResolvedValue(safeUser);

    const response = await request(app)
      .get("/v1/me")
      .set("Authorization", `Bearer ${issueAccessToken(safeUser.id)}`)
      .expect(200);

    expect(authService.getCurrentUser).toHaveBeenCalledWith(safeUser.id);
    expect(response.body).toEqual({
      status: "success",
      data: {
        ...safeUser,
        createdAt: safeUser.createdAt.toISOString(),
        updatedAt: safeUser.updatedAt.toISOString(),
      },
    });
    expect(JSON.stringify(response.body)).not.toMatch(
      /password|token|session/i,
    );
  });

  it.each([undefined, "Bearer invalid"])(
    "returns generic 401 for authorization %s",
    async (authorization) => {
      const operation = request(app).get("/v1/me");
      if (authorization) operation.set("Authorization", authorization);

      const response = await operation.expect(401);

      expect(response.body).toEqual({
        status: "error",
        message: "Unauthorized",
      });
      expect(authService.getCurrentUser).not.toHaveBeenCalled();
    },
  );
});
