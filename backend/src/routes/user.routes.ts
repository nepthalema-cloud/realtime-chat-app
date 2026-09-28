import { Router } from "express";
import { getUsers } from "../controllers/user.controller";
import { authenticateUser } from "../middleware/auth";

const router = Router();

// Discover users for chat (authenticated users only)
router.get("/", authenticateUser, getUsers);

export default router;
