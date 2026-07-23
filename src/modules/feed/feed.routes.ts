import { Router } from "express";
import * as feedController from "./feed.controller";
import { authenticateAccessToken } from "../../middleware/authenticate";
import { asyncHandler } from "../../utils/async-handler";

const router = Router();

/**
 * @openapi
 * /v1/feed:
 *   post:
 *     summary: Create a new post
 *     description: Creates a post and fans it out to the author's followers via Redis.
 *     tags: [Feed]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - content
 *             properties:
 *               authorId:
 *                 type: string
 *                 deprecated: true
 *                 description: Ignored; author identity is derived from the bearer token and this field will be removed in the next release.
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
 *         description: Validation error (empty content or content too long)
 *       401:
 *         description: Missing or invalid access token
 */
router.post(
  "/",
  authenticateAccessToken,
  asyncHandler(feedController.createPost),
);

export default router;
