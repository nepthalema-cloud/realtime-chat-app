import io, { Socket } from "socket.io-client";
import { prisma } from "./src/lib/prisma";

const BASE_URL = "http://localhost:5000";

async function runRealtimeUnreadTest() {
  console.log("==================================================");
  console.log("🧪 TESTING REALTIME TELEGRAM UNREAD COUNT (SOCKET.IO)");
  console.log("==================================================\n");

  const ts = Date.now();
  const password = "Password123!";

  // 1. Register Alice and Bob
  const regAlice = await (
    await fetch(`${BASE_URL}/api/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: `alice_rt_${ts}`, email: `alice_rt_${ts}@test.com`, password }),
    })
  ).json();

  const regBob = await (
    await fetch(`${BASE_URL}/api/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: `bob_rt_${ts}`, email: `bob_rt_${ts}@test.com`, password }),
    })
  ).json();

  const alice = regAlice.user;
  const bob = regBob.user;
  const aliceToken = regAlice.token;
  const bobToken = regBob.token;

  // 2. Create conversation
  const convRes = await (
    await fetch(`${BASE_URL}/api/conversations`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${aliceToken}` },
      body: JSON.stringify({ recipientId: bob.id }),
    })
  ).json();
  const conversationId = convRes.conversation.id;

  // 3. Connect Bob's Socket (simulating client ChatContext)
  const bobSocket = io(BASE_URL, {
    auth: { token: bobToken },
    transports: ["websocket"],
  });
  await new Promise<void>((res) => bobSocket.on("connect", () => res()));

  // Simulate Bob's client unread counter state
  let bobClientUnread = 0;
  let isViewing = false;

  bobSocket.on("message:new", (msg) => {
    if (msg.conversationId === conversationId && msg.senderId !== bob.id) {
      if (!isViewing) {
        bobClientUnread += 1;
      }
    }
  });

  const aliceSocket = io(BASE_URL, {
    auth: { token: aliceToken },
    transports: ["websocket"],
  });
  await new Promise<void>((res) => aliceSocket.on("connect", () => res()));
  await new Promise<void>((res) => aliceSocket.emit("conversation:join", { conversationId }, () => res()));

  const aliceSend = async (content: string) => {
    await new Promise<void>((resolve) => {
      aliceSocket.emit("message:send", { conversationId, content }, () => resolve());
    });
    await new Promise((r) => setTimeout(r, 100)); // wait for socket event
  };

  const getAuthoritativeBobUnread = async (): Promise<number> => {
    const res = await (
      await fetch(`${BASE_URL}/api/conversations`, {
        headers: { Authorization: `Bearer ${bobToken}` },
      })
    ).json();
    const conv = res.conversations.find((c: any) => c.id === conversationId);
    return conv ? conv.unreadCount : 0;
  };

  // Step 1: Alice sends messages 1–5
  console.log("Step 1: Alice sends messages 1–5");
  for (let i = 1; i <= 5; i++) {
    await aliceSend(`Msg ${i}`);
  }
  let authCount = await getAuthoritativeBobUnread();
  console.log(`Bob unread (Client state: ${bobClientUnread}, PostgreSQL authoritative: ${authCount})`);
  if (bobClientUnread !== 5 || authCount !== 5) {
    throw new Error(`Expected 5, got client=${bobClientUnread}, db=${authCount}`);
  }

  // Step 2: Bob reads through message 5
  console.log("Step 2: Bob reads through message 5");
  await new Promise<void>((resolve) => {
    bobSocket.emit("conversation:read", { conversationId }, () => resolve());
  });
  bobClientUnread = 0;
  authCount = await getAuthoritativeBobUnread();
  console.log(`Bob unread (Client state: ${bobClientUnread}, PostgreSQL authoritative: ${authCount})`);
  if (bobClientUnread !== 0 || authCount !== 0) {
    throw new Error(`Expected 0, got client=${bobClientUnread}, db=${authCount}`);
  }

  // Step 3: Alice sends messages 6–8
  console.log("Step 3: Alice sends messages 6–8");
  for (let i = 6; i <= 8; i++) {
    await aliceSend(`Msg ${i}`);
  }
  authCount = await getAuthoritativeBobUnread();
  console.log(`Bob unread (Client state: ${bobClientUnread}, PostgreSQL authoritative: ${authCount})`);
  if (bobClientUnread !== 3 || authCount !== 3) {
    throw new Error(`Expected 3 (NOT 8), got client=${bobClientUnread}, db=${authCount}`);
  }

  // Step 4: Alice sends messages 9–10
  console.log("Step 4: Alice sends messages 9–10");
  for (let i = 9; i <= 10; i++) {
    await aliceSend(`Msg ${i}`);
  }
  authCount = await getAuthoritativeBobUnread();
  console.log(`Bob unread (Client state: ${bobClientUnread}, PostgreSQL authoritative: ${authCount})`);
  if (bobClientUnread !== 5 || authCount !== 5) {
    throw new Error(`Expected 5, got client=${bobClientUnread}, db=${authCount}`);
  }

  // Step 5: Bob opens/reads through message 10
  console.log("Step 5: Bob opens/reads through message 10");
  await new Promise<void>((resolve) => {
    bobSocket.emit("conversation:read", { conversationId }, () => resolve());
  });
  bobClientUnread = 0;
  authCount = await getAuthoritativeBobUnread();
  console.log(`Bob unread (Client state: ${bobClientUnread}, PostgreSQL authoritative: ${authCount})`);
  if (bobClientUnread !== 0 || authCount !== 0) {
    throw new Error(`Expected 0, got client=${bobClientUnread}, db=${authCount}`);
  }

  // Step 6: Alice sends message 11
  console.log("Step 6: Alice sends message 11");
  await aliceSend("Msg 11");
  authCount = await getAuthoritativeBobUnread();
  console.log(`Bob unread (Client state: ${bobClientUnread}, PostgreSQL authoritative: ${authCount})`);
  if (bobClientUnread !== 1 || authCount !== 1) {
    throw new Error(`Expected 1, got client=${bobClientUnread}, db=${authCount}`);
  }

  aliceSocket.disconnect();
  bobSocket.disconnect();

  console.log("\n==================================================");
  console.log("🎉 ALL REALTIME & POSTGRESQL UNREAD CHECKS PASSED!");
  console.log("==================================================");
}

runRealtimeUnreadTest()
  .catch((err) => {
    console.error("❌ TEST FAILED:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
