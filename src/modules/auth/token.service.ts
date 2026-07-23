import { createHash, randomUUID } from "node:crypto";
import jwt, { JwtPayload } from "jsonwebtoken";
import { authConfig } from "../../config/auth";
import { UnauthorizedError } from "../../utils/errors";
import type { AuthIdentity, RefreshIdentity } from "./auth.types";

const ALGORITHM = "HS256";

export function issueAccessToken(userId: string): string {
  return jwt.sign(
    { type: "access" },
    authConfig.accessSecret,
    signingOptions(userId, authConfig.accessTtlSeconds),
  );
}

export function issueRefreshToken(userId: string, sessionId: string): string {
  return jwt.sign(
    { type: "refresh", sid: sessionId },
    authConfig.refreshSecret,
    signingOptions(userId, authConfig.refreshTtlSeconds),
  );
}

export function verifyAccessToken(token: string): AuthIdentity {
  const payload = verify(token, authConfig.accessSecret);
  if (payload.type !== "access" || !payload.sub) {
    throw new UnauthorizedError();
  }
  return { userId: payload.sub };
}

export function verifyRefreshToken(token: string): RefreshIdentity {
  const payload = verify(token, authConfig.refreshSecret);
  if (
    payload.type !== "refresh" ||
    !payload.sub ||
    typeof payload.sid !== "string" ||
    payload.sid.length === 0
  ) {
    throw new UnauthorizedError();
  }
  return { userId: payload.sub, sessionId: payload.sid };
}

export function hashRefreshToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

function signingOptions(userId: string, expiresIn: number): jwt.SignOptions {
  return {
    algorithm: ALGORITHM,
    issuer: authConfig.issuer,
    audience: authConfig.audience,
    subject: userId,
    jwtid: randomUUID(),
    expiresIn,
  };
}

function verify(token: string, secret: string): JwtPayload {
  try {
    const payload = jwt.verify(token, secret, {
      algorithms: [ALGORITHM],
      issuer: authConfig.issuer,
      audience: authConfig.audience,
    });

    if (typeof payload === "string") {
      throw new UnauthorizedError();
    }
    return payload;
  } catch {
    throw new UnauthorizedError();
  }
}
