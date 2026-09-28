import { io } from "socket.io-client";
import * as fs from "fs";
import * as path from "path";

const API_BASE = "http://localhost:5000/api";
const SOCKET_BASE = "http://localhost:5000";

let passedCount = 0;
let totalCount = 0;

function assert(condition: boolean, testName: string, detail?: string) {
  totalCount++;
  if (condition) {
    passedCount++;
    console.log(`  ✓ [PASS] ${testName}`);
  } else {
    console.error(`  ✗ [FAIL] ${testName} - ${detail || "Condition not met"}`);
  }
}

async function runTests() {
  console.log("\n=======================================================");
  console.log("   PHASE 5 INTEGRATION & CONTRACT VERIFICATION SUITE   ");
  console.log("=======================================================\n");

  const timestamp = Date.now();
  const testUser = {
    username: `p5_user_${timestamp}`,
    email: `p5_user_${timestamp}@example.com`,
    password: "Password123!",
  };

  let authToken = "";
  let authUserId = "";

  // 1. Registration - New user can register
  console.log("--- 1. Registration Tests ---");
  try {
    const regRes = await fetch(`${API_BASE}/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(testUser),
    });
    const regData = await regRes.json();
    assert(regRes.status === 201 && regData.success && !!regData.token, "1. New user can register successfully", `Status: ${regRes.status}`);
    authToken = regData.token;
    authUserId = regData.user?.id;
  } catch (err: any) {
    assert(false, "1. New user can register successfully", err.message);
  }

  // 2. Duplicate email produces useful error
  try {
    const dupEmailRes = await fetch(`${API_BASE}/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: `diff_${timestamp}`,
        email: testUser.email,
        password: "Password123!",
      }),
    });
    const dupEmailData = await dupEmailRes.json();
    assert(dupEmailRes.status === 409 && dupEmailData.message.includes("email"), "2. Duplicate email produces 409 error", `Status: ${dupEmailRes.status}`);
  } catch (err: any) {
    assert(false, "2. Duplicate email produces 409 error", err.message);
  }

  // 3. Duplicate username produces useful error
  try {
    const dupUserRes = await fetch(`${API_BASE}/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: testUser.username,
        email: `diff_${timestamp}@example.com`,
        password: "Password123!",
      }),
    });
    const dupUserData = await dupUserRes.json();
    assert(dupUserRes.status === 409 && dupUserData.message.includes("username"), "3. Duplicate username produces 409 error", `Status: ${dupUserRes.status}`);
  } catch (err: any) {
    assert(false, "3. Duplicate username produces 409 error", err.message);
  }

  // 4. Invalid registration input is handled
  try {
    const invalidRes = await fetch(`${API_BASE}/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: "ab", // too short (min 3)
        email: "not-an-email",
        password: "123", // too short (min 6)
      }),
    });
    const invalidData = await invalidRes.json();
    assert(invalidRes.status === 400 && Array.isArray(invalidData.errors), "4. Invalid registration input returns 400 validation error", `Status: ${invalidRes.status}`);
  } catch (err: any) {
    assert(false, "4. Invalid registration input returns 400 validation error", err.message);
  }

  // 5. Login - Valid credentials authenticate
  console.log("\n--- 2. Login & Authentication State Tests ---");
  try {
    const loginRes = await fetch(`${API_BASE}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: testUser.email,
        password: testUser.password,
      }),
    });
    const loginData = await loginRes.json();
    assert(loginRes.status === 200 && loginData.success && !!loginData.token, "5. Valid credentials authenticate successfully", `Status: ${loginRes.status}`);
  } catch (err: any) {
    assert(false, "5. Valid credentials authenticate successfully", err.message);
  }

  // 6. Login - Invalid credentials fail safely
  try {
    const failLoginRes = await fetch(`${API_BASE}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: testUser.email,
        password: "WrongPassword!",
      }),
    });
    const failLoginData = await failLoginRes.json();
    assert(failLoginRes.status === 401 && failLoginData.message === "Invalid email or password", "6. Invalid credentials fail with 401 safely", `Status: ${failLoginRes.status}`);
  } catch (err: any) {
    assert(false, "6. Invalid credentials fail with 401 safely", err.message);
  }

  // 7. Authenticated user information loads through /api/auth/me
  try {
    const meRes = await fetch(`${API_BASE}/auth/me`, {
      headers: { Authorization: `Bearer ${authToken}` },
    });
    const meData = await meRes.json();
    assert(meRes.status === 200 && meData.user?.id === authUserId && meData.user?.username === testUser.username, "7. Authenticated user information loads through /api/auth/me", `Status: ${meRes.status}`);
  } catch (err: any) {
    assert(false, "7. Authenticated user information loads through /api/auth/me", err.message);
  }

  // 8. Unauthenticated user cannot access protected endpoint
  console.log("\n--- 3. Protected State & Access Control ---");
  try {
    const unauthRes = await fetch(`${API_BASE}/auth/me`);
    assert(unauthRes.status === 401, "8. Unauthenticated request to protected endpoint is rejected with 401", `Status: ${unauthRes.status}`);
  } catch (err: any) {
    assert(false, "8. Unauthenticated request to protected endpoint is rejected with 401", err.message);
  }

  // 9. Invalid/expired token returns 401
  try {
    const invalidTokenRes = await fetch(`${API_BASE}/auth/me`, {
      headers: { Authorization: "Bearer invalid.token.payload" },
    });
    assert(invalidTokenRes.status === 401, "9. Invalid/expired token is rejected with 401", `Status: ${invalidTokenRes.status}`);
  } catch (err: any) {
    assert(false, "9. Invalid/expired token is rejected with 401", err.message);
  }

  // 10. Authenticated API requests include JWT (testing /api/users)
  try {
    const usersRes = await fetch(`${API_BASE}/users`, {
      headers: { Authorization: `Bearer ${authToken}` },
    });
    const usersData = await usersRes.json();
    assert(usersRes.status === 200 && Array.isArray(usersData.users), "10. Authenticated API request to /api/users succeeds with JWT", `Status: ${usersRes.status}`);
  } catch (err: any) {
    assert(false, "10. Authenticated API request to /api/users succeeds with JWT", err.message);
  }

  // 11. Authenticated API requests to /api/conversations
  try {
    const convRes = await fetch(`${API_BASE}/conversations`, {
      headers: { Authorization: `Bearer ${authToken}` },
    });
    const convData = await convRes.json();
    assert(convRes.status === 200 && Array.isArray(convData.conversations), "11. Authenticated API request to /api/conversations succeeds with JWT", `Status: ${convRes.status}`);
  } catch (err: any) {
    assert(false, "11. Authenticated API request to /api/conversations succeeds with JWT", err.message);
  }

  // 12. Socket.IO - Authenticated user connects
  console.log("\n--- 4. Socket.IO Foundation & Lifecycle Tests ---");
  await new Promise<void>((resolve) => {
    const socket = io(SOCKET_BASE, {
      auth: { token: `Bearer ${authToken}` },
      transports: ["websocket"],
      reconnection: false,
      timeout: 5000,
    });

    socket.on("connect", () => {
      assert(socket.connected && !!socket.id, "12. Authenticated user establishes Socket.IO connection", `Socket ID: ${socket.id}`);
      socket.disconnect();
      assert(!socket.connected, "13. Socket disconnects cleanly", "Clean disconnect verified");
      resolve();
    });

    socket.on("connect_error", (err) => {
      assert(false, "12. Authenticated user establishes Socket.IO connection", err.message);
      socket.disconnect();
      resolve();
    });
  });

  // 14. Socket.IO - Unauthenticated user connection rejected
  await new Promise<void>((resolve) => {
    const socket = io(SOCKET_BASE, {
      auth: {},
      transports: ["websocket"],
      reconnection: false,
      timeout: 5000,
    });

    socket.on("connect", () => {
      assert(false, "14. Unauthenticated socket connection is rejected", "Unexpected connection allowed");
      socket.disconnect();
      resolve();
    });

    socket.on("connect_error", (err) => {
      assert(err.message.includes("Authentication token is required"), "14. Unauthenticated socket connection is rejected", err.message);
      socket.disconnect();
      resolve();
    });
  });

  // 15. Socket.IO - Invalid JWT connection rejected
  await new Promise<void>((resolve) => {
    const socket = io(SOCKET_BASE, {
      auth: { token: "Bearer totally.fake.jwt" },
      transports: ["websocket"],
      reconnection: false,
      timeout: 5000,
    });

    socket.on("connect", () => {
      assert(false, "15. Invalid JWT socket connection is rejected", "Unexpected connection allowed");
      socket.disconnect();
      resolve();
    });

    socket.on("connect_error", (err) => {
      assert(err.message.includes("Invalid authentication token"), "15. Invalid JWT socket connection is rejected", err.message);
      socket.disconnect();
      resolve();
    });
  });

  // 16. Security audit - Inspect client code & environment variables
  console.log("\n--- 5. Security & Configuration Audit ---");
  const clientEnvPath = path.resolve(__dirname, "frontend/.env");
  const clientEnv = fs.existsSync(clientEnvPath) ? fs.readFileSync(clientEnvPath, "utf-8") : "";

  assert(!clientEnv.includes("JWT_SECRET"), "16. No JWT_SECRET in client environment file", "Verified frontend/.env");
  assert(!clientEnv.includes("DATABASE_URL"), "17. No DATABASE_URL in client environment file", "Verified frontend/.env");
  assert(!clientEnv.includes("DIRECT_URL"), "18. No DIRECT_URL in client environment file", "Verified frontend/.env");
  assert(clientEnv.includes("VITE_API_URL") && clientEnv.includes("VITE_SOCKET_URL"), "19. Client uses Vite environment variables VITE_API_URL and VITE_SOCKET_URL", "Verified frontend/.env");

  // Check client bundle does not contain JWT secret or database credentials
  const distDir = path.resolve(__dirname, "frontend/dist/assets");
  let foundSecretInBundle = false;
  if (fs.existsSync(distDir)) {
    const files = fs.readdirSync(distDir);
    for (const f of files) {
      if (f.endsWith(".js")) {
        const content = fs.readFileSync(path.join(distDir, f), "utf-8");
        if (content.includes("supersecret") || content.includes("DATABASE_URL") || content.includes("postgresql://")) {
          foundSecretInBundle = true;
        }
      }
    }
  }
  assert(!foundSecretInBundle, "20. Client production bundle contains no leaked secrets or backend credentials", "Scanned dist bundle");

  // Verify Phase 6 features NOT in client
  const clientSrc = fs.readdirSync(path.resolve(__dirname, "frontend/src"), { recursive: true }) as string[];
  const hasChatMessagesUI = clientSrc.some(f => f.includes("MessageList") || f.includes("MessageComposer") || f.includes("ChatRoom"));
  assert(!hasChatMessagesUI, "21. Phase 6 chat UI is strictly NOT implemented in frontend", "Verified frontend/src");

  console.log("\n=======================================================");
  console.log(`   TEST RESULTS: ${passedCount} / ${totalCount} PASSED`);
  console.log("=======================================================\n");

  if (passedCount === totalCount) {
    process.exit(0);
  } else {
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error("Test suite crashed:", err);
  process.exit(1);
});
