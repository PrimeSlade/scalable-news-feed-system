import { randomBytes, randomUUID } from "node:crypto";
import bcrypt from "bcrypt";
import { authConfig } from "../../config/auth";
import { ConflictError, UnauthorizedError } from "../../utils/errors";
import * as authRepo from "./auth.repo";
import type {
  AuthResult,
  LoginInput,
  RefreshResult,
  SafeUser,
} from "./auth.types";
import type { ValidatedRegisterInput } from "./auth.validation";
import { normalizeUsername } from "./auth.validation";
import {
  hashRefreshToken,
  issueAccessToken,
  issueRefreshToken,
  verifyRefreshToken,
} from "./token.service";

const dummyPasswordHash = bcrypt.hash(
  "authentication-timing-placeholder",
  authConfig.bcryptRounds,
);

export async function register(
  input: ValidatedRegisterInput,
): Promise<AuthResult> {
  const passwordHash = await bcrypt.hash(
    input.password,
    authConfig.bcryptRounds,
  );
  const userId = randomBytes(12).toString("hex");
  const session = createSessionMaterial(userId);

  try {
    const user = await authRepo.createAccountWithSession({
      userId,
      username: input.username,
      usernameNormalized: input.usernameNormalized,
      displayName: input.displayName,
      passwordHash,
      sessionId: session.id,
      tokenHash: session.tokenHash,
      expiresAt: session.expiresAt,
    });

    return {
      accessToken: issueAccessToken(user.id),
      refreshToken: session.refreshToken,
      user,
    };
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      throw new ConflictError("Username is unavailable");
    }
    throw error;
  }
}

export async function login(input: LoginInput): Promise<AuthResult> {
  const user = await authRepo.findUserByNormalizedUsername(
    normalizeUsername(input.username),
  );
  const comparisonHash = user?.passwordHash ?? (await dummyPasswordHash);
  const passwordMatches = await bcrypt.compare(input.password, comparisonHash);

  if (!user?.passwordHash || !passwordMatches) {
    throw new UnauthorizedError("Invalid credentials");
  }

  const session = createSessionMaterial(user.id);
  await authRepo.createSession({
    id: session.id,
    userId: user.id,
    tokenHash: session.tokenHash,
    expiresAt: session.expiresAt,
  });

  return {
    accessToken: issueAccessToken(user.id),
    refreshToken: session.refreshToken,
    user: toSafeUser(user),
  };
}

export async function refresh(refreshToken: string): Promise<RefreshResult> {
  const identity = verifyRefreshToken(refreshToken);
  const session = await authRepo.findSession(identity.sessionId);
  const currentTokenHash = hashRefreshToken(refreshToken);

  if (
    !session ||
    session.userId !== identity.userId ||
    session.revokedAt ||
    session.expiresAt.getTime() <= Date.now()
  ) {
    throw new UnauthorizedError();
  }

  if (session.tokenHash !== currentTokenHash) {
    await authRepo.revokeSession(session.id, session.userId);
    throw new UnauthorizedError();
  }

  const nextRefreshToken = issueRefreshToken(
    identity.userId,
    identity.sessionId,
  );
  const rotated = await authRepo.rotateSessionToken({
    id: identity.sessionId,
    userId: identity.userId,
    currentTokenHash,
    nextTokenHash: hashRefreshToken(nextRefreshToken),
    expiresAt: new Date(Date.now() + authConfig.refreshTtlSeconds * 1000),
  });

  if (!rotated) {
    await authRepo.revokeSession(identity.sessionId, identity.userId);
    throw new UnauthorizedError();
  }

  return {
    accessToken: issueAccessToken(identity.userId),
    refreshToken: nextRefreshToken,
  };
}

export async function logout(refreshToken: string | undefined): Promise<void> {
  if (!refreshToken) return;

  try {
    const identity = verifyRefreshToken(refreshToken);
    await authRepo.revokeSession(identity.sessionId, identity.userId);
  } catch (error) {
    if (error instanceof UnauthorizedError) return;
    throw error;
  }
}

export async function getCurrentUser(userId: string): Promise<SafeUser> {
  const user = await authRepo.findSafeUserById(userId);
  if (!user) {
    throw new UnauthorizedError();
  }
  return user;
}

function createSessionMaterial(userId: string): {
  id: string;
  refreshToken: string;
  tokenHash: string;
  expiresAt: Date;
} {
  const id = randomUUID();
  const refreshToken = issueRefreshToken(userId, id);
  return {
    id,
    refreshToken,
    tokenHash: hashRefreshToken(refreshToken),
    expiresAt: new Date(Date.now() + authConfig.refreshTtlSeconds * 1000),
  };
}

function toSafeUser(user: authRepo.CredentialedUser): SafeUser {
  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    avatarUrl: user.avatarUrl,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

function isUniqueConstraintError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "P2002"
  );
}
