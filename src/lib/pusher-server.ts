import Pusher from "pusher";

let _pusher: Pusher | null = null;

export const pusher = new Proxy({} as Pusher, {
  get(_target, prop) {
    if (!_pusher) {
      _pusher = new Pusher({
        appId: process.env.PUSHER_APP_ID!,
        key: process.env.NEXT_PUBLIC_PUSHER_KEY!,
        secret: process.env.PUSHER_SECRET!,
        cluster: process.env.NEXT_PUBLIC_PUSHER_CLUSTER!,
        useTLS: true,
      });
    }
    return (_pusher as any)[prop];
  },
});
