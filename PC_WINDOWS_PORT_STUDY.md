# PC Windows Port Study — n38worth as a Windows game + minimum-Vercel backend

Date: 2026-10-06 · Status: STUDY (nothing implemented, nothing committed)
Scope: convert the game to a PC (Windows-only) title, strip Vercel down to the
minimum needed to keep the game working as it is today, evaluate **Rust** as a
language choice, and map the upgrade path toward **"triple-A style" graphics**.

---

## §0 · TL;DR verdict

1. **The port is a packaging project, not a rewrite.** The game already runs as
   a client-rendered React SPA talking to a JSON API — 110/115 components are
   `"use client"`, and the Android build already proves the pattern (a
   Capacitor webview that loads `https://n38worth.com/` remotely). A Windows
   client is the same trick in a better shell: **Tauri 2 (Rust) + WebView2**.
2. **Rust: yes at the edges, no at the core.** Use Rust for the Tauri shell
   (windowing, updater, NSIS installer, local asset/patch storage, later a
   native renderer module if ever needed). Do **not** rewrite game logic or UI
   in Rust — 69k LOC of TypeScript, 29 test files pinning the exact economy
   formulas, and a TypeScript authoritative server that must share those
   formulas. A Rust client would fork every shared equation (`safeguards`,
   raid math, crew-battle sim are pure TS used by both sides today).
3. **The "minimum Vercel" is almost what exists today, minus the web
   surface.** The 48 mutation routes + 27 per-player reads + 11 cron schedules
   ARE the game's server; they cannot move into a multiplayer client without
   surrendering anti-cheat. What dies on Vercel: the served web app itself
   (pages, JS bundles, landing, OG images, analytics beacons). The API stays.
4. **Cost honesty: this is a product/ceiling play, not a cost play.** Cron
   traffic is ~1,132 invocations/day (~34k/mo) — far inside the 1M/mo included
   with Pro ($20/seat, $20 usage credit). The port saves single-digit dollars
   at current scale. The real wins: Steam distribution, no-browser performance
   ceiling, local multi-GB assets without egress, and a real graphics ladder.
5. **Graphics ladder:** the repo is already on `three@0.186` — the exact line
   where `WebGPURenderer` + TSL matured. WebGPU works in WebView2 (runtime
   r345+). G1 = WebGPU swap in place; G2 = PBR/IBL/soft shadows/post +
   reintroduce a GLB asset path (2,038 Kenney CC0 GLBs are already sitting
   unused at `Kenney/`); G3 = hero-tier commissioned assets shipped locally;
   G4 (only if the webview ceiling is actually hit) = a native wgpu renderer
   as a Tauri sidecar — that is where Rust could grow. Unreal is the escape
   hatch if "AAA" ever becomes literal, and it would be a new game project.

---

## §1 · What the game is today (facts that shape the port)

Measured inventory (2026-10-06):

| Layer | Size | Notes |
|---|---|---|
| `src/lib` | 118 files, 24,747 LOC | 31 server-only modules; the rest pure/shared |
| `src/components` | 115 files, 23,571 LOC | **110 are `"use client"`** |
| `src/app` pages | 29 tsx, 4,786 LOC | landing, auth, 16 game pages, privacy/terms, chat |
| `src/actions` + hooks + db | 4,532 LOC | server actions (all authed), hooks, drizzle schema |
| Tests | 29 files, 4,334 LOC | **all test the pure/shared layer; zero import `@/db`** |
| i18n | 726 keys × en/zh | client-driven `LanguageContext` |
| API | **118 routes** | 48 auth-mutations · 27 auth-reads · 17 public CDN reads · 15 cron (11 scheduled) · 11 other |
| Crons | 11 schedules, ~1,132 runs/day | economy minting, ranks, reset, vault backstop |
| DB | 24 tables, Neon HTTP driver | **zero transactions anywhere** (CAS-pattern discipline) |
| Realtime | Pusher: 5 channel families, ~25 event types | client binds in `usePlayerEvents`/`useMarketEvents` |
| External | Neon, Pusher, Unsplash, DeepSeek proxy, Vercel Blob, Google/Facebook OAuth | all secrets server-only |
| Client shells | Android (Capacitor) loads the live site remotely | `appendUserAgent: "n38worth-android"`, `/api/mobile-signin/[provider]` for OAuth |
| Renderers | CityMap2D static canvas (default) + CityMap3D (three 0.186, lazy chunk, fully procedural) | no GLB/glTF in use |

Three structural facts dominate every decision below:

- **F1 — fat client, thin API.** The entire UI is client-rendered React
  (react-query + zustand) hitting JSON routes. There is no SSR logic to port.
  The pure game-logic layer (city engine ~3.5k LOC, `raid.ts`,
  `crew-battle.ts`, `safeguards.ts`, all i18n) is already shared code that a
  packaged client would bundle unchanged.
- **F2 — the server is the referee.** Raids, bounties, crew battles, the
  market, leaderboards, world reset are player-vs-player. Every anti-abuse
  device (CAS claim-first updates, `shouldGrantRevenge`, `prizeEligible`,
  multi-account detection, bounty escrows) exists because clients are hostile.
  Whatever client we ship, the 48 mutation routes and the 11 crons must stay
  on neutral ground. "Move the work into the client" has a hard ceiling at
  "everything except shared state."
- **F3 — a remote-loaded native shell is already in production.** The Android
  app is a webview pointed at the website with a UA token. A Windows client
  can start life identically (Tauri webview → n38worth.com), which makes the
  first shippable EXE a 2–4-day task with zero server changes.

---

## §2 · Target architecture

```
┌────────────────────────── Windows PC (per player) ──────────────────────────┐
│  n38worth.exe — Tauri 2 shell (Rust)                                        │
│  ├─ WebView2 (Chromium evergreen, WebGPU r345+)                             │
│  │   └─ the existing React game UI (remote-loaded first, bundled later)     │
│  │       ├─ CityMap2D canvas (unchanged)                                    │
│  │       └─ CityMap3D → three.js WebGPURenderer (G1) → PBR/assets (G2/G3)   │
│  ├─ Rust side: window/updater/NSIS, local asset+replay cache, crash pad,    │
│  │   (future: wgpu sidecar renderer — G4, Steamworks bindings)              │
│  └─ sounds + hero art assets ship in the installer (no egress)              │
└───────────────┬─────────────────────────────────────────────┬───────────────┘
                │ HTTPS JSON (same 118 routes)                │ Pusher (WS)
┌───────────────▼─────────────────────────────────────────────▼───────────────┐
│ Vercel (Pro) — API only: auth, 48 mutations, reads, 11 crons                │
│ Neon Postgres (unchanged) · Pusher (unchanged) · Unsplash · DeepSeek proxy   │
└──────────────────────────────────────────────────────────────────────────────┘
```

Nothing in the middle changes: no new service, no gateway, no protocol. The
client speaks the same HTTP + Pusher it speaks today in a browser tab.

---

## §3 · The minimum Vercel surface

### §3.1 What must stay (the irreducible core — ~95 routes)

| Group | Routes | Why it can't leave Vercel |
|---|---|---|
| Auth | `/api/auth/[...nextauth]`, `/api/register`, `/api/quickplay`, `/api/mobile-signin/[provider]` | JWT sessions + bcrypt + OAuth secrets. A Tauri webview reuses cookie sessions exactly like the Android shell does today. |
| Economy mutations | all 48 AUTH-MUTATION routes | Server authority = anti-cheat (F2). These *are* the game. |
| Per-player reads | the 27 AUTH-READ routes | Cheap, invoked on demand; merging them is optional grooming, not a requirement. |
| Shared-world reads | the 17 PUBLIC-READ routes (city/world, ranks, chat tail, hall-of-fame, avatar proxy…) | The PC client still fetches these; they are CDN-cached (`s-maxage`) and cost nearly nothing. |
| Crons | all 11 schedules | They mint/move credits and run the world (portfolio income, boss tax, ranks, countdown/reset, fate-seal, vault backstop). They must run on neutral ground (F2), and Vercel Cron is already the cheapest place for them (see §3.3). |
| Admin | 3 admin routes + world-vault lazy break | Ops tooling. |

### §3.2 What dies or shrinks

| Item | Action | Saving |
|---|---|---|
| Landing page, `/login`, `/register` pages, 16 game pages, privacy/terms, OG/twitter image routes | delete (or reduce to a one-page marketing site) once the client ships | all JS-bundle + page egress, SSR compute |
| `/api/landing-data`, `/api/analytics/visit`, `/api/analytics/city-visit`, `/api/leaderboard-sidebars`, `/api/demo-register`, `/api/game/self-inflate` (410 stub) | delete or fold | a handful of invocations |
| Public polling from random web visitors | disappears with the public site | the largest *variable* function/CDN usage |
| Avatar egress (`/api/avatar/[username]`) | keep route; Tauri disk-caches images locally | repeat avatar egress |
| `Kenney/` repo folder (2,038 unused GLBs) | moves into the client's asset pipeline (§5) or deletes | repo weight only |

### §3.3 Cron consolidation — considered and rejected

Merging 11 schedules into one `*/5` dispatcher saves ~nothing: total cron
traffic is ~34k invocations/month, inside the 1M/month included with Pro.
Moving crons off Vercel (Neon `pg_cron`, a micro-VPS, GitHub Actions) would
only matter if it let us drop Pro → Hobby — and **Hobby is not an option
anyway**: Vercel's Hobby tier prohibits commercial projects, and a Steam
game is commercial. Keep Pro, keep the crons as they are.

### §3.4 Cost truth

| | Today | After PC-only port |
|---|---|---|
| Vercel Pro | $20/seat + usage credit | same $20 + slightly lower usage (no web egress) |
| Neon | unchanged | unchanged |
| Pusher | unchanged | unchanged |
| DeepSeek autopilot | unchanged (capped) | unchanged |

At the current player scale the port saves roughly **$0–20/month**. The
Vercel-minimization is therefore about *architecture hygiene and a growth
ceiling*: once players arrive via Steam, each player costs the backend only
API JSON (tiny) instead of full web-app egress, and no amount of traffic
spikes function hours the way public web traffic does. If cost ever becomes
the driver again, the lever is usage-based overages at 100× scale — not this
port.

---

## §4 · The Windows client

### §4.1 Shell choice: Tauri 2 (recommended)

| Option | Verdict | Why |
|---|---|---|
| **Tauri 2 + WebView2** | ✅ | ~10 MB shell, uses the OS WebView2 (evergreen Chromium, preinstalled on Win 10/11; bundlable "fixed version" for old Win10). NSIS + MSI installers built in, signed updater built in. Rust core = the Rust surface area (§6). Steam distribution is ordinary: any EXE ships via SteamPipe; `steamworks-rs` bindings exist if achievements/overlay are wanted later. |
| Electron | ❌ | Works, but ships a whole Chromium (~150–200 MB), no Rust story, worse RAM. WebView2 gives the same Chromium without carrying it. |
| Full native (Win32/WPF/WinUI) | ❌ | 69k LOC of React UI would be rewritten for zero gameplay gain. |
| Progressive Web App | ❌ | Not a PC "game": no Steam, no updater, no guaranteed GPU, browser-tab UX. |

Two caveats to engineer around, both known quantities:

- **Steam overlay vs webview** — the overlay can misbehave over WebView2
  content; ship with the overlay disabled-by-default until tested (standard
  practice for webview games on Steam).
- **OAuth in a webview** — Google blocks embedded webviews
  (`disallowed_useragent`). The codebase already solved this for Android:
  `/api/mobile-signin/[provider]` + system-browser flow. Reuse it, or lead
  with username/password (bcrypt credentials work in-page) and treat OAuth
  as secondary.

### §4.2 Two-stage client (mirrors the Capacitor precedent)

- **Stage A — remote-loaded (ship fast):** the EXE loads `https://n38worth.com/`
  exactly like the Android app, with `appendUserAgent: "n38worth-windows"`.
  Updates are automatic (it's the live site). Zero migration risk; the server
  can even serve the Windows UA a trimmed page set later.
- **Stage B — bundled UI (ship once stable):** the client-rendered app builds
  as a static bundle inside the EXE (the app is `"use client"` everywhere;
  no SSR to preserve) and talks to `https://n38worth.com/api/*` directly.
  Wins: instant startup, offline shell, Steam depot updates, no bundle egress,
  integrity of shipped code. Costs: a build step for the SPA (Next static
  export or a Vite lift — 1–3 weeks, §7 M4) and dependence on the updater.

Stage A is not a throwaway: it is the debugger-friendly dev mode forever.

### §4.3 What the Rust shell adds from day one

Window/full-screen management, custom cursors, exit guards, taskbar progress
(reward countdown), a local disk cache (avatars, world snapshots, replay
logs), native crash reporting pointing at the existing analytics route, and
the updater. None of this touches game code.

---

## §5 · Graphics: the AA/AAA ladder

Honest framing first: "triple-A" visuals are an *asset and lighting* problem
more than an API problem, and for a city tycoon the realistic ceiling for a
1-dev + AI team is **high-end indie / AA** — Tiny Glade tier (which, notably,
was 2 senior devs × 2 years, Rust + custom renderer, no netcode, no data-dense
UI). The ladder below is ordered so each rung ships value independently.

| Rung | Change | Effort | Notes |
|---|---|---|---|
| **G0 (today)** | CityMap2D static canvas (the signature Blueprint look) + CityMap3D: three 0.186, one shadow sun, procedural compiled volumes, render-on-demand | — | 2D view is identity; it is untouched by this ladder. |
| **G1 — WebGPU** | Swap CityMap3D to `three.WebGPURenderer` (WebGL2 fallback via `forceWebGL`). The repo's `three@0.186` is already the WebGPU/TSL-mature line; WebView2 exposes WebGPU (r345+). | 1–2 weeks | Lower CPU overhead per draw call — directly helps "every city fully rendered." Also enables compute shaders (GPU-side layout/culling) later. |
| **G2 — Modern rendering on existing art** | PBR materials (metal/rough) on the compiled volumes, IBL environment + HDR sky, cascaded/soft shadows, SSAO, bloom (emissive windows finally *glow*), ACES tonemap, fog. Reintroduce a GLB/glTF asset path (GLTFLoader + Draco/meshopt + KTX2) — the Kenney CC0 kit (2,038 GLBs already at `Kenney/`) covers AA-lite buildings/roads instantly. | 2–6 weeks | This is where "looks next-gen" is actually won. Kenney is low-poly stylized; it reads as clean AA, not AAA. |
| **G3 — Hero assets, local** | Commission/purchase higher-fidelity hero buildings (Fab/Sketchfab, CC0 candidates), tiers 8–14 and Founder landmarks first; procedural art stays for T1–7. Assets ship inside the installer — a PC-exclusive advantage: multi-GB art with **zero CDN egress**, streamed from disk. | weeks + art budget | The web/Android builds keep the procedural set (graceful tier by client capability). |
| **G4 — Native renderer (only if the webview ceiling is hit)** | A wgpu (Rust) renderer as a Tauri sidecar/second window, consuming the same JSON world state. | months | For a city builder this is probably never needed; three.js + WebGPU handles SC4-class scenes. This is the escape hatch that keeps Rust in the picture (§6). |
| **G5 — Literal AAA (rejected)** | Unreal Engine port | new game | True AAA tooling lives in Unreal/Unity — but that's a C++/C# rewrite of everything, and it abandons the live multiplayer backend, web/Android clients, and the 29-file formula test suite. Only rational if the product pivots to graphics-first single-player. |

Lighting identity note: the game's look is "Blueprint City, always day" in
2D. The 3D ladder should aim at *"night-city financial district"* (bloom,
emissive windows, wet asphalt specular) — it flatters the existing neon
palette and hides low-poly counts better than daylight realism.

---

## §6 · Does Rust make sense? (the language verdict)

**Yes — as the shell and as an optional future renderer. No — for the game
itself.**

Where Rust wins here:

- **The Tauri shell is Rust for free.** Windowing, updater, installer, file
  cache — small, stable, well-trodden surface. This is the lowest-risk Rust
  in the industry.
- **The renderer escape hatch (G4) is naturally Rust** (wgpu), and if it ever
  happens it shares nothing but JSON with the game, so no formula drift.
- Performance-critical local systems later (replay playback, big offline
  simulations if the game ever grows a single-player mode) are good Rust
  candidates.

Where Rust would actively hurt:

1. **Formula drift.** `safeguards.ts`, raid/pool math, crew-battle seeding,
   blueprint drop weights exist once in TS and are pinned by 29 test files.
   The server stays TS (F2) — a Rust client would maintain a second
   implementation of every equation, and this codebase's history (the
   `purchasePlayer` drift bug found in GAME_INTEGRATION_STUDY) shows exactly
   how duplicated logic rots.
2. **The UI is the game.** 23.6k LOC of React + Radix + 726 i18n keys +
   react-query/zustand plumbing. Rust UI (egui/iced) is years behind for
   data-dense, localized, themable game UI; Bevy UI is still churning
   (0.16→0.18 breaking changes; the community openly debates
   architecture-vs-shipping). A rewrite buys −69k LOC of working software.
3. **No perf win where it matters.** The render loop is a static-draw canvas;
   the game logic is server-side. Client Rust optimizes the only component
   that isn't a bottleneck.
4. **Tiny Glade is the exception that proves the rule.** Bevy's flagship
   commercial success (616k copies in month one) used Bevy **ECS + a custom
   renderer**, not the engine's rendering/UI stack — i.e., even the best
   Rust game story is "write your own engine." That's a 2-person-senior-team,
   2-year, single-player diorama. This game needs the opposite: maximum reuse.

Maintenance note: agent-written Rust is viable (this repo already ships
agent-written TS at scale), but Rust's borrow-checker + ecosystem churn tax is
real; confining Rust to the shell keeps that tax on ~1–2k LOC instead of 69k.

**Bottom line:** Rust earns its place as the *product* layer (EXE, updater,
assets, maybe future GPU code) while TypeScript keeps the *game* layer
(UI + shared logic + server). This is also exactly the split that lets every
phase of §7 ship independently.

---

## §7 · Migration plan

Every phase is independently shippable and reversible until M3's page
deletion (which itself can ship as a redirect).

| Phase | Work | Effort | Exit criteria |
|---|---|---|---|
| **M0** | This study → decisions on §9 open questions | — | user rulings |
| **M1 — thin client** | Tauri 2 shell (Stage A: remote-load n38worth.com), UA token `n38worth-windows`, icon/splash, NSIS build, exit guard, fullscreen; reuse `/api/mobile-signin` if OAuth wanted | 2–4 days | EXE installs on a clean Win 10/11 box, plays the full game, Pusher + sounds work |
| **M2 — client hardening** | Taskbar overlay, disk cache for avatars/world, crash pad → analytics route, updater endpoint, sharp-pixel QA pass (image-analyst gate per repo convention) | ~1 week | daily-driver quality; dogfood internally |
| **M3 — Vercel diet** | Delete/redirect web surface per §3.2 (landing stays as marketing one-pager if desired), trim dead routes, keep Android working by keeping the game pages served OR ruling Android end-of-life | 2–4 days | `/api/*` + chosen pages only; build passes; Android decision executed |
| **M4 — bundled UI (Stage B)** | Static-export the client app into the EXE, absolute API base URL, env-driven; keep remote mode as dev fallback | 1–3 weeks | offline shell boots; Steam-ready depot layout |
| **M5 — graphics ladder** | G1 WebGPU → G2 PBR/IBL/post + Kenney GLB path → G3 hero assets | 2–6 weeks + art | visual gates per rung (image-analyst), 2D view untouched |
| **M6 (optional) — Steam** | Steamworks app, SteamPipe upload, overlay QA, `steamworks-rs` if achievements | ~1 week + $100 fee | store page build |

Testing story throughout: the 29 vitest files run unchanged (they test the
pure layer both shells share). QA on Windows uses the same browser-automation
recipes plus the EXE via computer-use; WebGPU must be feature-detected with
WebGL2 fallback so headless/screenshot harnesses (which often lack WebGPU)
keep working.

---

## §8 · Risks & mitigations

| Risk | Severity | Mitigation |
|---|---|---|
| WebView2 GPU variance across user machines | medium | WebGPU is stable in evergreen WebView2 (r345+); feature-detect + WebGL2 fallback; bundle fixed WebView2 for pathological boxes |
| Steam overlay over webview | low | disable overlay initially; test before enabling |
| OAuth in webview blocked | low | already solved for Android (`/api/mobile-signin`); credentials login works in-page |
| Anti-cheat unchanged but also unimproved | info | the exe changes nothing vs a browser (still HTTP JSON); no new attack surface, no relief — F2 holds |
| Web/Android players stranded by "PC only" | medium | keep serving the game UI from Vercel (near-zero cost) so existing clients keep working; "PC only" = where *development* focuses (§9 Q2) |
| Two build pipelines (Rust + TS) | low | Rust surface confined to the shell; Tauri CLI wraps `npm run build` |
| Static-export friction (M4) | medium | app is already `"use client"` everywhere; the real work is absolute API URLs + env; Stage A works indefinitely if M4 stalls |

---

## §9 · Open decisions (need user rulings)

**RULINGS 2026-10-06 (executed same day, wave 1):** Q2 answered — **web and
Android versions die; Windows-local only.** The stated driver is Vercel
cost-per-iteration (build CPU on frequent deploys), so the workflow became:
develop locally (`npm run dev` + `npm run desktop:dev`, $0), deploy only for
server-side changes. Wave 1 SHIPPED LOCALLY (uncommitted): `desktop/` Tauri 2
shell (exe + NSIS built and smoke-tested), the Windows-only gate in
`src/proxy.ts` (redirects every non-desktop visitor to `/windows-only`;
bypasses: `n38-web-preview` cookie via `/api/dev-preview`, `WINDOWS_ONLY=false`
env; verified with 7 runtime cases against a local prod build), i18n keys
(en+zh), `desktop/README.md`. The gate goes live for players ONLY when the
next `vercel --prod` deploy happens.

1. **Steam or direct/itch distribution?** (M6; affects DRM, achievements, updater strategy)
2. ~~Web/Android fate~~ **ANSWERED 2026-10-06: retired.**
3. **Graphics budget for G3** — commission hero assets, or stay CC0/procedural?
4. **Is "triple-A style" a hard requirement or a direction?** If hard, revisit
   §5 G5 honestly — it is a different project; if a direction, G1–G3 is the
   path.
5. **Single-player/offline ambitions?** If the game ever grows an offline
   single-player mode, the calculus changes: the whole simulation could move
   into the client (Rust becomes far more attractive, Vercel shrinks to
   accounts + leaderboards). Not part of "works as it is now," but worth
   deciding before investing in M4/G3.

---

## §10 · Alternatives considered and rejected

- **Full Rust client (Bevy or egui/iced):** rejected — §6 (formula drift, UI
  rewrite, no perf win, Tiny Glade context).
- **Unreal/Unity port:** rejected as default — true AAA tooling but a total
  rewrite that abandons the live backend, tests, i18n, and sibling clients;
  kept as §5 G5 escape hatch.
- **Electron shell:** rejected — §4.1 (carries Chromium; no Rust path).
- **Move the API off Vercel to a VPS:** rejected — contradicts "keep the
  minimum on Vercel," saves ~$20/mo at the cost of ops burden, and Neon +
  Pusher bills remain either way.
- **Single-player conversion (biggest possible Vercel reduction):** rejected
  for now — raids, bounties, chat, leaderboards and world reset *are* the
  game; making them local changes the product, not the platform. Revisited in
  §9 Q5.
- **Cron offload (pg_cron / GH Actions / VPS) to slim Vercel further:**
  rejected — §3.3 (saves ~$0; Hobby ToS blocks commercial games anyway).

---

*Sources for 2026 ecosystem claims: Tauri 2/WebView2/NSIS status and Steam
distribution (tauri.app docs; Steamworks SteamPipe docs; steamworks-rs),
WebGPU in WebView2 r345+ (Construct WebGPU tracker, Sept 2026), three.js
WebGPU/TSL maturation through r182–r186 (threejs.org changelog), Bevy 0.17
(Oct 2025) / 0.18 (early 2026) and Tiny Glade sales (GameDiscoverCo),
Vercel Pro/Hobby cron + invocation limits (vercel.com pricing).*
