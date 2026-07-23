import jwt from "jsonwebtoken";
import { describe, expect, it } from "vitest";
import { authConfig } from "../../config/auth";
import {
  hashRefreshToken,
  issueAccessToken,
  issueRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
} from "./token.service";

describe("token service", () => {
  it("issues and verifies strict access tokens", () => {
    const token = issueAccessToken("user-1");

    expect(verifyAccessToken(token)).toEqual({ userId: "user-1" });
    expect(() => verifyRefreshToken(token)).toThrow("Unauthorized");
  });

  it("issues and verifies strict refresh tokens", () => {
    const token = issueRefreshToken("user-1", "session-1");

    expect(verifyRefreshToken(token)).toEqual({
      userId: "user-1",
      sessionId: "session-1",
    });
    expect(() => verifyAccessToken(token)).toThrow("Unauthorized");
  });

  it("hashes refresh tokens without storing plaintext", () => {
    const token = issueRefreshToken("user-1", "session-1");
    const hash = hashRefreshToken(token);

    expect(hash).toHaveLength(64);
    expect(hash).not.toContain(token);
    expect(hashRefreshToken(token)).toBe(hash);
  });

  it.each([
    [
      "wrong secret",
      () =>
        jwt.sign({ type: "access" }, "wrong-secret-at-least-32-bytes-long", {
          algorithm: "HS256",
          issuer: authConfig.issuer,
          audience: authConfig.audience,
          subject: "user-1",
          expiresIn: 60,
        }),
    ],
    [
      "wrong algorithm",
      () =>
        jwt.sign({ type: "access" }, authConfig.accessSecret, {
          algorithm: "HS384",
          issuer: authConfig.issuer,
          audience: authConfig.audience,
          subject: "user-1",
          expiresIn: 60,
        }),
    ],
    [
      "wrong issuer",
      () =>
        jwt.sign({ type: "access" }, authConfig.accessSecret, {
          algorithm: "HS256",
          issuer: "wrong",
          audience: authConfig.audience,
          subject: "user-1",
          expiresIn: 60,
        }),
    ],
    [
      "wrong audience",
      () =>
        jwt.sign({ type: "access" }, authConfig.accessSecret, {
          algorithm: "HS256",
          issuer: authConfig.issuer,
          audience: "wrong",
          subject: "user-1",
          expiresIn: 60,
        }),
    ],
    [
      "wrong type",
      () =>
        jwt.sign({ type: "other" }, authConfig.accessSecret, {
          algorithm: "HS256",
          issuer: authConfig.issuer,
          audience: authConfig.audience,
          subject: "user-1",
          expiresIn: 60,
        }),
    ],
    [
      "missing subject",
      () =>
        jwt.sign({ type: "access" }, authConfig.accessSecret, {
          algorithm: "HS256",
          issuer: authConfig.issuer,
          audience: authConfig.audience,
          expiresIn: 60,
        }),
    ],
    [
      "expired",
      () =>
        jwt.sign({ type: "access" }, authConfig.accessSecret, {
          algorithm: "HS256",
          issuer: authConfig.issuer,
          audience: authConfig.audience,
          subject: "user-1",
          expiresIn: -1,
        }),
    ],
  ])("rejects an access token with %s", (_name, makeToken) => {
    expect(() => verifyAccessToken(makeToken())).toThrow("Unauthorized");
  });
});
