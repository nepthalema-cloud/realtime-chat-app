import { io, Socket } from "socket.io-client";
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

function createSocket(token: string): Socket {
  return io(SOCKET_BASE, {
    auth: { token: `Bearer ${token}` },
    transports: ["websocket"],
    reconnection: false,
    timeout: 5000,
  });
}

async function runPhase6Tests() {
  console.log("\n=======================================================");
  console.log("      PHASE 6: CHAT UI & REALTIME VERIFICATION SUITE   ");
  console.log("=======================================================\n");

  const ts = Date.now();
  console.log("Creating test users A, B, and C...");
  const userA = await registerUser(`p6_alice_${ts}`, `p6_alice_${ts}@example.com`);
  const userB = await registerUser(`p6_bob_${ts}`, `p6_bob_${ts}@example.com`);
  const userC = await registerUser(`p6_charlie_${ts}`, `p6_charlie_${ts}@example.com`);

  console.log(`User A: ${userA.user.username} (${userA.user.id})`);
  console.log(`User B: ${userB.user.username} (${userB.user.id})`);
  console.log(`User C: ${userC.user.username} (${userC.user.id})`);

  // A. User discovery
  console.log("\n--- A. User Discovery Tests ---");
  const usersResA = await fetch(`${API_BASE}/users?search=p6_`, {
    headers: { Authorization: `Bearer ${userA.token}` },
  });
  const usersDataA = await usersResA.json();
  const foundUserIds = usersDataA.users.map((u: any) => u.id);

  assert(
    !foundUserIds.includes(userA.user.id),
    "A1. Current user (Alice) is excluded from user discovery results"
  );
  assert(
    foundUserIds.includes(userB.user.id) && foundUserIds.includes(userC.user.id),
    "A2. Registered users (Bob and Charlie) are discoverable via search"
  );

  // B. Conversation creation & reuse
  console.log("\n--- B. Conversation Creation & Reuse ---");
  const createConvRes1 = await fetch(`${API_BASE}/conversations`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${userA.token}`,
    },
    body: JSON.stringify({ recipientId: userB.user.id }),
  });
  const convData1 = await createConvRes1.json();
  const conversationAB_id = convData1.conversation?.id;

  assert(
    createConvRes1.status === 201 && convData1.isNew === true && !!conversationAB_id,
    "B1. Alice creating conversation with Bob returns status 201 and isNew: true"
  );

  const createConvRes2 = await fetch(`${API_BASE}/conversations`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${userB.token}`,
    },
    body: JSON.stringify({ recipientId: userA.user.id }),
  });
  const convData2 = await createConvRes2.json();

  assert(
    createConvRes2.status === 200 &&
      convData2.isNew === false &&
      convData2.conversation?.id === conversationAB_id,
    "B2. Bob creating conversation with Alice reuses existing 1-on-1 conversation"
  );

  // C. Socket Connections & Room Joining
  console.log("\n--- C. Socket Connections & Room Authorization ---");
  const socketA = createSocket(userA.token);
  const socketB = createSocket(userB.token);
  const socketC = createSocket(userC.token);

  await Promise.all([
    new Promise<void>((resolve) => socketA.on("connect", resolve)),
    new Promise<void>((resolve) => socketB.on("connect", resolve)),
    new Promise<void>((resolve) => socketC.on("connect", resolve)),
  ]);

  assert(socketA.connected && socketB.connected && socketC.connected, "C1. Sockets A, B, and C connected with valid JWTs");

  // Alice joins conversation AB room
  const joinAckA: any = await new Promise((resolve) => {
    socketA.emit("conversation:join", { conversationId: conversationAB_id }, resolve);
  });
  assert(joinAckA?.success === true, "C2. Participant Alice successfully joins conversation room");

  // Bob joins conversation AB room
  const joinAckB: any = await new Promise((resolve) => {
    socketB.emit("conversation:join", { conversationId: conversationAB_id }, resolve);
  });
  assert(joinAckB?.success === true, "C3. Participant Bob successfully joins conversation room");

  // Charlie attempts to join conversation AB room (unauthorized)
  const joinAckC: any = await new Promise((resolve) => {
    socketC.emit("conversation:join", { conversationId: conversationAB_id }, resolve);
  });
  assert(
    joinAckC?.success === false && joinAckC?.error?.includes("not authorized"),
    "C4. Non-participant Charlie is rejected from joining conversation AB room"
  );

  // D. Realtime Messaging & Persistence
  console.log("\n--- D. Realtime Messaging & Persistence ---");
  const messageContent = `Hello Bob! Timestamp: ${ts}`;
  let receivedMessageByBob: any = null;
  let receivedMessageByCharlie: any = null;

  socketB.on("message:new", (msg: any) => {
    receivedMessageByBob = msg;
  });

  socketC.on("message:new", (msg: any) => {
    receivedMessageByCharlie = msg;
  });

  // Alice sends message via Socket.IO
  const sendAckA: any = await new Promise((resolve) => {
    socketA.emit(
      "message:send",
      { conversationId: conversationAB_id, content: messageContent },
      resolve
    );
  });

  assert(
    sendAckA?.success === true && sendAckA?.message?.content === messageContent,
    "D1. Alice sends message via Socket.IO and receives server acknowledgment"
  );

  // Wait 300ms for broadcast delivery
  await new Promise((r) => setTimeout(r, 300));

  assert(
    receivedMessageByBob?.content === messageContent &&
      receivedMessageByBob?.conversationId === conversationAB_id &&
      receivedMessageByBob?.senderId === userA.user.id,
    "D2. Bob receives message:new realtime event with correct persisted payload"
  );

  assert(
    receivedMessageByCharlie === null,
    "D3. Unauthorized Charlie did not receive message:new from conversation AB"
  );

  // Verify message history via REST API
  const historyRes = await fetch(`${API_BASE}/conversations/${conversationAB_id}/messages`, {
    headers: { Authorization: `Bearer ${userB.token}` },
  });
  const historyData = await historyRes.json();
  const lastHistoryMsg = historyData.messages[historyData.messages.length - 1];

  assert(
    historyRes.status === 200 && lastHistoryMsg?.content === messageContent,
    "D4. REST API GET /messages returns the persisted message in chronological history"
  );

  // E. Typing Indicators
  console.log("\n--- E. Typing Indicators ---");
  let charlieReceivedTypingStart: any = null;
  socketC.on("typing:start", (payload: any) => {
    charlieReceivedTypingStart = payload;
  });

  // Alice starts typing
  const startPromise = new Promise((resolve) => socketB.once("typing:start", resolve));
  socketA.emit("typing:start", { conversationId: conversationAB_id });
  const bobReceivedTypingStart: any = await Promise.race([
    startPromise,
    new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout typing:start")), 3000)),
  ]).catch(() => null);

  assert(
    bobReceivedTypingStart?.conversationId === conversationAB_id &&
      bobReceivedTypingStart?.userId === userA.user.id,
    "E1. Bob receives typing:start event with Alice's userId"
  );

  assert(
    charlieReceivedTypingStart === null,
    "E2. Unauthorized Charlie did not receive typing:start from conversation AB"
  );

  // Alice stops typing
  const stopPromise = new Promise((resolve) => socketB.once("typing:stop", resolve));
  socketA.emit("typing:stop", { conversationId: conversationAB_id });
  const bobReceivedTypingStop: any = await Promise.race([
    stopPromise,
    new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout typing:stop")), 3000)),
  ]).catch(() => null);

  assert(
    bobReceivedTypingStop?.conversationId === conversationAB_id &&
      bobReceivedTypingStop?.userId === userA.user.id,
    "E3. Bob receives typing:stop event when Alice stops typing"
  );

  // F. Unread / Read State
  console.log("\n--- F. Unread Counts & Read Receipts ---");
  // Check Bob's conversations list to see unreadCount >= 1
  const convsResB = await fetch(`${API_BASE}/conversations`, {
    headers: { Authorization: `Bearer ${userB.token}` },
  });
  const convsDataB = await convsResB.json();
  const convABForBob = convsDataB.conversations.find((c: any) => c.id === conversationAB_id);

  assert(
    convABForBob?.unreadCount >= 1,
    `F1. Inactive conversation for Bob has unreadCount: ${convABForBob?.unreadCount}`
  );

  // Bob marks conversation read
  const markReadRes = await fetch(`${API_BASE}/conversations/${conversationAB_id}/read`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${userB.token}` },
  });
  const markReadData = await markReadRes.json();

  assert(
    markReadRes.status === 200 && markReadData.success === true,
    "F2. Bob marks conversation as read via PATCH /conversations/:id/read"
  );

  // Verify unreadCount is now 0 for Bob
  const convsResB2 = await fetch(`${API_BASE}/conversations`, {
    headers: { Authorization: `Bearer ${userB.token}` },
  });
  const convsDataB2 = await convsResB2.json();
  const convABForBob2 = convsDataB2.conversations.find((c: any) => c.id === conversationAB_id);

  assert(
    convABForBob2?.unreadCount === 0,
    "F3. After marking read, Bob's unreadCount is reset to 0"
  );

  // G. Multi-tab simulation (two sockets for Bob)
  console.log("\n--- G. Multi-Tab Realtime Sync ---");
  const socketB2 = createSocket(userB.token);
  await new Promise<void>((resolve) => socketB2.on("connect", resolve));

  const joinAckB2: any = await new Promise((resolve) => {
    socketB2.emit("conversation:join", { conversationId: conversationAB_id }, resolve);
  });
  assert(joinAckB2?.success === true, "G1. Second socket for Bob (Tab 2) connects and joins room");

  const multiContent = `Multi-tab test ${ts}`;
  const pTab1 = new Promise((resolve) => socketB.once("message:new", resolve));
  const pTab2 = new Promise((resolve) => socketB2.once("message:new", resolve));

  const sendMultiAck: any = await new Promise((resolve) => {
    socketA.emit("message:send", { conversationId: conversationAB_id, content: multiContent }, resolve);
  });
  assert(sendMultiAck?.success === true, "G2a. Alice sends multi-tab message with server ack");

  const [msgTab1, msgTab2]: any = await Promise.all([pTab1, pTab2]);

  assert(
    msgTab1?.content === multiContent &&
      msgTab2?.content === multiContent &&
      msgTab1?.id === msgTab2?.id,
    "G2b. Both tabs for Bob receive the realtime message cleanly with identical message ID"
  );

  // Clean up sockets
  socketA.disconnect();
  socketB.disconnect();
  socketB2.disconnect();
  socketC.disconnect();

  // H. Security and Static Frontend Audit
  console.log("\n--- H. Security & Scope Verification ---");
  const clientSrc = path.resolve(__dirname, "frontend/src");
  let hasForbiddenWords = false;

  function scanDir(dir: string) {
    const files = fs.readdirSync(dir);
    for (const f of files) {
      const full = path.join(dir, f);
      if (fs.statSync(full).isDirectory()) {
        scanDir(full);
      } else if (f.endsWith(".ts") || f.endsWith(".tsx")) {
        const text = fs.readFileSync(full, "utf-8");
        if (text.includes("dangerouslySetInnerHTML")) {
          hasForbiddenWords = true;
          console.error(`Forbidden dangerouslySetInnerHTML in ${f}`);
        }
        if (text.includes("JWT_SECRET") || text.includes("DATABASE_URL")) {
          hasForbiddenWords = true;
          console.error(`Forbidden backend secret referenced in ${f}`);
        }
      }
    }
  }
  scanDir(clientSrc);

  assert(!hasForbiddenWords, "H1. Zero forbidden secrets or dangerouslySetInnerHTML in frontend source");

  // Verify Phase 7 features are absent
  const clientFiles = fs.readdirSync(clientSrc, { recursive: true }) as string[];
  const hasVideoCall = clientFiles.some((f) => f.toLowerCase().includes("video") || f.toLowerCase().includes("call") || f.toLowerCase().includes("webrtc"));
  const hasAttachments = clientFiles.some((f) => f.toLowerCase().includes("upload") || f.toLowerCase().includes("attachment"));

  assert(!hasVideoCall && !hasAttachments, "H2. Phase 7 and out-of-scope features (video, attachments, calls) are strictly NOT implemented");

  console.log("\n=======================================================");
  console.log(`   PHASE 6 TEST RESULTS: ${passedCount} / ${totalCount} PASSED`);
  console.log("=======================================================\n");

  if (passedCount === totalCount) {
    process.exit(0);
  } else {
    process.exit(1);
  }
}

runPhase6Tests().catch((err) => {
  console.error("Phase 6 tests crashed:", err);
  process.exit(1);
});
