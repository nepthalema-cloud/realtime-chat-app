import { envSchema, DEV_JWT_FALLBACK } from "./src/config/env";
import { isOriginAllowed } from "./src/utils/cors";

async function runM1M2SecurityTests() {
  console.log("==================================================");
  console.log("🔒 VERIFYING M-1 (CORS) AND M-2 (JWT_SECRET) FIXES");
  console.log("==================================================\n");

  let passed = 0;
  let total = 0;

  function assert(condition: boolean, testName: string, detail?: string) {
    total++;
    if (condition) {
      passed++;
      console.log(`✓ [PASS] ${testName}`);
    } else {
      console.error(`❌ [FAIL] ${testName} - ${detail || "Condition not met"}`);
      throw new Error(`Test failed: ${testName}`);
    }
  }

  // --- Part 1: M-2 JWT_SECRET Validation Tests ---
  console.log("--- Part 1: M-2 (JWT_SECRET Environment Validation) ---");

  // Test 1.1: Missing JWT_SECRET in production must fail
  const missingProd = envSchema.safeParse({
    PORT: "5000",
    NODE_ENV: "production",
    DATABASE_URL: "postgresql://user:pass@localhost:5432/db",
    CLIENT_URL: "https://my-chat-app.vercel.app",
    JWT_SECRET: "",
  });
  assert(
    !missingProd.success &&
      JSON.stringify(missingProd.error.format()).includes("JWT_SECRET is required in production"),
    "Production with missing/empty JWT_SECRET correctly rejected"
  );

  // Test 1.2: Known development secret in production must fail
  const devSecretInProd = envSchema.safeParse({
    PORT: "5000",
    NODE_ENV: "production",
    DATABASE_URL: "postgresql://user:pass@localhost:5432/db",
    CLIENT_URL: "https://my-chat-app.vercel.app",
    JWT_SECRET: DEV_JWT_FALLBACK,
  });
  assert(
    !devSecretInProd.success &&
      JSON.stringify(devSecretInProd.error.format()).includes(
        "Default development fallback secret cannot be used in production"
      ),
    "Production with known development fallback secret correctly rejected"
  );

  // Test 1.3: Secret shorter than 32 characters in production must fail
  const shortSecretProd = envSchema.safeParse({
    PORT: "5000",
    NODE_ENV: "production",
    DATABASE_URL: "postgresql://user:pass@localhost:5432/db",
    CLIENT_URL: "https://my-chat-app.vercel.app",
    JWT_SECRET: "short_secret_under_32_chars!",
  });
  assert(
    !shortSecretProd.success &&
      JSON.stringify(shortSecretProd.error.format()).includes(
        "JWT_SECRET must be at least 32 characters in production"
      ),
    "Production with short (<32 chars) JWT_SECRET correctly rejected"
  );

  // Test 1.4: Valid 32+ character high-entropy secret in production must pass
  const validProd = envSchema.safeParse({
    PORT: "5000",
    NODE_ENV: "production",
    DATABASE_URL: "postgresql://user:pass@localhost:5432/db",
    CLIENT_URL: "https://my-chat-app.vercel.app",
    JWT_SECRET: "super_strong_production_secret_key_exceeding_32_characters_12345",
  });
  assert(
    validProd.success &&
      validProd.data.JWT_SECRET ===
        "super_strong_production_secret_key_exceeding_32_characters_12345",
    "Production with valid 32+ character secret correctly passes"
  );

  // Test 1.5: Development mode without JWT_SECRET safely uses dev fallback
  const devDefault = envSchema.safeParse({
    PORT: "5000",
    NODE_ENV: "development",
    DATABASE_URL: "postgresql://user:pass@localhost:5432/db",
  });
  assert(
    devDefault.success && devDefault.data.JWT_SECRET === DEV_JWT_FALLBACK,
    "Development mode without JWT_SECRET safely falls back to local dev secret"
  );

  // --- Part 2: M-1 CORS Origin Validation Tests ---
  console.log("\n--- Part 2: M-1 (CORS Origin Validation) ---");

  // In active dev/test environment:
  // Test 2.1: localhost should be allowed
  assert(
    isOriginAllowed("http://localhost:5173") === true,
    "Localhost (http://localhost:5173) is allowed in development/test"
  );
  assert(
    isOriginAllowed("http://localhost:3000") === true,
    "Localhost on alternative port is allowed in development/test"
  );
  assert(
    isOriginAllowed("http://127.0.0.1:5173") === true,
    "127.0.0.1 loopback is allowed in development/test"
  );

  // Test 2.2: Requests without origin (curl / server-to-server) should be allowed
  assert(
    isOriginAllowed(undefined) === true,
    "Requests without origin header (server-to-server / curl) are allowed"
  );

  // Test 2.3: Unrelated *.vercel.app domain MUST BE REJECTED
  assert(
    isOriginAllowed("https://evil-phishing.vercel.app") === false,
    "Unrelated *.vercel.app domain (https://evil-phishing.vercel.app) is strictly REJECTED"
  );

  // Test 2.4: Arbitrary unknown domain MUST BE REJECTED
  assert(
    isOriginAllowed("https://attacker-controlled-site.com") === false,
    "Arbitrary external origin (https://attacker-controlled-site.com) is strictly REJECTED"
  );

  console.log("\n==================================================");
  console.log(`🎉 ALL ${passed} / ${total} M-1 AND M-2 TESTS PASSED!`);
  console.log("==================================================");
}

runM1M2SecurityTests().catch((err) => {
  console.error("❌ M-1 / M-2 TESTS FAILED:", err);
  process.exit(1);
});
