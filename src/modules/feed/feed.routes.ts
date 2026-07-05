import { Router } from "express";
import * as feedController from "./feed.controller";
import { asyncHandler } from "../../utils/async-handler";

const router = Router();

router.post("/", asyncHandler(feedController.createPost));

export default router;
