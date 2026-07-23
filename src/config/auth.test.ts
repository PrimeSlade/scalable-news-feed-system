import { describe, expect, it } from "vitest";
import { loadAuthConfig } from "./auth";

const validEnv: NodeJS.ProcessEnv = {
  NODE_ENV: "production",
  AUTH_ACCESS_TOKEN_SECRET: "access-secret-that-is-at-least-32-bytes",
  AUTH_REFRESH_TOKEN_SECRET: "refresh-secret-that-is-at-least-32-bytes",
  AUTH_TOKEN_ISSUER: "issuer",
  AUTH_TOKEN_AUDIENCE: "audience",
  AUTH_ALLOWED_ORIGINS: "https://app.example.com",
  AUTH_COOKIE_SECURE: "true",
};

describe("loadAuthConfig", () => {
  it("loads valid settings with approved defaults", () => {
    const config = loadAuthConfig(validEnv);

    expect(config.accessTtlSeconds).toBe(900);
    expect(config.refreshTtlSeconds).toBe(604800);
    expect(config.bcryptRounds).toBe(12);
    expect(config.allowedOrigins.has("https://app.example.com")).toBe(true);
    expect(config.cookieSecure).toBe(true);
  });

  it.each([
    ["missing access secret", { AUTH_ACCESS_TOKEN_SECRET: undefined }],
    ["short refresh secret", { AUTH_REFRESH_TOKEN_SECRET: "short" }],
    [
      "matching secrets",
      {
        AUTH_REFRESH_TOKEN_SECRET: validEnv.AUTH_ACCESS_TOKEN_SECRET as string,
      },
    ],
    ["invalid access lifetime", { AUTH_ACCESS_TTL_SECONDS: "0" }],
    ["invalid refresh lifetime", { AUTH_REFRESH_TTL_SECONDS: "100" }],
    ["invalid bcrypt cost", { AUTH_BCRYPT_ROUNDS: "9" }],
    ["empty issuer", { AUTH_TOKEN_ISSUER: "" }],
    ["empty audience", { AUTH_TOKEN_AUDIENCE: "" }],
    ["invalid origin", { AUTH_ALLOWED_ORIGINS: "example.com/path" }],
    ["insecure production cookie", { AUTH_COOKIE_SECURE: "false" }],
  ])("rejects %s", (_name, overrides) => {
    expect(() => loadAuthConfig({ ...validEnv, ...overrides })).toThrow();
  });

  it("does not include secret values in errors", () => {
    const secret = "too-short-secret";

    expect(() =>
      loadAuthConfig({ ...validEnv, AUTH_ACCESS_TOKEN_SECRET: secret }),
    ).toThrowError(expect.not.stringContaining(secret));
  });
});
