import dotenv from "dotenv";
import path from "path";
import { z } from "zod";

// Load environment variables from .env
dotenv.config({ path: path.resolve(__dirname, "../../.env") });

export const DEV_JWT_FALLBACK = "dev_jwt_secret_key_evaluation_2026_secure";

export const envSchema = z
  .object({
    PORT: z.string().default("5000").transform((val) => parseInt(val, 10)),
    NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
    CLIENT_URL: z.string().default("http://localhost:5173"),
    DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
    DIRECT_URL: z.string().optional(),
    JWT_SECRET: z.string().optional(),
  })
  .transform((data) => {
    // In development and test modes, allow the fallback if unset
    const isDevOrTest = data.NODE_ENV === "development" || data.NODE_ENV === "test";
    const secret = data.JWT_SECRET || (isDevOrTest ? DEV_JWT_FALLBACK : "");
    return {
      ...data,
      JWT_SECRET: secret,
    };
  })
  .superRefine((data, ctx) => {
    if (data.NODE_ENV === "production") {
      if (!data.JWT_SECRET || data.JWT_SECRET.trim().length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["JWT_SECRET"],
          message: "JWT_SECRET is required in production",
        });
      } else if (data.JWT_SECRET.length < 32) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["JWT_SECRET"],
          message: "JWT_SECRET must be at least 32 characters in production",
        });
      } else if (data.JWT_SECRET === DEV_JWT_FALLBACK) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["JWT_SECRET"],
          message: "Default development fallback secret cannot be used in production",
        });
      }
    }
  });

const parsedEnv = envSchema.safeParse(process.env);

if (!parsedEnv.success) {
  console.error("❌ Invalid environment variables:", parsedEnv.error.format());
  process.exit(1);
}

export const env = parsedEnv.data;
