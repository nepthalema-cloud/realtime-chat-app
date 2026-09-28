import { prisma } from "./src/lib/prisma";

const BASE_URL = "http://localhost:5000";

async function runUnreadScenarioTest() {
  console.log("==================================================");
  console.log("🧪 TESTING TELEGRAM-STYLE UNREAD COUNT SCENARIO");
  console.log("==================================================\n");

  const ts = Date.now();
  const password = "Password123!";

  // 1. Register Alice and Bob
  const regAlice = await (
    await fetch(`${BASE_URL}/api/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: `alice_unr_${ts}`, email: `alice_unr_${ts}@test.com`, password }),
    })
  ).json();

  const regBob = await (
    await fetch(`${BASE_URL}/api/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: `bob_unr_${ts}`, email: `bob_unr_${ts}@test.com`, password }),
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

  const getBobUnreadCount = async (): Promise<number> => {
    const res = await (
      await fetch(`${BASE_URL}/api/conversations`, {
        headers: { Authorization: `Bearer ${bobToken}` },
      })
    ).json();
    const conv = res.conversations.find((c: any) => c.id === conversationId);
    return conv ? conv.unreadCount : 0;
  };

  // Helper to send message from Alice
  const aliceSend = async (content: string) => {
    await fetch(`${BASE_URL}/api/conversations/${conversationId}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${aliceToken}` },
      body: JSON.stringify({ content }),
    });
  };

  // Helper for Bob to read conversation
  const bobRead = async () => {
    await fetch(`${BASE_URL}/api/conversations/${conversationId}/read`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${bobToken}` },
    });
  };

  console.log("Step 1: Alice sends messages 1–5");
  for (let i = 1; i <= 5; i++) {
    await aliceSend(`Message ${i}`);
  }

  let bobUnread = await getBobUnreadCount();
  console.log(`Bob unread after msgs 1-5: ${bobUnread} (expected: 5)`);
  if (bobUnread !== 5) throw new Error(`Expected 5, got ${bobUnread}`);

  console.log("Step 2: Bob reads through message 5");
  await bobRead();
  bobUnread = await getBobUnreadCount();
  console.log(`Bob unread after reading: ${bobUnread} (expected: 0)`);
  if (bobUnread !== 0) throw new Error(`Expected 0, got ${bobUnread}`);

  console.log("Step 3: Alice sends messages 6–8");
  for (let i = 6; i <= 8; i++) {
    await aliceSend(`Message ${i}`);
  }
  bobUnread = await getBobUnreadCount();
  console.log(`Bob unread after msgs 6-8: ${bobUnread} (expected: 3, NOT 8)`);
  if (bobUnread !== 3) throw new Error(`Expected 3, got ${bobUnread}`);

  console.log("Step 4: Alice sends messages 9–10");
  for (let i = 9; i <= 10; i++) {
    await aliceSend(`Message ${i}`);
  }
  bobUnread = await getBobUnreadCount();
  console.log(`Bob unread after msgs 9-10: ${bobUnread} (expected: 5)`);
  if (bobUnread !== 5) throw new Error(`Expected 5, got ${bobUnread}`);

  console.log("Step 5: Bob opens/reads through message 10");
  await bobRead();
  bobUnread = await getBobUnreadCount();
  console.log(`Bob unread after reading: ${bobUnread} (expected: 0)`);
  if (bobUnread !== 0) throw new Error(`Expected 0, got ${bobUnread}`);

  console.log("Step 6: Alice sends message 11");
  await aliceSend("Message 11");
  bobUnread = await getBobUnreadCount();
  console.log(`Bob unread after msg 11: ${bobUnread} (expected: 1)`);
  if (bobUnread !== 1) throw new Error(`Expected 1, got ${bobUnread}`);

  console.log("\n==================================================");
  console.log("🎉 TELEGRAM-STYLE UNREAD SCENARIO VERIFIED 100%!");
  console.log("==================================================");
}

runUnreadScenarioTest()
  .catch((err) => {
    console.error("❌ TEST FAILED:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
