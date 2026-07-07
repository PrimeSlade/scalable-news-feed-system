import { describe, it, expect, vi, beforeEach } from "vitest";
import { Job } from "bullmq";

vi.mock("./prisma", () => ({
  prisma: {
    follow: { findMany: vi.fn() },
  },
}));

vi.mock("./redis", () => ({
  getRedis: vi.fn(() => ({
    pipeline: vi.fn(),
  })),
}));

import { prisma } from "./prisma";
import { getRedis } from "./redis";
import { processFanOutJob } from "./queue";

describe("processFanOutJob", () => {
  const baseJobData = {
    postId: "507f1f77bcf86cd799439001",
    authorId: "507f1f77bcf86cd799439002",
    createdAt: 1704067200000,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  function makeJob(data: Record<string, unknown> = {}) {
    return { data: { ...baseJobData, ...data } } as unknown as Job;
  }

  function setupPipelineMocks(zcardResults: number[]) {
    const mockZadd = vi.fn();
    const mockZcard = vi.fn();
    const mockZremrangebyrank = vi.fn();
    const mockExec = vi.fn();

    const execResults: Array<[null, number]> = [];
    for (const count of zcardResults) {
      execResults.push([null, 1], [null, count]);
    }
    mockExec.mockResolvedValue(execResults);

    const pipelineMock = {
      zadd: mockZadd.mockReturnThis(),
      zcard: mockZcard.mockReturnThis(),
      zremrangebyrank: mockZremrangebyrank.mockReturnThis(),
      exec: mockExec,
    };

    vi.mocked(getRedis).mockReturnValue({
      pipeline: vi.fn().mockReturnValue(pipelineMock),
    } as never);

    return { mockZadd, mockZcard, mockZremrangebyrank, mockExec };
  }

  it("writes postId to followers and author Redis feeds", async () => {
    vi.mocked(prisma.follow.findMany).mockResolvedValue([
      {
        id: "f1",
        followerId: "507f1f77bcf86cd799439010",
        followeeId: "507f1f77bcf86cd799439002",
        createdAt: new Date(),
      },
      {
        id: "f2",
        followerId: "507f1f77bcf86cd799439011",
        followeeId: "507f1f77bcf86cd799439002",
        createdAt: new Date(),
      },
    ]);

    const { mockZadd, mockZcard, mockExec } = setupPipelineMocks([
      500, 300, 800,
    ]);

    await processFanOutJob(makeJob());

    expect(mockZadd).toHaveBeenCalledTimes(3);
    expect(mockZcard).toHaveBeenCalledTimes(3);
    expect(mockExec).toHaveBeenCalledTimes(2);
  });

  it("includes author in the fan-out even with no followers", async () => {
    vi.mocked(prisma.follow.findMany).mockResolvedValue([]);

    const { mockZadd, mockZcard } = setupPipelineMocks([1]);

    await processFanOutJob(makeJob());

    expect(mockZadd).toHaveBeenCalledTimes(1);
    expect(mockZadd).toHaveBeenCalledWith(
      "feed:507f1f77bcf86cd799439002",
      1704067200000,
      "507f1f77bcf86cd799439001",
    );
    expect(mockZcard).toHaveBeenCalledTimes(1);
  });

  it("trims feeds that exceed 1000 entries", async () => {
    vi.mocked(prisma.follow.findMany).mockResolvedValue([
      {
        id: "f1",
        followerId: "507f1f77bcf86cd799439010",
        followeeId: "507f1f77bcf86cd799439002",
        createdAt: new Date(),
      },
    ]);

    const { mockZremrangebyrank } = setupPipelineMocks([1001, 500]);

    await processFanOutJob(makeJob());

    expect(mockZremrangebyrank).toHaveBeenCalledTimes(1);
    expect(mockZremrangebyrank).toHaveBeenCalledWith(
      "feed:507f1f77bcf86cd799439010",
      0,
      0,
    );
  });

  it("does not trim feeds at or under 1000 entries", async () => {
    vi.mocked(prisma.follow.findMany).mockResolvedValue([
      {
        id: "f1",
        followerId: "507f1f77bcf86cd799439010",
        followeeId: "507f1f77bcf86cd799439002",
        createdAt: new Date(),
      },
    ]);

    const { mockZremrangebyrank } = setupPipelineMocks([1000, 500]);

    await processFanOutJob(makeJob());

    expect(mockZremrangebyrank).not.toHaveBeenCalled();
  });

  it("returns early if pipeline exec returns null", async () => {
    vi.mocked(prisma.follow.findMany).mockResolvedValue([
      {
        id: "f1",
        followerId: "507f1f77bcf86cd799439010",
        followeeId: "507f1f77bcf86cd799439002",
        createdAt: new Date(),
      },
    ]);

    const mockZadd = vi.fn();
    const mockZcard = vi.fn();
    const mockZremrangebyrank = vi.fn();
    const mockExec = vi.fn().mockResolvedValue(null);

    const pipelineMock = {
      zadd: mockZadd.mockReturnThis(),
      zcard: mockZcard.mockReturnThis(),
      zremrangebyrank: mockZremrangebyrank.mockReturnThis(),
      exec: mockExec,
    };

    vi.mocked(getRedis).mockReturnValue({
      pipeline: vi.fn().mockReturnValue(pipelineMock),
    } as never);

    await processFanOutJob(makeJob());

    expect(mockZremrangebyrank).not.toHaveBeenCalled();
  });

  it("handles high follower count with efficient pipeline", async () => {
    const followers = Array.from({ length: 500 }, (_, i) => ({
      id: `f${i}`,
      followerId: `507f1f77bcf86${String(i).padStart(4, "0")}`,
      followeeId: "507f1f77bcf86cd799439002",
      createdAt: new Date(),
    }));
    vi.mocked(prisma.follow.findMany).mockResolvedValue(followers);

    const counts = Array.from({ length: 501 }, () => 500);
    const { mockZadd, mockZcard } = setupPipelineMocks(counts);

    await processFanOutJob(makeJob());

    expect(mockZadd).toHaveBeenCalledTimes(501);
    expect(mockZcard).toHaveBeenCalledTimes(501);
  });
});
