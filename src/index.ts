import express, { Request, Response } from "express";
import cookieParser from "cookie-parser";
import swaggerUi from "swagger-ui-express";
import { prisma } from "./lib/prisma";
import { getRedis, disconnectRedis } from "./lib/redis";
import { shutdownQueues } from "./lib/queue";
import { errorHandler } from "./middleware/error-handler";
import feedRoutes from "./modules/feed/feed.routes";
import meFeedRoutes from "./modules/feed/me.feed.routes";
import { swaggerSpec } from "./swagger";
import authRoutes from "./modules/auth/auth.routes";
import meAuthRoutes from "./modules/auth/me.auth.routes";

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(cookieParser());

app.get("/health", (_req: Request, res: Response) => {
  res.json({ status: "ok" });
});

app.use("/api", swaggerUi.serve, swaggerUi.setup(swaggerSpec));

app.use("/v1/auth", authRoutes);
app.use("/v1/feed", feedRoutes);
app.use("/v1/me", meFeedRoutes);
app.use("/v1/me", meAuthRoutes);

app.use((_req: Request, res: Response) => {
  res.status(404).json({ error: "Not found" });
});

app.use(errorHandler);

if (process.env.NODE_ENV !== "test") {
  getRedis();

  const server = app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });

  process.on("SIGTERM", async () => {
    console.log("SIGTERM received, shutting down gracefully...");
    await shutdownQueues();
    await prisma.$disconnect();
    await disconnectRedis();
    server.close(() => process.exit(0));
  });
}

export default app;
