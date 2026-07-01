import { Queue, Worker, Job } from "bullmq";
import { getRedis } from "./redis";

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

export const feedGenerationWorker = new Worker(
  "feed-generation",
  async (job: Job) => {
    console.log(`Processing feed-generation job ${job.id}`, job.data);
  },
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
