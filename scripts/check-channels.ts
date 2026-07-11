import Pusher from "pusher";

const p = new Pusher({
  appId: "2169013",
  key: "d9084d2cfa6f9a6bc2c1",
  secret: "e7584fa8e6fd26ee1958",
  cluster: "ap1",
  useTLS: true,
});

async function check() {
  const r = await p.get({ path: "/channels" });
  const b = await r.json();
  console.log("All channels:", JSON.stringify(b, null, 2));

  const r2 = await p.get({ path: "/channels/chat-public" });
  const b2 = await r2.json();
  console.log("chat-public:", JSON.stringify(b2, null, 2));

  process.exit(0);
}

check().catch((e) => { console.error(e); process.exit(1); });
