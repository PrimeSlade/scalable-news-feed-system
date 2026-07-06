import { Queue, Worker, Job } from "bullmq";
import { getRedis } from "./redis";
import { prisma } from "./prisma";

const connection = getRedis();

export const feedGenerationQueue = new Queue("feed-generation", {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: "exponential",
      delay: 1000,
    },
    removeOnComplete: { count: 1000 },
    removeOnFail: { count: 5000 },
  },
});

export async function processFanOutJob(job: Job): Promise<void> {
  const { postId, authorId, createdAt } = job.data;

  const follows = await prisma.follow.findMany({
    where: { followeeId: authorId },
    select: { followerId: true },
  });

  const followerIds: string[] = follows.map((f) => f.followerId);
  // Include the author so their own post appears in future feed fetches
  // (the API response already includes it on creation, but Redis is the
  // source of truth for the feed when the user refreshes or re-fetches later)
  followerIds.push(authorId);

  const redis = getRedis();

  const pipeline = redis.pipeline();
  for (const followerId of followerIds) {
    pipeline.zadd(followerId, createdAt, postId);
    pipeline.zcard(followerId);
  }

  const results = await pipeline.exec();

  console.log(results);

  if (!results) return;

  const trimPipeline = redis.pipeline();
  for (let i = 0; i < followerIds.length; i++) {
    const fid = followerIds[i]!;
    const zcardResult = results[i * 2 + 1];
    const count = zcardResult?.[1] as number | undefined;
    if (count && count > 1000) {
      trimPipeline.zremrangebyrank(fid, 0, count - 1001);
    }
  }
  await trimPipeline.exec();
}

export const feedGenerationWorker = new Worker(
  "feed-generation",
  processFanOutJob,
  {
    connection,
    concurrency: 5,
    limiter: {
      max: 100,
      duration: 60000,
    },
  },
);

feedGenerationWorker.on("completed", (job: Job) => {
  console.log(`Job ${job.id} completed`);
});

feedGenerationWorker.on("failed", (job: Job | undefined, err: Error) => {
  console.error(`Job ${job?.id} failed:`, err);
});

feedGenerationWorker.on("stalled", (jobId: string) => {
  console.warn(`Job ${jobId} stalled`);
});

export async function closeQueues(): Promise<void> {
  await feedGenerationWorker.close();
  await feedGenerationQueue.close();
}

export async function shutdownQueues(): Promise<void> {
  console.log("Shutting down queues gracefully...");
  await feedGenerationWorker.pause();
  await closeQueues();
}
