import { Request, Response, NextFunction } from "express";
import { prisma } from "../lib/prisma";
import { hashPassword, comparePassword } from "../utils/password";
import { generateToken } from "../utils/jwt";
import { RegisterInput, LoginInput } from "../validators/auth.validator";

export const register = async (
  req: Request<unknown, unknown, RegisterInput>,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { username, email, password } = req.body;

    // Check for duplicate email
    const existingEmail = await prisma.user.findUnique({
      where: { email },
      select: { id: true },
    });

    if (existingEmail) {
      res.status(409).json({
        success: false,
        message: "An account with this email address already exists",
      });
      return;
    }

    // Check for duplicate username
    const existingUsername = await prisma.user.findUnique({
      where: { username },
      select: { id: true },
    });

    if (existingUsername) {
      res.status(409).json({
        success: false,
        message: "This username is already taken",
      });
      return;
    }

    // Hash password with bcrypt
    const passwordHash = await hashPassword(password);

    // Create user in database with safe fields returned
    const user = await prisma.user.create({
      data: {
        username,
        email,
        passwordHash,
      },
      select: {
        id: true,
        username: true,
        email: true,
        avatarUrl: true,
        createdAt: true,
      },
    });

    // Generate signed JWT token
    const token = generateToken({ userId: user.id });

    res.status(201).json({
      success: true,
      message: "User registered successfully",
      user,
      token,
    });
  } catch (error) {
    next(error);
  }
};

export const login = async (
  req: Request<unknown, unknown, LoginInput>,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { email, password } = req.body;

    // Find user by normalized email
    const user = await prisma.user.findUnique({
      where: { email },
    });

    // Generic error message prevents account enumeration
    if (!user) {
      res.status(401).json({
        success: false,
        message: "Invalid email or password",
      });
      return;
    }

    // Verify password with bcrypt
    const isPasswordValid = await comparePassword(password, user.passwordHash);

    if (!isPasswordValid) {
      res.status(401).json({
        success: false,
        message: "Invalid email or password",
      });
      return;
    }

    // Generate signed JWT token
    const token = generateToken({ userId: user.id });

    // Safe user object excluding passwordHash
    const safeUser = {
      id: user.id,
      username: user.username,
      email: user.email,
      avatarUrl: user.avatarUrl,
      createdAt: user.createdAt,
    };

    res.status(200).json({
      success: true,
      message: "Login successful",
      user: safeUser,
      token,
    });
  } catch (error) {
    next(error);
  }
};

export const getMe = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    // req.user was populated safely by authenticateUser middleware
    res.status(200).json({
      success: true,
      user: req.user,
    });
  } catch (error) {
    next(error);
  }
};
