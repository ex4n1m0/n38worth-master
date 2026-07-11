import Pusher from "pusher";

const PUSHER_APP_ID = process.env.PUSHER_APP_ID!;
const PUSHER_KEY = process.env.NEXT_PUBLIC_PUSHER_KEY!;
const PUSHER_SECRET = process.env.PUSHER_SECRET!;
const PUSHER_CLUSTER = process.env.NEXT_PUBLIC_PUSHER_CLUSTER!;

async function test() {
  console.log("Pusher config:", {
    appId: PUSHER_APP_ID ? "set" : "MISSING",
    key: PUSHER_KEY ? "set" : "MISSING",
    secret: PUSHER_SECRET ? "set" : "MISSING",
    cluster: PUSHER_CLUSTER || "MISSING",
  });

  const pusher = new Pusher({
    appId: PUSHER_APP_ID,
    key: PUSHER_KEY,
    secret: PUSHER_SECRET,
    cluster: PUSHER_CLUSTER,
    useTLS: true,
  });

  // Try sending an agent-typing event
  try {
    const result = await pusher.trigger("chat-public", "agent-typing", { typing: true });
    console.log("agent-typing event sent successfully:", JSON.stringify(result));
  } catch (e) {
    console.error("agent-typing event FAILED:", e instanceof Error ? e.message : e);
  }

  process.exit(0);
}

test().catch((e) => { console.error(e); process.exit(1); });
