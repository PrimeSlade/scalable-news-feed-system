import { Router } from "express";
import * as feedController from "./feed.controller";

const router = Router();

/**
 * @openapi
 * /v1/me/feed:
 *   get:
 *     summary: Get user feed
 *     description: Returns a cursor-paginated feed of posts for the authenticated user.
 *     tags: [Feed]
 *     parameters:
 *       - in: query
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *         description: The user ID
 *       - in: query
 *         name: cursor
 *         required: false
 *         schema:
 *           type: string
 *         description: Composite cursor from previous page (timestamp_postId)
 *       - in: query
 *         name: limit
 *         required: false
 *         schema:
 *           type: number
 *           default: 20
 *           maximum: 100
 *         description: Number of posts to return (max 100)
 *     responses:
 *       200:
 *         description: Feed retrieved successfully
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
 *                     posts:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: string
 *                           authorId:
 *                             type: string
 *                           content:
 *                             type: string
 *                           createdAt:
 *                             type: string
 *                             format: date-time
 *                 pagination:
 *                   type: object
 *                   properties:
 *                     limit:
 *                       type: number
 *                     hasMore:
 *                       type: boolean
 *                     nextCursor:
 *                       type: string
 *                       description: Composite cursor (timestamp_postId) for next page
 *       400:
 *         description: Validation error (missing userId, invalid limit)
 */
router.get("/feed", feedController.getFeed);

export default router;
