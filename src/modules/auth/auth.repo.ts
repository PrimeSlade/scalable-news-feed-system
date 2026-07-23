import type { Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma";
import type { SafeUser } from "./auth.types";

const safeUserSelect = {
  id: true,
  username: true,
  displayName: true,
  avatarUrl: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.UserSelect;

export interface CreateAccountInput {
  userId: string;
  username: string;
  usernameNormalized: string;
  displayName: string;
  passwordHash: string;
  sessionId: string;
  tokenHash: string;
  expiresAt: Date;
}

export interface CredentialedUser extends SafeUser {
  passwordHash: string | null;
}

export interface SessionRecord {
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: Date;
  revokedAt: Date | null;
}

export async function createAccountWithSession(
  input: CreateAccountInput,
): Promise<SafeUser> {
  return prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        id: input.userId,
        username: input.username,
        usernameNormalized: input.usernameNormalized,
        displayName: input.displayName,
        passwordHash: input.passwordHash,
      },
      select: safeUserSelect,
    });

    await tx.authSession.create({
      data: {
        id: input.sessionId,
        userId: user.id,
        tokenHash: input.tokenHash,
        expiresAt: input.expiresAt,
      },
    });

    return user;
  });
}

export async function findUserByNormalizedUsername(
  usernameNormalized: string,
): Promise<CredentialedUser | null> {
  return prisma.user.findUnique({
    where: { usernameNormalized },
    select: { ...safeUserSelect, passwordHash: true },
  });
}

export async function findSafeUserById(
  userId: string,
): Promise<SafeUser | null> {
  return prisma.user.findUnique({
    where: { id: userId },
    select: safeUserSelect,
  });
}

export async function createSession(input: {
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: Date;
}): Promise<void> {
  await prisma.authSession.create({ data: input });
}

export async function findSession(id: string): Promise<SessionRecord | null> {
  return prisma.authSession.findUnique({
    where: { id },
    select: {
      id: true,
      userId: true,
      tokenHash: true,
      expiresAt: true,
      revokedAt: true,
    },
  });
}

export async function rotateSessionToken(input: {
  id: string;
  userId: string;
  currentTokenHash: string;
  nextTokenHash: string;
  expiresAt: Date;
}): Promise<boolean> {
  const result = await prisma.authSession.updateMany({
    where: {
      id: input.id,
      userId: input.userId,
      tokenHash: input.currentTokenHash,
      revokedAt: null,
      expiresAt: { gt: new Date() },
    },
    data: {
      tokenHash: input.nextTokenHash,
      expiresAt: input.expiresAt,
    },
  });
  return result.count === 1;
}

export async function revokeSession(id: string, userId: string): Promise<void> {
  await prisma.authSession.updateMany({
    where: { id, userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}
