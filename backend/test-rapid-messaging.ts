import io, { Socket } from "socket.io-client";
import { prisma } from "./src/lib/prisma";

const BASE_URL = "http://localhost:5000";

async function runRapidMessagingTest() {
  console.log("==================================================");
  console.log("🚀 TESTING RAPID SENDING & PERSISTENCE RECONCILIATION");
  console.log("==================================================\n");

  const ts = Date.now();
  const password = "Password123!";

  // 1. Register Alice and Bob
  const regAlice = await (
    await fetch(`${BASE_URL}/api/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: `alice_rpd_${ts}`, email: `alice_rpd_${ts}@test.com`, password }),
    })
  ).json();

  const regBob = await (
    await fetch(`${BASE_URL}/api/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: `bob_rpd_${ts}`, email: `bob_rpd_${ts}@test.com`, password }),
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

  // 3. Connect Sockets for Alice and Bob
  const aliceSocket = io(BASE_URL, { auth: { token: aliceToken }, transports: ["websocket"] });
  const bobSocket = io(BASE_URL, { auth: { token: bobToken }, transports: ["websocket"] });

  await Promise.all([
    new Promise<void>((r) => aliceSocket.on("connect", () => r())),
    new Promise<void>((r) => bobSocket.on("connect", () => r())),
  ]);

  await Promise.all([
    new Promise<void>((r) => aliceSocket.emit("conversation:join", { conversationId }, () => r())),
    new Promise<void>((r) => bobSocket.emit("conversation:join", { conversationId }, () => r())),
  ]);

  const bobReceivedMessages: any[] = [];
  bobSocket.on("message:new", (msg) => {
    bobReceivedMessages.push(msg);
  });

  // Test 1: Rapid send simulation (Alice sends 5 messages without waiting for prior acks)
  console.log("Step 1: Alice fires 5 messages in rapid succession (sequential typing)...");
  const rapidContents = [
    `Rapid message 1 - ${Date.now()}`,
    `Rapid message 2 - ${Date.now()}`,
    `Rapid message 3 - ${Date.now()}`,
    `Rapid message 4 - ${Date.now()}`,
    `Rapid message 5 - ${Date.now()}`,
  ];

  const acks: any[] = [];
  for (const content of rapidContents) {
    aliceSocket.emit("message:send", { conversationId, content }, (ack: any) => {
      acks.push(ack);
    });
    // Tiny delay between rapid keystrokes/sends
    await new Promise((r) => setTimeout(r, 150));
  }

  // Wait for all acks to arrive
  let waitCount = 0;
  while (acks.length < 5 && waitCount < 30) {
    await new Promise((r) => setTimeout(r, 100));
    waitCount++;
  }

  // Verify all acks succeeded
  for (let i = 0; i < acks.length; i++) {
    if (!acks[i].success || !acks[i].message) {
      throw new Error(`Ack failed for message ${i + 1}: ${acks[i].error}`);
    }
  }
  console.log("✓ All 5 rapid messages acknowledged with persistent IDs");

  // Wait for Socket.IO delivery to Bob
  let bobWait = 0;
  while (bobReceivedMessages.length < 5 && bobWait < 30) {
    await new Promise((r) => setTimeout(r, 100));
    bobWait++;
  }

  if (bobReceivedMessages.length < 5) {
    throw new Error(`Expected at least 5 messages for Bob, got ${bobReceivedMessages.length}`);
  }
  console.log("✓ Bob received all 5 rapid messages in realtime via Socket.IO");

  // Verify PostgreSQL persistence
  const dbMessages = await prisma.message.findMany({
    where: { conversationId },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });

  if (dbMessages.length !== 5) {
    throw new Error(`PostgreSQL persistence mismatch: expected 5 messages, found ${dbMessages.length}`);
  }
  for (let i = 0; i < 5; i++) {
    if (dbMessages[i].content !== rapidContents[i]) {
      throw new Error(`Message order mismatch: expected "${rapidContents[i]}", got "${dbMessages[i].content}"`);
    }
  }
  console.log("✓ All 5 messages confirmed committed and ordered correctly in PostgreSQL");

  // Test 2: Error recovery test (sending empty content or invalid payload must reject without crash)
  console.log("\nStep 2: Testing error recovery behavior on invalid send...");
  const errorAck = await new Promise<any>((resolve) => {
    aliceSocket.emit("message:send", { conversationId, content: "   " }, (ack: any) => {
      resolve(ack);
    });
  });

  if (errorAck.success) {
    throw new Error("Expected failure on empty content, but send succeeded!");
  }
  console.log(`✓ Rejected invalid message correctly with error: "${errorAck.error}"`);

  aliceSocket.disconnect();
  bobSocket.disconnect();

  console.log("\n==================================================");
  console.log("🎉 RAPID MESSAGING & ERROR RECOVERY VERIFIED!");
  console.log("==================================================");
}

runRapidMessagingTest()
  .catch((err) => {
    console.error("❌ TEST FAILED:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
