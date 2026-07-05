import { Router } from "express";
import * as feedController from "./feed.controller";

const router = Router();

router.post("/", feedController.createPost);

export default router;
