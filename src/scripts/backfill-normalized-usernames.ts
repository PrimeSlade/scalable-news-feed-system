import { prisma } from "../lib/prisma";
import { normalizeUsername } from "../modules/auth/auth.validation";

interface ExistingUsername {
  id: string;
  username: string;
  usernameNormalized: string | null;
}

interface UsernameUpdate {
  id: string;
  usernameNormalized: string;
}

export function planUsernameBackfill(
  users: ExistingUsername[],
): UsernameUpdate[] {
  const byNormalized = new Map<string, string[]>();

  for (const user of users) {
    const normalized = normalizeUsername(user.username);
    const ids = byNormalized.get(normalized) ?? [];
    ids.push(user.id);
    byNormalized.set(normalized, ids);
  }

  const collisions = [...byNormalized.entries()].filter(
    ([, ids]) => ids.length > 1,
  );
  if (collisions.length > 0) {
    const details = collisions
      .map(([normalized, ids]) => `${normalized}: ${ids.join(", ")}`)
      .join("; ");
    throw new Error(`Normalized username collisions: ${details}`);
  }

  return users.flatMap((user) => {
    const usernameNormalized = normalizeUsername(user.username);
    return user.usernameNormalized === usernameNormalized
      ? []
      : [{ id: user.id, usernameNormalized }];
  });
}

export async function backfillNormalizedUsernames(): Promise<number> {
  const users = await prisma.user.findMany({
    select: { id: true, username: true, usernameNormalized: true },
  });
  const updates = planUsernameBackfill(users);

  if (updates.length > 0) {
    await prisma.$transaction(
      updates.map((update) =>
        prisma.user.update({
          where: { id: update.id },
          data: { usernameNormalized: update.usernameNormalized },
        }),
      ),
    );
  }

  return updates.length;
}

async function main(): Promise<void> {
  const count = await backfillNormalizedUsernames();
  console.log(`Backfilled ${count} normalized usernames`);
}

if (require.main === module) {
  main()
    .catch((error: unknown) => {
      console.error(error instanceof Error ? error.message : "Backfill failed");
      process.exitCode = 1;
    })
    .finally(async () => prisma.$disconnect());
}
