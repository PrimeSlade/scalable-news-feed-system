import { Router } from "express";
import { authenticateAccessToken } from "../../middleware/authenticate";
import { asyncHandler } from "../../utils/async-handler";
import * as authController from "./auth.controller";

const router = Router();

/**
 * @openapi
 * /v1/me:
 *   get:
 *     summary: Get the authenticated user's profile
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200: { description: Safe current-user profile }
 *       401: { description: Missing or invalid access token }
 */
router.get("/", authenticateAccessToken, asyncHandler(authController.me));

export default router;
