import Pusher from "pusher";

const PUSHER_APP_ID = "2169013";
const PUSHER_KEY = "d9084d2cfa6f9a6bc2c1";
const PUSHER_SECRET = "e7584fa8e6fd26ee1958";
const PUSHER_CLUSTER = "ap1";

async function test() {
  const pusher = new Pusher({
    appId: PUSHER_APP_ID,
    key: PUSHER_KEY,
    secret: PUSHER_SECRET,
    cluster: PUSHER_CLUSTER,
    useTLS: true,
  });

  // Test 1: Send a test event to game-global channel
  console.log("Test 1: Sending to game-global channel...");
  try {
    const r1 = await pusher.trigger("game-global", "test-event", { msg: "hello from test script", time: new Date().toISOString() });
    console.log("  game-global: OK", JSON.stringify(r1));
  } catch (e) {
    console.error("  game-global: FAILED", e instanceof Error ? e.message : e);
  }

  // Test 2: Send to chat-public channel
  console.log("Test 2: Sending to chat-public channel...");
  try {
    const r2 = await pusher.trigger("chat-public", "test-event", { msg: "chat test", time: new Date().toISOString() });
    console.log("  chat-public: OK", JSON.stringify(r2));
  } catch (e) {
    console.error("  chat-public: FAILED", e instanceof Error ? e.message : e);
  }

  // Test 3: Send agent-typing event
  console.log("Test 3: Sending agent-typing event...");
  try {
    const r3 = await pusher.trigger("chat-public", "agent-typing", { typing: true });
    console.log("  agent-typing: OK", JSON.stringify(r3));
  } catch (e) {
    console.error("  agent-typing: FAILED", e instanceof Error ? e.message : e);
  }

  // Test 4: Send a fake new-message event (to verify chat channel works)
  console.log("Test 4: Sending fake new-message event...");
  try {
    const r4 = await pusher.trigger("chat-public", "new-message", {
      id: 999999,
      content: "[Pusher test] If you see this, real-time is working!",
      type: "public",
      createdAt: new Date().toISOString(),
      sender: { id: 0, username: "PusherTest", avatarUrl: null },
      recipientId: null,
      recipientUsername: null,
    });
    console.log("  new-message: OK", JSON.stringify(r4));
  } catch (e) {
    console.error("  new-message: FAILED", e instanceof Error ? e.message : e);
  }

  // Test 5: Check channel info via Pusher API
  console.log("Test 5: Checking channel stats...");
  try {
    const result = await pusher.get({ path: "/channels/chat-public" });
    const body = await result.json();
    console.log("  chat-public channel:", JSON.stringify(body));
  } catch (e) {
    console.error("  channel stats: FAILED", e instanceof Error ? e.message : e);
  }

  process.exit(0);
}

test().catch((e) => { console.error(e); process.exit(1); });
