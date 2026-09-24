# Study: move global chat to an OnlyHumans room ("n38worth"), keep in-game DMs

**Date:** 2026-09-22 · **Status:** study only — no code changed, nothing deployed.
**Scope:** replace the in-game global chat with the OnlyHumans word-room `n38worth`
(https://onlyhumans.deepflux.space/join). Direct messages stay exactly as they are.

Sources: full inventory of this repo (file:line references below); OnlyHumans site,
hub API and both codebases (GitHub `ex4n1m0/OnlyHumans`, branch `main` = site/hub/portal,
branch `app` = desktop app + Rust core) verified against live deployment on 2026-09-22.

---

## TL;DR recommendation

1. **Move global chat to OnlyHumans room word `n38worth`** (case-insensitive: `N38WORTH`
   is the same room). The word is printed in-game and intentionally public.
2. **Embed the OnlyHumans web portal (`/join`) in an iframe** inside the existing chat
   page as the default path — it works today with zero upstream changes (the portal sends
   no `X-Frame-Options`/CSP frame-ancestors). Add "open in new tab" and "install the
   Windows app" links beside it.
3. **Keep the entire DM system untouched** — it is load-bearing game-event history
   (7 verified insert sites, §1.3) and the only identity-bound channel in the game.
4. **Retire the public write path**: `/api/chat/send` public branch returns 410 with a
   pointer to the room; stop triggering the `chat-public` Pusher channel; keep
   `/api/chat/public-messages` briefly as a frozen read-only archive, then delete it at
   the next world reset. **No DB schema change at all.**
5. **Small upstream follow-up (first-party):** add a one-shot `?room=n38worth` pre-fill
   to the portal so the game can link players straight into the room (today no URL
   parameter is read, by design).
6. **Know the two big regressions before shipping:** no chat history/backlog for
   newcomers (portal keeps only the live session), and delivery in web↔web takes
   seconds rather than being instant. Both are inherent to the E2E model and are the
   price of the privacy gain. Details and mitigations in §7.

Cost note: this is **not** a meaningful bill reduction — chat is a small slice of Pusher
traffic (market/economy events dominate). The motivation is product: an E2E town square
and dogfooding OnlyHumans.

---

## 1. What the game has today

### 1.1 Global chat (the part that moves out)

| Piece | Where | Notes |
|---|---|---|
| Chat page | `src/app/(public)/chat/page.tsx` → `src/components/GlobalChatPage.tsx` | Public room pane + right sidebar of human players (sidebar = DM launcher, **stays**) |
| Embedded copy | `src/app/(game)/players/[username]/page.tsx:812` | Own-profile embed, gated on mission 0 |
| Send | `POST /api/chat/send` public branch (`src/app/api/chat/send/route.ts:89-97,124`) | 280-char cap, avatar gate, **no rate limit, no profanity filter, no mute/ban**; reward disabled (`PUBLIC_REWARD = 0`) |
| Read | `GET /api/chat/public-messages` (`src/app/api/chat/public-messages/route.ts`) | No auth; CDN `s-maxage=10, swr=30`; last 50 (cap 100) |
| Realtime | Pusher channel `chat-public`, event `new-message` | Server: send route :124; client: `GlobalChatPage.tsx:121-138` |
| Persistence | `messages` table, `type="public"` (`src/db/schema/messages.ts`) | Rows deleted only by world reset / user purge; no time pruning |
| Sounds | `playSound("chat")` on others' messages (`GlobalChatPage.tsx:126`) | |

Dead code that can be deleted opportunistically: `src/components/ChatRoom.tsx` and
`src/components/PrivateMessageButton.tsx` (zero importers, both poll at 150 s and carry
stale "+0.1¢/msg" copy).

### 1.2 Direct messages (the part that stays, unchanged)

- Same `messages` table, `type="private"`; same send route private branch; read via
  `GET /api/chat/messages`.
- UI: `InlineDMChat` (used in `GlobalChatPage` sidebar, `OwnershipList.tsx:637`,
  player profiles and own-profile "My Leader" box), `ChatContext`
  (`src/contexts/ChatContext.tsx`), `ChatNotificationBell` (navbar), unread via
  localStorage `dm-last-read-*`.
- Realtime: Pusher `chat-private-{id}` / `new-message` — also fired by the game-event
  writes below.

### 1.3 Why DMs must stay: game-event history writes (verified, complete list)

Every insert into `messages` (grep-verified 2026-09-22):

| Site | Row written |
|---|---|
| `src/actions/pumpPlayer.ts:176` | 🚀 `{owner} OVERCLOCKED you! …` (private) |
| `src/actions/blockSell.ts:131` | 🔒 `{owner} FIREWALLED you! …` (private) |
| `src/app/api/game/boost-card/route.ts:144` | Firewall notice (private) |
| `src/app/api/game/reveal-avatar/route.ts:144` | 👁️ SCAN notice (private) |
| `src/app/api/game/reveal-avatar-short/route.ts:152` | 👁️ short SCAN notice (private) |
| `src/app/api/game/send-credits/route.ts:126` | 🎁 Gifted X.XX¢ (private) |
| `src/lib/multi-account.ts:76` | Multi-account warning/penalty (system) |
| `src/app/api/chat/send/route.ts:90` | User-sent public/private — the only user path |

These DMs are the player-facing receipt ledger for combat/economy actions; they are
queried by profile DM boxes and the notification bell. None of this can move to
OnlyHumans (it would require the server to post into the room — see §8) and none of it
should: it is server-attested history, exactly what a game event log must be.

### 1.4 Pusher footprint (what actually happens to the bill)

Pusher is used far beyond chat: `player-{id}` (purchased/credits/ownership/rewards/
boss-tax/multi-account), `market` (market-changed), `game-global` (countdown/win/reset),
plus `chat-private-{id}`. Removing **only** the `chat-public` trigger saves one Pusher
message per public chat message — a minority of total traffic. Pusher stays regardless.

---

## 2. OnlyHumans primer (verified facts)

- **Word rooms.** Anyone typing the same word lands in the same room. Word is normalized
  (`trim` + lowercase) → `n38worth` == `N38WORTH`. No charset restriction (UI maxlength
  64). Derivation: Argon2id (m=64 MiB, t=3, p=1) over the word + release GK → room id.
- **Identity.** Device-generated Ed25519 keypair, no accounts. Portal stores the seed in
  `localStorage` (`oh-portal-seed`, persists across browser sessions); display name is
  deliberately never remembered.
- **Delivery.** Desktop app: direct device-to-device (libp2p QUIC) first, hub mailbox
  fallback. Web portal: mailbox-only peer. Portal drains its inbox every ~2–3.5 s;
  app drains every 30 s. Published latencies: app↔app instant; browser↔browser seconds;
  app→browser ~15–20 s; browser→app up to ~2 min (site's conservative figure).
- **Hub** (Vercel + Upstash, first-party): signed directory + room-host pointers +
  sealed-envelope inboxes. Sees peer ids, derived room ids, envelope metadata; never
  the word or plaintext. Inbox retention: **last 32 envelopes / 24 h** per peer.
- **Room hosting.** First-writer-wins host election (300 s TTL); host mints the room
  key and seats joiners. Host-only key rotation **seals the room** — after epoch 2, new
  joiners with only the word are rejected. Zero members online = no room state at the
  hub; the room is re-founded (fresh key) by the next joiner.
- **⚠ Release-universe caveat.** The GK is minted **per release** — "every release is
  its own room". The same word maps to a *different room* after each OnlyHumans
  release; old and new clients cannot see each other. The web portal is always current
  (served from the site); desktop app users who don't update get split off until they do.
- **No deep links.** The portal reads **no URL parameters** (no `location.search`/`hash`
  in the shipped bundle); recent commits deliberately removed even input persistence.
  Joining = type a name + type the word. No `onlyhumans://` protocol in the app either.
- **No bot/API.** Hub surface is exactly reg / lookup / room / inbox / presence / gk —
  nothing can post into a room. Sending requires the full client protocol. However the
  repo ships working headless Node clients (`portal/e2e-host.ts`, `portal/e2e-node.ts`)
  used in e2e tests — a game-run bot/host is feasible but unsupported-as-SDK (§8).
- **Capacity: unverified at scale.** Known rate limits: inbox push 1 per 4 s per sender
  (1–16 envelopes per call), registration 1/30 s per peer, presence 1/30 s.

---

## 3. Target design

```
┌─ Game (n38worth.com) ──────────────────┐   ┌─ OnlyHumans ─────────────────┐
│ /chat tab:                              │   │                              │
│   ┌───────────────────────────────┐    │   │  room "n38worth"             │
│   │ iframe: onlyhumans … /join    │────┼──▶│  (E2E word room, public)     │
│   │ + "open in new tab"           │    │   │                              │
│   │ + "install Windows app"       │    │   │                              │
│   └───────────────────────────────┘    │   └──────────────────────────────┘
│   DM sidebar (players list)  ── stays  │
│   InlineDMChat boxes         ── stays  │   ┌─ Game DB (unchanged schema) ─┐
│   Notification bell          ── stays  │   │ messages: private + system   │
│   game-event DM writes       ── stay   │──▶│ (public rows: no new writes, │
│   Pusher chat-private-*      ── stays  │   │  old rows = frozen archive)  │
└─────────────────────────────────────────┘   └──────────────────────────────┘
```

Room word: **`n38worth`** — printed verbatim in the UI ("type the word n38worth"),
case-insensitive on their side. The word being public-by-design is fine here: this room
*is* the public square. (Their honest-limits page notes guessable words are "not access
control" — irrelevant for an intentionally open room.)

---

## 4. Integration options considered

| | A. Link-out | **B. Iframe embed (recommended)** | C. Upstream `?room=` pre-fill | D. Vendored protocol client |
|---|---|---|---|---|
| What | Chat tab becomes instructions + button to open the portal | Embed `/join` in an iframe in the chat pane; sidebar/DMs stay | First-party portal PR: one-shot `?room=n38worth` pre-fill (aligns with their no-persistence stance) | Port `portal.ts` (self-contained TS mirror w/ KATs) into the Next.js app; native game-rendered chat |
| Upstream change needed | none | none | small PR to `oh-site` | none, but must track every protocol release (GK changes per release) |
| Player friction | highest (leaves the game) | low | lowest (room pre-filled; user types only a name) | lowest + game avatars/sounds/username-lock possible |
| Maintenance | none | none | tiny | highest — permanent protocol mirror |
| Risk | nobody chats | see §7 regressions | none | divergence bugs, release-universe chases |

**Recommendation: B now, C as a quick first-party follow-up** (both A and B get better
from C), D only if the community later demands native feel. Since the game and OnlyHumans
have the same owner, C is cheap and keeps the game free of protocol coupling.

Iframe viability is verified: live `/join` sends no `X-Frame-Options` and no CSP
frame-ancestors; the portal only talks to its own origin inside the frame (no CORS
issues, no special `allow` attributes needed). Browser third-party **storage
partitioning** means the iframe's identity seed is partitioned to
(`onlyhumans.deepflux.space`, `n38worth.com`) — it persists across visits *within* the
game site, but is a different identity from the same browser visiting the portal
directly. On Safari, third-party storage is least reliable; the "open in new tab /
install the app" affordances cover that. Worth a line in the in-game hint text.

---

## 5. Exact changes in the game (for the implementation phase)

**Modified**
- `src/components/GlobalChatPage.tsx` — replace the public-room pane with the iframe
  card (title "Global chat lives on OnlyHumans — word: `n38worth`", iframe + open-in-tab
  + download links + 3-line how-to). Keep the player sidebar, unread dots, DM launching.
  Same swap automatically covers the own-profile embed at
  `players/[username]/page.tsx:812` since it's the same component.
- `src/app/api/chat/send/route.ts` — public branch returns
  `410 { error: "Public chat moved to the OnlyHumans room 'n38worth'" }` (covers stale
  cached clients); private branch untouched. Remove the `chat-public` trigger.
- Optional: collapsible "archive (pre-migration)" view reading
  `/api/chat/public-messages` until the next world reset wipes the rows.

**Deleted (at cutover or opportunistically)**
- `chat-public` subscriptions: `GlobalChatPage.tsx:121-138` (public part).
- `/api/chat/public-messages` route — after the archive window.
- Dead code: `src/components/ChatRoom.tsx`, `src/components/PrivateMessageButton.tsx`
  (already unused today).

**Unchanged (explicitly)**
- `messages` schema, `ChatContext`, `InlineDMChat`, `ChatNotificationBell`,
  `/api/chat/messages`, `/api/players/chat-list` (sidebar data), every `chat-private-*`
  trigger, all 7 game-event insert sites (§1.3), all other Pusher channels.
- No DB migration of any kind (shared Neon prod DB — nothing to ALTER).

---

## 6. Identity, trust & moderation

- **No binding between game account and chat identity.** OnlyHumans names are free-form;
  anyone who knows the word (i.e., everyone — it's printed in-game) can join as
  "The Architect" or another player's name. Today's chat is account-bound with game
  avatars and profile links; that goes away. Mitigations: (a) treat in-game DMs — which
  stay account-bound — as the trusted channel for anything identity-sensitive;
  (b) regulars recognize each other's persistent keys; (c) optional future: a verified
  game-run peer that vouches for players (§8).
- **Moderation parity, capability loss.** Today there is effectively no moderation (no
  filter, no mute/ban — verified) but the *capability* exists server-side (delete rows,
  ban accounts). In the room there is none and there cannot be any — the server never
  sees plaintext and holds no delete key. The only lever is host key rotation, which
  **seals the room to newcomers permanently** — never rotate the game room; that would
  end new-player onboarding into chat.
- **Guests get better.** Demo/guest players currently need `demo-register` + DB rows to
  chat (avatar gate). The portal needs no account at all — a genuinely anonymous guest
  can join the room. Matches the game's guest-first funnel.
- **World reset semantics improve.** Today the reset deletes all chat including DM
  history (`triggerGameReset.ts:140`). The room survives resets — the community keeps
  its town square across seasons. (If a fresh-room feel is ever wanted, move the season
  word to `n38worth2` etc.; default: keep `n38worth`.)

---

## 7. UX deltas (the honest list)

| Capability | Today | After |
|---|---|---|
| History/backlog for newcomers | last 50 messages, CDN-cached | **none** — portal session only; desktop app users have local persisted history |
| Latency | instant (Pusher) | web↔web seconds; app↔app instant; browser→app slower (site says up to ~2 min; app code drains every 30 s) |
| Name/avitar → game profile links | yes | no (chat is off-game) |
| Sounds on message | `playSound("chat")` | no (unless D later) |
| Identity across devices | game account | per-browser/device keypair |
| Typing a name | n/a | every visit (portal never remembers names, by design) |
| Spam flood | unbounded, unfiltered | bounded-ish: hub inbox push is 1 batch/4 s per sender, 16 envelopes/batch |

Mitigations that fit the game: the iframe keeps chat *inside* the /chat tab so the
surface doesn't feel bolted-on; the how-to card sets expectations; DM bell/sidebar keep
the in-game social layer alive.

---

## 8. Optional phase 3: a game-run room host/announcement peer

The OnlyHumans repo itself ships headless Node clients (`portal/e2e-host.ts`) that
found a room, seat guests, and send sealed chat against the production hub. A small
game-run headless host could:

- keep room `n38worth` founded 24/7 (no fresh-key re-founding, stable membership),
- re-found the room immediately in each new release universe (anchors the room through
  OnlyHumans upgrades — web users land somewhere populated even mid-release),
- post system announcements ("The Simulation is Rebooting", "game won") into the room.

Trade-offs: it's a server-held keypair (a normal peer from the room's perspective —
compromising the game server compromises only the bot, not user↔user E2E); it must
**never rotate** (seals the room); and it's an unsupported-as-SDK internal tool, so the
game must track protocol releases (first-party, so acceptable). This is a nice-to-have,
not part of the cutover. It cannot and should not replace the DM receipt ledger (§1.3).

---

## 9. Cost impact

- **Saved (small):** one `chat-public` Pusher trigger per public message; public-message
  POST/GET function invocations (GET was already CDN'd at s-maxage=10); DB growth from
  public rows.
- **Not saved:** the Pusher subscription — market/economy/cron events keep it.
- **Moved (net ~zero, same owner):** chat delivery becomes hub-inbox traffic on the
  OnlyHumans Upstash instance — every portal-member message is one inbox PUT per
  recipient (batched 16/call, ≤1 batch/4 s/sender). Fine at the current community size;
  watch Upstash command volume if the room gets busy.

---

## 10. Risks & mitigations

| Risk | Severity | Mitigation |
|---|---|---|
| Release-universe split: app users on old OnlyHumans versions land in the old room | medium | iframe/portal path is always current; announce "update the app" at releases; optional host bot anchors the new universe instantly (§8) |
| No backlog → newcomers see a dead room until someone speaks | medium | set expectations in the how-to card; a bot's periodic presence line (§8) also makes the room look alive |
| Impersonation via free-form names | medium | in-game DMs remain the identity-bound channel; community norms |
| Latency seconds vs instant | low | acceptable for a town square; DMs stay instant for 1:1 |
| Hub rate limits under load (1 batch/4 s/sender) | low today | degrades to delay, not loss; revisit if the game spikes |
| No kill switch for floods/harassment | medium | inherent to E2E; today's moderation is already nil; the *option* of server cleanup is what's lost |
| Safari iframe storage may drop the identity seed | low | "open in new tab / install app" links; seed regenerates harmlessly |
| Upstream protocol drift (only if option D is chosen) | high | don't choose D until wanted |

---

## 11. Rollout plan

1. **Phase 1 (game, one PR):** §5 changes — iframe card + sidebar kept, public send →
   410, `chat-public` retired, archive view behind a toggle. Deploy behind no flag; the
   rollback is reverting the public branch (kept intact in git).
2. **Phase 2 (upstream, small):** portal `?room=` one-shot pre-fill (not persisted —
   consistent with their privacy stance); then the game's links/iframe src carry it and
   users type only a name.
3. **Phase 3 (optional):** game-run host/announcement peer (§8).
4. **Phase 4 (optional, only if demanded):** vendored in-game client (D).
5. **Cleanup at next world reset:** delete `/api/chat/public-messages` + archive toggle
   (the reset wipes the rows anyway).

Nothing in this plan requires a DB migration, a new env var, or a new third-party
dependency.

---

## 12. Open questions (for the game owner)

1. Phase 2 upstream PR — do it before Phase 1 so the iframe can ship with the room
   pre-filled? (Recommended: yes if quick; the iframe still works without it.)
2. Should the how-to card push the **Windows app** first (best latency + history) with
   the browser iframe as the default? (Recommended: iframe default, app advertised.)
3. Any appetite for the announcement bot (§8), including its never-rotate rule?
4. Keep room word `n38worth` across world resets, or per-season words later?
