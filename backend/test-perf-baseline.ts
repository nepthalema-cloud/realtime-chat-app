import { prisma } from "./src/lib/prisma";

async function main() {
  console.log("--- BASELINE PERFORMANCE MEASUREMENT ---");

  // Find a conversation with messages
  const conversation = await prisma.conversation.findFirst({
    where: {
      messages: { some: {} },
    },
    include: {
      participants: true,
      messages: { take: 5 },
    },
  });

  if (!conversation) {
    console.log("No existing conversation with messages found to measure.");
    return;
  }

  const convId = conversation.id;
  const participant = conversation.participants[0];
  console.log(`Testing with conversation ID: ${convId}, participant: ${participant.userId}`);

  // Measure 1: DB Message Query (FindMany with limit 40, order createdAt asc, include sender)
  const t0 = performance.now();
  const messages = await prisma.message.findMany({
    where: { conversationId: convId },
    take: 41,
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    include: {
      sender: {
        select: { id: true, username: true, avatarUrl: true },
      },
    },
  });
  const t1 = performance.now();
  const dbMessageQueryMs = (t1 - t0).toFixed(2);
  console.log(`[Baseline] DB Message findMany query: ${dbMessageQueryMs} ms (${messages.length} messages)`);

  // Measure 2: DB Participant Mark Read Update
  const t2 = performance.now();
  await prisma.conversationParticipant.update({
    where: {
      conversationId_userId: {
        conversationId: convId,
        userId: participant.userId,
      },
    },
    data: {
      lastReadAt: new Date(),
    },
  });
  const t3 = performance.now();
  const dbMarkReadMs = (t3 - t2).toFixed(2);
  console.log(`[Baseline] DB markRead update: ${dbMarkReadMs} ms`);

  // Measure 3: Sequential vs Parallel DB execution
  const tSeq0 = performance.now();
  await prisma.message.findMany({
    where: { conversationId: convId },
    take: 41,
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    include: {
      sender: { select: { id: true, username: true, avatarUrl: true } },
    },
  });
  await prisma.conversationParticipant.update({
    where: {
      conversationId_userId: {
        conversationId: convId,
        userId: participant.userId,
      },
    },
    data: { lastReadAt: new Date() },
  });
  const tSeq1 = performance.now();
  console.log(`[Baseline] Sequential DB calls (history + markRead): ${(tSeq1 - tSeq0).toFixed(2)} ms`);

  // Measure 4: Simulated full HTTP roundtrip
  const loginRes = await fetch("http://localhost:5000/api/conversations/" + convId + "/messages?limit=40", {
    headers: {
      // We test the endpoint via HTTP
    }
  }).catch(() => null);

  console.log("Baseline measurement complete.");
}

main().catch(console.error).finally(() => prisma.$disconnect());
