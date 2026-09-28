import io, { Socket } from "socket.io-client";
import { prisma } from "./src/lib/prisma";

const BASE_URL = "http://localhost:5000";

async function runRegressionSuite() {
  console.log("==================================================");
  console.log("🔍 RUNNING COMPLETE REGRESSION SUITE (PHASES 5, 6, 7)");
  console.log("==================================================\n");

  const ts = Date.now();
  const userA_Name = `user_a_${ts}`;
  const userB_Name = `user_b_${ts}`;
  const userC_Name = `user_c_${ts}`;
  const password = "Password123!";

  // ----------------------------------------------------
  // Phase 5 Regression: Authentication & User API
  // ----------------------------------------------------
  console.log("--- 1. Phase 5 Regression: Authentication & Profile ---");

  // Register User A
  const regResA = await fetch(`${BASE_URL}/api/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: userA_Name, email: `${userA_Name}@test.com`, password }),
  });
  const regDataA = await regResA.json();
  if (!regDataA.success || !regDataA.token) {
    throw new Error("Phase 5 regression failed: Registration A unsuccessful");
  }
  const tokenA = regDataA.token;
  const userA = regDataA.user;

  // Register User B
  const regResB = await fetch(`${BASE_URL}/api/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: userB_Name, email: `${userB_Name}@test.com`, password }),
  });
  const regDataB = await regResB.json();
  const tokenB = regDataB.token;
  const userB = regDataB.user;

  // Register User C (for isolation testing)
  const regResC = await fetch(`${BASE_URL}/api/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: userC_Name, email: `${userC_Name}@test.com`, password }),
  });
  const tokenC = (await regResC.json()).token;

  // Test Profile me endpoint
  const meRes = await fetch(`${BASE_URL}/api/auth/me`, {
    headers: { Authorization: `Bearer ${tokenA}` },
  });
  const meData = await meRes.json();
  if (!meData.success || meData.user.id !== userA.id) {
    throw new Error("Phase 5 regression failed: /api/auth/me mismatch");
  }

  // Test User search
  const searchRes = await fetch(`${BASE_URL}/api/users?search=${userB_Name}`, {
    headers: { Authorization: `Bearer ${tokenA}` },
  });
  const searchData = await searchRes.json();
  if (!searchData.success || !searchData.users.some((u: any) => u.id === userB.id)) {
    throw new Error("Phase 5 regression failed: User search did not find user B");
  }
  console.log("✓ Phase 5 Authentication, Profile, and User Discovery passed.");

  // ----------------------------------------------------
  // Phase 6 Regression: Conversation & Realtime Messaging
  // ----------------------------------------------------
  console.log("\n--- 2. Phase 6 Regression: Conversation & Realtime Engine ---");

  // Create conversation between A and B
  const convRes = await fetch(`${BASE_URL}/api/conversations`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${tokenA}`,
    },
    body: JSON.stringify({ recipientId: userB.id }),
  });
  const convData = await convRes.json();
  const conversationId = convData.conversation.id;

  // Connect sockets for A and B
  const socketA = io(BASE_URL, {
    auth: { token: tokenA },
    transports: ["websocket"],
    reconnection: false,
  });
  const socketB = io(BASE_URL, {
    auth: { token: tokenB },
    transports: ["websocket"],
    reconnection: false,
  });

  await Promise.all([
    new Promise<void>((res) => socketA.on("connect", () => res())),
    new Promise<void>((res) => socketB.on("connect", () => res())),
  ]);

  // Join room for A and B
  await Promise.all([
    new Promise<void>((res) => socketA.emit("conversation:join", { conversationId }, () => res())),
    new Promise<void>((res) => socketB.emit("conversation:join", { conversationId }, () => res())),
  ]);

  // Test realtime message sending and delivery
  let receivedByB: any = null;
  socketB.on("message:new", (msg) => {
    receivedByB = msg;
  });

  const testContent = "Phase 6 regression message: " + Date.now();
  await new Promise<void>((res) => {
    socketA.emit("message:send", { conversationId, content: testContent }, (ack: any) => {
      if (!ack.success) throw new Error("Phase 6 regression failed: message send rejected");
      res();
    });
  });

  await new Promise((r) => setTimeout(r, 250));
  if (!receivedByB || receivedByB.content !== testContent) {
    throw new Error("Phase 6 regression failed: realtime delivery to B failed");
  }
  console.log("✓ Phase 6 Realtime socket messaging passed.");

  // ----------------------------------------------------
  // Phase 7 Regression: Production Hardening, Concurrency & Security
  // ----------------------------------------------------
  console.log("\n--- 3. Phase 7 Regression: Authorization & Persistence Hardening ---");

  // Unauthorized access check: User C trying to view conversation A-B
  const unauthRes = await fetch(`${BASE_URL}/api/conversations/${conversationId}/messages`, {
    headers: { Authorization: `Bearer ${tokenC}` },
  });
  if (unauthRes.status !== 403) {
    throw new Error(`Phase 7 regression failed: expected 403, got ${unauthRes.status}`);
  }

  // Database persistence check: query direct Prisma
  const dbMessages = await prisma.message.findMany({
    where: { conversationId },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });
  if (dbMessages.length === 0 || dbMessages[dbMessages.length - 1].content !== testContent) {
    throw new Error("Phase 7 regression failed: Message not persisted in PostgreSQL");
  }

  // Concurrency check: concurrent conversation creations between same pair
  const [conc1, conc2] = await Promise.all([
    fetch(`${BASE_URL}/api/conversations`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${tokenA}` },
      body: JSON.stringify({ recipientId: userB.id }),
    }),
    fetch(`${BASE_URL}/api/conversations`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${tokenB}` },
      body: JSON.stringify({ recipientId: userA.id }),
    }),
  ]);
  const concData1 = await conc1.json();
  const concData2 = await conc2.json();
  if (concData1.conversation.id !== concData2.conversation.id) {
    throw new Error("Phase 7 concurrency regression failed: duplicate conversation created!");
  }
  console.log("✓ Phase 7 Authorization, PostgreSQL Persistence, and Concurrency Locks passed.");

  socketA.disconnect();
  socketB.disconnect();

  console.log("\n==================================================");
  console.log("🎉 ALL PHASES 5, 6, 7 REGRESSION CHECKS PASSED!");
  console.log("==================================================");
}

runRegressionSuite()
  .catch((err) => {
    console.error("❌ REGRESSION SUITE FAILED:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
