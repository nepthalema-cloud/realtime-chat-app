import { Router } from "express";
import { register, login, getMe } from "../controllers/auth.controller";
import { validate } from "../middleware/validate";
import { registerSchema, loginSchema } from "../validators/auth.validator";
import { authenticateUser } from "../middleware/auth";
import { authRateLimiter } from "../middleware/rateLimiter";

const router = Router();

// Registration
router.post("/register", authRateLimiter, validate(registerSchema), register);

// Login
router.post("/login", authRateLimiter, validate(loginSchema), login);

// Authenticated user profile
router.get("/me", authenticateUser, getMe);

export default router;
