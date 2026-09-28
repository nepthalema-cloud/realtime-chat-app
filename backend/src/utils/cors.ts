import { env } from "../config/env";

export const isOriginAllowed = (origin: string | undefined): boolean => {
  // Allow requests without origin (curl, server-to-server, mobile native)
  if (!origin) return true;

  const normalizedOrigin = origin.trim().replace(/\/$/, "");

  // Development: allow localhost
  if (env.NODE_ENV === "development" || env.NODE_ENV === "test") {
    if (
      normalizedOrigin.startsWith("http://localhost:") ||
      normalizedOrigin.startsWith("http://127.0.0.1:")
    ) {
      return true;
    }
  }

  // Parse configured CLIENT_URL(s)
  const configuredOrigins = env.CLIENT_URL.split(",")
    .map((url) => url.trim().replace(/\/$/, ""))
    .filter(Boolean);

  // Exact match against configured origin(s)
  return configuredOrigins.includes(normalizedOrigin);
};
