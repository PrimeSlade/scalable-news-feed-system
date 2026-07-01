import express, { Request, Response, NextFunction } from "express";
import { prisma } from "./lib/prisma";
import { getRedis, disconnectRedis } from "./lib/redis";
import { shutdownQueues } from "./lib/queue";

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

app.get("/health", (_req: Request, res: Response) => {
  res.json({ status: "ok" });
});

app.use((_req: Request, res: Response) => {
  res.status(404).json({ error: "Not found" });
});

app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error(err);
  res.status(500).json({ error: "Internal server error" });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

getRedis();

process.on("SIGTERM", () => {
  Promise.all([prisma.$disconnect(), shutdownQueues(), disconnectRedis()]).then(
    () => process.exit(0),
  );
});

export default app;
