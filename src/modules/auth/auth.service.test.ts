import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./auth.repo", () => ({
  createAccountWithSession: vi.fn(),
  findUserByNormalizedUsername: vi.fn(),
  createSession: vi.fn(),
  findSafeUserById: vi.fn(),
  findSession: vi.fn(),
  rotateSessionToken: vi.fn(),
  revokeSession: vi.fn(),
}));

import * as authRepo from "./auth.repo";
import {
  getCurrentUser,
  login,
  logout,
  refresh,
  register,
} from "./auth.service";
import { hashRefreshToken, issueRefreshToken } from "./token.service";

const user = {
  id: "507f1f77bcf86cd799439011",
  username: "Alice",
  displayName: "Alice",
  avatarUrl: null,
  passwordHash: null as string | null,
  createdAt: new Date("2026-01-01"),
  updatedAt: new Date("2026-01-01"),
};

describe("auth service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("registers with a hash and returns no password material", async () => {
    vi.mocked(authRepo.createAccountWithSession).mockImplementation(
      async (input) => ({
        id: input.userId,
        username: user.username,
        displayName: user.displayName,
        avatarUrl: user.avatarUrl,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      }),
    );

    const result = await register({
      username: "Alice",
      usernameNormalized: "alice",
      displayName: "Alice",
      password: "correct horse battery staple",
    });

    expect(authRepo.createAccountWithSession).toHaveBeenCalledWith(
      expect.objectContaining({
        usernameNormalized: "alice",
        passwordHash: expect.stringMatching(/^\$2[aby]\$/),
        tokenHash: expect.stringMatching(/^[a-f0-9]{64}$/),
      }),
    );
    expect(result.user).not.toHaveProperty("passwordHash");
    expect(result.refreshToken).toMatch(/^ey/);
  });

  it("maps normalized duplicate registration to conflict", async () => {
    vi.mocked(authRepo.createAccountWithSession).mockRejectedValue({
      code: "P2002",
    });

    await expect(
      register({
        username: "Alice",
        usernameNormalized: "alice",
        displayName: "Alice",
        password: "correct horse battery staple",
      }),
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  it("logs in a credentialed user and creates an independent session", async () => {
    const passwordHash = await import("bcrypt").then(({ default: bcrypt }) =>
      bcrypt.hash("correct horse battery staple", 10),
    );
    vi.mocked(authRepo.findUserByNormalizedUsername).mockResolvedValue({
      ...user,
      passwordHash,
    });
    vi.mocked(authRepo.createSession).mockResolvedValue();

    const result = await login({
      username: "ALICE",
      password: "correct horse battery staple",
    });

    expect(authRepo.findUserByNormalizedUsername).toHaveBeenCalledWith("alice");
    expect(authRepo.createSession).toHaveBeenCalledWith(
      expect.objectContaining({ userId: user.id }),
    );
    expect(result.user).not.toHaveProperty("passwordHash");
  });

  it.each([
    ["unknown user", null, "any password"],
    ["legacy user", user, "any password"],
  ])("returns the same error for %s", async (_name, found, password) => {
    vi.mocked(authRepo.findUserByNormalizedUsername).mockResolvedValue(found);

    await expect(login({ username: "alice", password })).rejects.toMatchObject({
      statusCode: 401,
      message: "Invalid credentials",
    });
  });

  it("rotates a matching active refresh token", async () => {
    const refreshToken = issueRefreshToken(user.id, "session-1");
    vi.mocked(authRepo.findSession).mockResolvedValue({
      id: "session-1",
      userId: user.id,
      tokenHash: hashRefreshToken(refreshToken),
      expiresAt: new Date(Date.now() + 60_000),
      revokedAt: null,
    });
    vi.mocked(authRepo.rotateSessionToken).mockResolvedValue(true);

    const result = await refresh(refreshToken);

    expect(result.refreshToken).not.toBe(refreshToken);
    expect(authRepo.rotateSessionToken).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "session-1",
        currentTokenHash: hashRefreshToken(refreshToken),
      }),
    );
    expect(authRepo.revokeSession).not.toHaveBeenCalled();
  });

  it("revokes the session family when a rotated token is replayed", async () => {
    const refreshToken = issueRefreshToken(user.id, "session-1");
    vi.mocked(authRepo.findSession).mockResolvedValue({
      id: "session-1",
      userId: user.id,
      tokenHash: "different-current-hash",
      expiresAt: new Date(Date.now() + 60_000),
      revokedAt: null,
    });

    await expect(refresh(refreshToken)).rejects.toMatchObject({
      statusCode: 401,
    });
    expect(authRepo.revokeSession).toHaveBeenCalledWith("session-1", user.id);
  });

  it("revokes the session family when compare-and-swap loses a race", async () => {
    const refreshToken = issueRefreshToken(user.id, "session-1");
    vi.mocked(authRepo.findSession).mockResolvedValue({
      id: "session-1",
      userId: user.id,
      tokenHash: hashRefreshToken(refreshToken),
      expiresAt: new Date(Date.now() + 60_000),
      revokedAt: null,
    });
    vi.mocked(authRepo.rotateSessionToken).mockResolvedValue(false);

    await expect(refresh(refreshToken)).rejects.toMatchObject({
      statusCode: 401,
    });
    expect(authRepo.revokeSession).toHaveBeenCalledWith("session-1", user.id);
  });

  it("revokes an identifiable refresh session on logout", async () => {
    const refreshToken = issueRefreshToken(user.id, "session-1");

    await logout(refreshToken);

    expect(authRepo.revokeSession).toHaveBeenCalledWith("session-1", user.id);
  });

  it.each([undefined, "malformed"])(
    "makes logout idempotent for %s refresh input",
    async (refreshToken) => {
      await expect(logout(refreshToken)).resolves.toBeUndefined();
      expect(authRepo.revokeSession).not.toHaveBeenCalled();
    },
  );

  it("returns the safe current user projection", async () => {
    const { passwordHash: _passwordHash, ...safeUser } = user;
    vi.mocked(authRepo.findSafeUserById).mockResolvedValue(safeUser);

    await expect(getCurrentUser(user.id)).resolves.toEqual(safeUser);
  });
});
