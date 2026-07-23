import { Router } from "express";
import { asyncHandler } from "../../utils/async-handler";
import * as authController from "./auth.controller";

const router = Router();

/**
 * @openapi
 * /v1/auth/register:
 *   post:
 *     summary: Register and sign in
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [username, displayName, password]
 *             properties:
 *               username: { type: string }
 *               displayName: { type: string }
 *               password: { type: string, format: password, minLength: 12 }
 *     responses:
 *       201: { description: Account and session created }
 *       400: { description: Invalid registration input }
 *       409: { description: Username unavailable }
 */
router.post("/register", asyncHandler(authController.register));

/**
 * @openapi
 * /v1/auth/login:
 *   post:
 *     summary: Sign in
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [username, password]
 *             properties:
 *               username: { type: string }
 *               password: { type: string, format: password }
 *     responses:
 *       200: { description: Access token returned and refresh cookie set }
 *       401: { description: Invalid credentials }
 */
router.post("/login", asyncHandler(authController.login));

/**
 * @openapi
 * /v1/auth/refresh:
 *   post:
 *     summary: Rotate the refresh session
 *     tags: [Auth]
 *     parameters:
 *       - in: header
 *         name: Origin
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: New access token returned and refresh cookie rotated }
 *       401: { description: Invalid or replayed refresh token }
 *       403: { description: Origin is not allowed }
 */
router.post("/refresh", asyncHandler(authController.refresh));

/**
 * @openapi
 * /v1/auth/logout:
 *   post:
 *     summary: Revoke the current refresh session
 *     tags: [Auth]
 *     parameters:
 *       - in: header
 *         name: Origin
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       204: { description: Refresh cookie cleared }
 *       403: { description: Origin is not allowed }
 */
router.post("/logout", asyncHandler(authController.logout));

export default router;
