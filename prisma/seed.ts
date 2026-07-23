import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const TOTAL_USERS = 500;
const FOLLOWERS_PER_USER = 100;

function shuffleArray<T>(arr: T[]): T[] {
  const shuffled = [...arr];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j]!, shuffled[i]!];
  }
  return shuffled;
}

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function generateContent(userIndex: number, postIndex: number): string {
  const words = [
    "lorem",
    "ipsum",
    "dolor",
    "sit",
    "amet",
    "consectetur",
    "adipiscing",
    "elit",
    "sed",
    "do",
    "eiusmod",
    "tempor",
    "incididunt",
    "ut",
    "labore",
    "et",
    "dolore",
    "magna",
    "aliqua",
    "enim",
    "ad",
    "minim",
    "veniam",
    "quis",
    "nostrud",
    "exercitation",
    "ullamco",
    "laboris",
    "nisi",
  ];
  const wordCount = randomInt(5, 30);
  const tokens: string[] = [];
  for (let i = 0; i < wordCount; i++) {
    tokens.push(words[Math.floor(Math.random() * words.length)]!);
  }
  return `[user${userIndex} post#${postIndex}] ${tokens.join(" ")}`;
}

async function main(): Promise<void> {
  console.log("Seeding database...");

  // ── 1. Clean slate ──
  await prisma.follow.deleteMany();
  await prisma.post.deleteMany();
  await prisma.user.deleteMany();

  // ── 2. Create users ──
  console.log(`Creating ${TOTAL_USERS} users...`);
  const userIds: string[] = [];
  for (let i = 0; i < TOTAL_USERS; i++) {
    const user = await prisma.user.create({
      data: {
        username: `user${i}`,
        usernameNormalized: `user${i}`,
        displayName: `User ${i}`,
      },
    });
    userIds.push(user.id);
  }
  console.log(`Created ${userIds.length} users`);

  // ── 3. Create follow relationships ──
  // Each user gets exactly FOLLOWERS_PER_USER followers
  console.log(
    `Creating follow relationships (${FOLLOWERS_PER_USER} followers each)...`,
  );

  const followingCounts = new Map<string, number>();

  for (let i = 0; i < userIds.length; i++) {
    const followeeId = userIds[i]!;
    const candidates = userIds.filter((id) => id !== followeeId);
    const followers = shuffleArray(candidates).slice(0, FOLLOWERS_PER_USER);

    for (const followerId of followers) {
      followingCounts.set(
        followerId,
        (followingCounts.get(followerId) ?? 0) + 1,
      );
    }

    await prisma.follow.createMany({
      data: followers.map((followerId) => ({
        followerId,
        followeeId,
      })),
    });

    if ((i + 1) % 50 === 0) {
      console.log(`  ${i + 1}/${TOTAL_USERS} users processed...`);
    }
  }
  console.log("Follow relationships created");

  // ── 4. Update denormalized counts ──
  console.log("Updating follower / following counts...");

  // followersCount: every user has exactly FOLLOWERS_PER_USER followers
  for (let i = 0; i < userIds.length; i += 50) {
    const batch = userIds.slice(i, i + 50);
    await prisma.$transaction(
      batch.map((id) =>
        prisma.user.update({
          where: { id },
          data: { followersCount: FOLLOWERS_PER_USER },
        }),
      ),
    );
  }

  // followingCount: write back per-user following totals
  const userChunks = chunkArray(userIds, 50);
  for (const chunk of userChunks) {
    await prisma.$transaction(
      chunk.map((id) =>
        prisma.user.update({
          where: { id },
          data: {
            followingCount: followingCounts.get(id) ?? 0,
          },
        }),
      ),
    );
  }

  console.log("Counts updated");

  // ── 5. Create posts ──
  console.log("Creating posts...");
  let totalPosts = 0;
  for (let i = 0; i < userIds.length; i++) {
    const authorId = userIds[i]!;
    const postCount = randomInt(1, 5);
    for (let p = 1; p <= postCount; p++) {
      await prisma.post.create({
        data: {
          authorId,
          content: generateContent(i, p),
        },
      });
      totalPosts++;
    }
  }
  console.log(`Created ${totalPosts} posts`);

  // ── 6. Summary ──
  const [userCount, followCount, postCount] = await Promise.all([
    prisma.user.count(),
    prisma.follow.count(),
    prisma.post.count(),
  ]);

  console.log("\nSeed summary:");
  console.log(`  Users:   ${userCount}`);
  console.log(`  Follows: ${followCount}`);
  console.log(`  Posts:   ${postCount}`);
}

function chunkArray<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
