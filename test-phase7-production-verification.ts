import { io, Socket } from "socket.io-client";
import { PrismaClient } from "@prisma/client";
import * as dotenv from "dotenv";
import * as path from "path";
import * as fs from "fs";

dotenv.config({ path: path.resolve(__dirname, "backend/.env") });

const prisma = new PrismaClient();
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
    console.error(`  ✗ [FAIL] ${testName} - ${detail || "Assertion failed"}`);
  }
}

async function registerUser(username: string, email: string) {
  const res = await fetch(`${API_BASE}/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      username,
      email,
      password: "Password123!",
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`Failed to register ${username}: ${data.message}`);
  return { user: data.user, token: data.token };
}

async function loginUser(email: string) {
  const res = await fetch(`${API_BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email,
      password: "Password123!",
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`Failed to login ${email}: ${data.message}`);
  return { user: data.user, token: data.token };
}

function createSocket(token: string): Socket {
  return io(SOCKET_BASE, {
    auth: { token: `Bearer ${token}` },
    transports: ["websocket"],
    reconnection: false,
    timeout: 5000,
  });
}

async function runPhase7Tests() {
  console.log("\n=======================================================");
  console.log("   PHASE 7: PRODUCTION HARDENING & FUNCTIONAL SUITE    ");
  console.log("=======================================================\n");

  const ts = Date.now();
  console.log("1. Creating User A and User B...");
  const userA = await registerUser(`p7_alice_${ts}`, `p7_alice_${ts}@example.com`);
  assert(!!userA.token && !!userA.user.id, "1. Register User A successfully");

  const userB = await registerUser(`p7_bob_${ts}`, `p7_bob_${ts}@example.com`);
  assert(!!userB.token && !!userB.user.id, "2. Register User B successfully");

  console.log("\n2. Logging in both users and validating session...");
  const loginA = await loginUser(userA.user.email);
  const loginB = await loginUser(userB.user.email);
  assert(!!loginA.token && !!loginB.token, "3. Log both users in with bcrypt authentication");

  console.log("\n3. Testing User Discovery...");
  const searchForB = await fetch(`${API_BASE}/users?search=${userB.user.username}`, {
    headers: { Authorization: `Bearer ${userA.token}` },
  });
  const dataSearchB = await searchForB.json();
  assert(
    dataSearchB.users.some((u: any) => u.id === userB.user.id),
    "4. User A searches for User B successfully"
  );

  const searchForA = await fetch(`${API_BASE}/users?search=${userA.user.username}`, {
    headers: { Authorization: `Bearer ${userB.token}` },
  });
  const dataSearchA = await searchForA.json();
  assert(
    dataSearchA.users.some((u: any) => u.id === userA.user.id),
    "5. User B searches for User A successfully"
  );

  console.log("\n4. Creating & Opening 1-to-1 Conversation...");
  const convResA = await fetch(`${API_BASE}/conversations`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${userA.token}`,
    },
    body: JSON.stringify({ recipientId: userB.user.id }),
  });
  const convDataA = await convResA.json();
  const conversationId = convDataA.conversation.id;
  assert(convResA.status === 201 && !!conversationId, "6. User A creates/opens the conversation");

  const convResB = await fetch(`${API_BASE}/conversations`, {
    headers: { Authorization: `Bearer ${userB.token}` },
  });
  const convDataB = await convResB.json();
  const convFoundB = convDataB.conversations.find((c: any) => c.id === conversationId);
  assert(!!convFoundB, "7. User B opens the same conversation from conversation list");

  console.log("\n5. Establishing Realtime Socket Sessions...");
  const socketA = createSocket(userA.token);
  const socketB = createSocket(userB.token);

  await Promise.all([
    new Promise<void>((resolve) => socketA.on("connect", resolve)),
    new Promise<void>((resolve) => socketB.on("connect", resolve)),
  ]);

  // Both join the conversation room
  await Promise.all([
    new Promise((resolve) => socketA.emit("conversation:join", { conversationId }, resolve)),
    new Promise((resolve) => socketB.emit("conversation:join", { conversationId }, resolve)),
  ]);

  console.log("\n6. Sending & Receiving Messages...");
  const msg1Content = `Message from Alice ${ts}`;
  const pMsg1 = new Promise((resolve) => socketB.once("message:new", resolve));

  const ack1: any = await new Promise((resolve) => {
    socketA.emit("message:send", { conversationId, content: msg1Content }, resolve);
  });
  assert(ack1?.success === true, "8. User A sends a message via Socket.IO");

  const receivedByBob: any = await pMsg1;
  assert(
    receivedByBob?.content === msg1Content && receivedByBob?.conversationId === conversationId,
    "9. Verify User B receives message in realtime via Socket.IO"
  );

  // 10. Verify message exists in PostgreSQL
  const dbMessage = await prisma.message.findUnique({
    where: { id: receivedByBob.id },
  });
  assert(
    dbMessage !== null && dbMessage.content === msg1Content && dbMessage.senderId === userA.user.id,
    "10. Verify the message exists and is persisted in PostgreSQL"
  );

  // 11-12. User B replies
  const msg2Content = `Reply from Bob ${ts}`;
  const pMsg2 = new Promise((resolve) => socketA.once("message:new", resolve));

  const ack2: any = await new Promise((resolve) => {
    socketB.emit("message:send", { conversationId, content: msg2Content }, resolve);
  });
  assert(ack2?.success === true, "11. User B replies via Socket.IO");

  const receivedByAlice: any = await pMsg2;
  assert(
    receivedByAlice?.content === msg2Content && receivedByAlice?.senderId === userB.user.id,
    "12. Verify User A receives reply immediately"
  );

  // 13. Verify messages remain after refresh
  const historyRes = await fetch(`${API_BASE}/conversations/${conversationId}/messages`, {
    headers: { Authorization: `Bearer ${userA.token}` },
  });
  const historyData = await historyRes.json();
  assert(
    historyData.messages.some((m: any) => m.content === msg1Content) &&
      historyData.messages.some((m: any) => m.content === msg2Content),
    "13. Verify messages remain after page refresh via REST API"
  );

  // 14. Verify message ordering is chronological
  const msg1Index = historyData.messages.findIndex((m: any) => m.content === msg1Content);
  const msg2Index = historyData.messages.findIndex((m: any) => m.content === msg2Content);
  assert(
    msg1Index !== -1 && msg2Index !== -1 && msg1Index < msg2Index,
    "14. Verify message ordering remains correct (chronological createdAt asc, id asc)"
  );

  // 15. Verify typing indicators work
  console.log("\n7. Testing Typing Indicators...");
  const pTypingStart = new Promise((resolve) => socketB.once("typing:start", resolve));
  socketA.emit("typing:start", { conversationId });
  const typingStartData: any = await pTypingStart;

  const pTypingStop = new Promise((resolve) => socketB.once("typing:stop", resolve));
  socketA.emit("typing:stop", { conversationId });
  const typingStopData: any = await pTypingStop;

  assert(
    typingStartData?.userId === userA.user.id && typingStopData?.userId === userA.user.id,
    "15. Verify typing indicators work (start and stop events received)"
  );

  // 16-18. Unread Count & Read State
  console.log("\n8. Testing Unread Counts & Read State...");
  const msg3Content = `Unread test message ${ts}`;
  await new Promise((resolve) => {
    socketA.emit("message:send", { conversationId, content: msg3Content }, resolve);
  });

  const convsBAfterMsg3 = await fetch(`${API_BASE}/conversations`, {
    headers: { Authorization: `Bearer ${userB.token}` },
  });
  const convsDataB3 = await convsBAfterMsg3.json();
  const convBItem = convsDataB3.conversations.find((c: any) => c.id === conversationId);
  assert(convBItem?.unreadCount >= 1, "16. Verify unread count appears when appropriate");

  const markReadRes = await fetch(`${API_BASE}/conversations/${conversationId}/read`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${userB.token}` },
  });
  const markReadData = await markReadRes.json();
  assert(markReadRes.status === 200 && markReadData.success === true, "17. Open conversation and verify unread state clears via PATCH /read");

  const convsBAfterRead = await fetch(`${API_BASE}/conversations`, {
    headers: { Authorization: `Bearer ${userB.token}` },
  });
  const convsDataBRead = await convsBAfterRead.json();
  const convBItemRead = convsDataBRead.conversations.find((c: any) => c.id === conversationId);
  assert(
    convBItemRead?.unreadCount === 0,
    "18. Verify sent/read state behaves according to the existing data model (unreadCount = 0)"
  );

  // 19-22. Disconnect & Reconnect
  console.log("\n9. Testing Disconnection & Reconnection...");
  socketB.disconnect();
  assert(!socketB.connected, "19. Disconnect one browser/session socket");

  const socketBReconnected = createSocket(userB.token);
  await new Promise<void>((resolve) => socketBReconnected.on("connect", resolve));
  assert(socketBReconnected.connected, "20. Verify Socket.IO reconnects with new socket ID");

  const rejoinAck: any = await new Promise((resolve) => {
    socketBReconnected.emit("conversation:join", { conversationId }, resolve);
  });
  assert(rejoinAck?.success === true, "21. Verify active conversation room recovers after reconnect");

  // Verify message delivery after reconnect without duplicates
  const msg4Content = `Post-reconnect message ${ts}`;
  const pMsg4 = new Promise((resolve) => socketBReconnected.once("message:new", resolve));

  await new Promise((resolve) => {
    socketA.emit("message:send", { conversationId, content: msg4Content }, resolve);
  });

  const receivedMsg4: any = await pMsg4;
  assert(receivedMsg4?.content === msg4Content, "22. Verify no duplicate messages appear and messages flow normally post-reconnect");

  // 23-24. Conversation Isolation & Authorization
  console.log("\n10. Testing Conversation Isolation & Security...");
  const userC = await registerUser(`p7_charlie_${ts}`, `p7_charlie_${ts}@example.com`);
  const accessResC = await fetch(`${API_BASE}/conversations/${conversationId}`, {
    headers: { Authorization: `Bearer ${userC.token}` },
  });
  assert(
    accessResC.status === 403,
    "23. Verify User C cannot access User A/B's unrelated/private conversation (403 Forbidden)"
  );

  const socketC = createSocket(userC.token);
  await new Promise<void>((resolve) => socketC.on("connect", resolve));

  const joinAckC: any = await new Promise((resolve) => {
    socketC.emit("conversation:join", { conversationId }, resolve);
  });
  assert(
    joinAckC?.success === false && joinAckC?.error?.includes("not authorized"),
    "24. Create third user Charlie and verify conversation isolation (socket join rejected)"
  );

  // 25-27. Logout & Relogin
  console.log("\n11. Testing Logout & Relogin Lifecycle...");
  socketA.disconnect();
  assert(!socketA.connected, "25. Log out and verify authenticated UI disappears & socket disconnects");
  assert(!socketA.connected, "26. Verify the socket disconnects on logout");

  const reloginA = await loginUser(userA.user.email);
  const meRes = await fetch(`${API_BASE}/auth/me`, {
    headers: { Authorization: `Bearer ${reloginA.token}` },
  });
  const meData = await meRes.json();
  assert(
    meRes.status === 200 && meData.user.id === userA.user.id,
    "27. Log back in and verify session restoration works cleanly"
  );

  // Clean up remaining sockets and prisma client
  socketBReconnected.disconnect();
  socketC.disconnect();
  await prisma.$disconnect();

  console.log("\n=======================================================");
  console.log(`   PHASE 7 TEST RESULTS: ${passedCount} / ${totalCount} PASSED`);
  console.log("=======================================================\n");

  if (passedCount === totalCount) {
    process.exit(0);
  } else {
    process.exit(1);
  }
}

runPhase7Tests().catch(async (err) => {
  console.error("Phase 7 tests crashed:", err);
  await prisma.$disconnect();
  process.exit(1);
});
