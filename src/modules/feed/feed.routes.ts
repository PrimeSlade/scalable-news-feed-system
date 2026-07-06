import { Router } from "express";
import * as feedController from "./feed.controller";

const router = Router();

/**
 * @openapi
 * /v1/feed:
 *   post:
 *     summary: Create a new post
 *     description: Creates a post and fans it out to the author's followers via Redis.
 *     tags: [Feed]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - authorId
 *               - content
 *             properties:
 *               authorId:
 *                 type: string
 *                 description: The ID of the post author
 *               content:
 *                 type: string
 *                 maxLength: 280
 *                 description: The post content (280 chars max)
 *     responses:
 *       201:
 *         description: Post created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: success
 *                 data:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                     authorId:
 *                       type: string
 *                     content:
 *                       type: string
 *                     createdAt:
 *                       type: string
 *                       format: date-time
 *       400:
 *         description: Validation error (missing authorId, empty content, or content too long)
 */
router.post("/", feedController.createPost);

export default router;
