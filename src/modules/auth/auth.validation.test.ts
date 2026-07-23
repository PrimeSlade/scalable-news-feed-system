import { describe, expect, it } from "vitest";
import {
  normalizeUsername,
  validateLogin,
  validateRegistration,
} from "./auth.validation";

describe("auth validation", () => {
  it("trims profile fields and derives a case-insensitive login key", () => {
    expect(
      validateRegistration({
        username: " Alice ",
        displayName: " Alice Example ",
        password: "correct horse battery staple",
      }),
    ).toEqual({
      username: "Alice",
      usernameNormalized: "alice",
      displayName: "Alice Example",
      password: "correct horse battery staple",
    });
  });

  it.each([
    ["missing body", undefined],
    ["missing username", { displayName: "Alice", password: "a".repeat(12) }],
    [
      "blank username",
      { username: " ", displayName: "Alice", password: "a".repeat(12) },
    ],
    ["missing display name", { username: "alice", password: "a".repeat(12) }],
    ["missing password", { username: "alice", displayName: "Alice" }],
    [
      "short password",
      { username: "alice", displayName: "Alice", password: "a".repeat(11) },
    ],
    [
      "password over 72 bytes",
      { username: "alice", displayName: "Alice", password: "🙂".repeat(19) },
    ],
  ])("rejects %s", (_name, input) => {
    expect(() => validateRegistration(input)).toThrow();
  });

  it("accepts exactly 12 characters and exactly 72 UTF-8 bytes", () => {
    expect(
      validateRegistration({
        username: "alice",
        displayName: "Alice",
        password: "a".repeat(12),
      }).password,
    ).toHaveLength(12);
    expect(
      validateRegistration({
        username: "alice",
        displayName: "Alice",
        password: "🙂".repeat(18),
      }).password,
    ).toBe("🙂".repeat(18));
  });

  it("validates login without applying registration strength rules", () => {
    expect(validateLogin({ username: " Alice ", password: "old" })).toEqual({
      username: "Alice",
      password: "old",
    });
    expect(normalizeUsername(" ALICE ")).toBe("alice");
  });
});
