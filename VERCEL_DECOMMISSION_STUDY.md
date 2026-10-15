# VERCEL_DECOMMISSION_STUDY — deleting the networth project from Vercel and repurposing n38worth.com

Requested 2026-10-15 ("delete this project from vercel, and use the domain
for something else — do a study on how to execute this"). This document maps
what actually depends on the Vercel project, what deletion really costs and
kills, and gives an ordered execution runbook. Nothing here has been executed.

---

## 1. What the Vercel project IS (dependency map)

Since the Windows-only pivot (2026-10-06), the game is split-brain:

| Piece | Where it lives | Survives deleting the Vercel project? |
|---|---|---|
| Game UI | Bundled inside the exe (`out/` static export) | Yes (but useless, see next row) |
| **Entire API** (48 mutations, 27 reads, `/api/client-session` auth, proxy gate) | **Vercel project `networth`** | **NO — this IS the game** |
| 11 crons (rewards, taxes, snapshots, demo cleanup…) | Vercel project | NO (die with the project — intended) |
| Player/economy database | Neon (separate account, `NEON_PROJECT_ID` in `.env.local`) | Yes, until you delete the Neon project (§4.5) |
| Realtime (Pusher channels) | Pusher (separate account) | Yes, but with no API to auth/publish it goes silent |
| Auto-updater + installers | GitHub `ex4n1m0/n38worth-master` Releases (public) | Yes (independent of Vercel) |
| Source repos | `ex4n1m0/n38worth` (private, origin) + `n38worth-master` (public) | Yes |
| Domain `n38worth.com` | **Registered through the Vercel registrar**, Vercel nameservers, expires 2027-03-07 | Yes — but only if you keep the TEAM (§4.4 warning) |
| Landing page + Download CTA + OG images | Vercel project | NO |
| Third-party keys on the project | Pusher, Unsplash, Google/Facebook OAuth, DeepSeek (AUTOPILOT_BUILTIN_*), AGENT_LLM_*, TMDB, CRON_SECRET | Keys keep existing in those services (§4.6) |

**Bottom line: the exe is only a shell. Every login, market action, city
fetch, and reward goes to `https://n38worth.com/api/*` (baked into the build
as `NEXT_PUBLIC_API_BASE`). Deleting the Vercel project kills the game for
every installed client.** That is the intent here — but it should be a
conscious yes.

## 2. Cost reality check (be honest about what this saves)

- The Vercel **team `timedivision`** also runs `deep-flux` (deepflux.space,
  updated 9h ago) and `tracker` (modelswarm.deepflux.space, updated 23h ago).
  Both are active. **The Pro subscription stays regardless** — deleting
  networth does NOT cancel $20/mo.
- What deletion actually saves: networth's function invocations/GB-hrs,
  build minutes, and bandwidth — at current scale (~27 human accounts, slow
  polls, CDN-cached public reads) this is likely **a few dollars a month at
  most**.
- The real content of this decision is **decommissioning the game**, not
  infrastructure savings. If cost were the only driver, Option B (§3) is the
  cheaper surgical cut.

## 3. Options

- **A. Full sunset (the request)** — delete the Vercel project, keep +
  repurpose the domain. Runbook in §4.
- **B. Freeze, don't delete** — strip `vercel.json` crons (11 entries) +
  deploy once: rewards/taxes/snapshots stop, the world goes static, function
  spend drops to near zero, but the game stays reachable (login, market,
  city) and can be revived by reverting one deploy. Costs ~nothing ongoing on
  top of the plan you keep anyway. Choose this if there's any chance of a
  revival or you want the exe to stay demo-able.
- **C. Move the API off Vercel** — self-host / another platform. Not studied;
  the API is Next-route-coupled (middleware, cron table), so this is a port,
  not a config change. Only worth it if the game should live but Vercel must
  go — it doesn't (the other projects stay).

## 4. Execution runbook (Option A, in order)

### 4.0 Preconditions
- You are signed in to `vercel` CLI under team `timedivision`, `gh` as
  ex4n1m0 (both true on this machine), and Neon console access.

### 4.1 Back up the database FIRST (irreversible otherwise)
```
# full logical backup (run from repo root; use the pooled URL)
pg_dump "$DATABASE_URL" --no-owner --no-privileges -Fc -f n38worth-final-$(date +%Y%m%d).dump
# verify: pg_restore --list n38worth-final-*.dump | head
```
Keep the dump + this repo + `desktop/tauri-updater.key` together — that
triple is the complete revival kit.

### 4.2 Optional but decent: one final "city closed" release (est. 30–60 min)
Installed clients (auto-updated to 1.0.4) will otherwise show raw failures
against a dead API. A last release 1.0.5 with a small client-side change —
"service retired" screen after `/api/landing-data` fails N times — closes it
properly. Requires Vercel still alive for nothing (it's pure UI). Skip if you
don't care what ~27 installed exes show.

### 4.3 Delete the Vercel project
```
vercel project rm networth --yes --scope timedivision
```
(or Dashboard → networth → Settings → Advanced → Delete). This
automatically kills the 11 crons and every `/api/*` route.
`n38worth.com` then serves Vercel's "no deployment" page until §4.4.

### 4.4 The domain — the part with real footguns
`n38worth.com` is **registered through Vercel** (registrar + nameservers,
expires 2027-03-07, auto-renew on). Two safe paths:

1. **Keep it on Vercel, point it anywhere (recommended, zero risk):**
   deleting the project does NOT delete the domain — it stays in the team.
   In Dashboard → Domains → n38worth.com, add records pointing at the next
   thing (A/CNAME to GitHub Pages, Cloudflare Pages, another Vercel project
   on the same team, or a redirect). Vercel DNS hosting is free; renewal is
   charged at registrar cost (~$10–12/yr for .com).
2. **Transfer the registrar out** (only if divorcing Vercel entirely):
   Domain → Transfer → unlock + EPP code → initiate at Cloudflare/Namecheap.
   ICANN 60-day transfer locks apply after recent changes; DNS must be moved
   to the new provider's nameservers as part of it. More steps, no benefit
   unless the team itself is going away.

> **WARNING: never delete the Vercel team/account as part of this.** The team
> holds BOTH domains (`n38worth.com` AND `deepflux.space`) plus the two other
> live projects. Delete the `networth` project only.

### 4.5 Neon (the database)
The Vercel deletion leaves Neon untouched. After the backup in 4.1:
delete the Neon project (console → project → Settings → Delete). Until you
do, storage keeps existing (relevant on plans with storage limits).

### 4.6 Third-party keys & apps (cleanup, ~15 min)
- **Pusher**: delete the app (or leave — no traffic once the API is gone;
  billing only matters on paid plans).
- **DeepSeek** `AUTOPILOT_BUILTIN_API_KEY` (+ `AGENT_LLM_API_KEY`): revoke —
  these are the only keys that can bill by usage.
- **Unsplash** production key: revoke.
- **Google / Facebook OAuth apps** (web login, retired anyway): delete.
- **TMDB_API_KEY**: appears unused by any current code path — revoke.

### 4.7 GitHub
- `ex4n1m0/n38worth` (private, source of record): **archive**, keep. Or push
  a final tag `sunset-2026` first.
- `ex4n1m0/n38worth-master` (public; doubles as the **auto-updater
  endpoint** via `releases/latest/download/latest.json`): archive and keep —
  installed 1.0.4 clients will keep polling it (harmless after §4.2; they
  just stay on 1.0.4). Deleting the repo instead turns the updater poll into
  a 404 — also harmless, but keeps nothing for posterity.

### 4.8 Local machine
Keep with the backup: this repo (full source), `desktop/tauri-updater.key`
(signing key — REQUIRED if you ever cut a sunset or revival release),
`desktop/src-tauri/target/release/bundle/nsis/*` (built installers).

### 4.9 Post-mortem checklist
- [ ] `n38worth.com` serves the new destination (not a Vercel error page)
- [ ] `curl https://n38worth.com/api/landing-data` → 404/parked as expected
- [ ] Vercel team still lists deep-flux + tracker + both domains
- [ ] Neon project gone; dump restores locally (`pg_restore` into a scratch DB)
- [ ] Pusher silent; DeepSeek/Unsplash/OAuth keys revoked
- [ ] Repos archived; local revival kit stored in 2 places

## 5. Domain reuse ideas
- Simplest: A/CNAME to a free static page for the next project (GitHub/Cloudflare Pages) — "from the maker of n38worth".
- Redirect (Vercel domain → `deepflux.space`) if the next thing is one of the sibling projects.
- Park on Vercel DNS until decided (~$10–12/yr renewal).

## 6. Risks & rollback
- **Reversible until 4.5**: re-deploy any commit (`vercel --prod`), re-attach
  the domain, and the game is back — DB untouched.
- **After Neon delete (4.5)**: revival = fresh Neon + `pg_restore` from the
  dump + re-deploy. Data survives; secrets need re-entry (env vars die with
  the project in 4.3 — they're all listed in §1/§4.6 and recoverable except
  none are exotic).
- **Players**: ~27 human accounts lose live progress (preserved in the dump).
- **Domain**: auto-renew is ON — if the plan is to LET IT LAPSE instead,
  turn auto-renew off deliberately (letting a .com lapse invites squatters;
  not recommended).

## 7. Appendix — what actually broke in the client today (2026-10-15)

The "city doesn't load / Home flashes" report was root-caused before this
study: the desktop client on this machine was signed in as a **ghost demo
account** ("Demo Player_522", created during release-1.0.4 verification,
auto-deleted ≤1h later by the `delete-demo-players` cron). The client kept
the still-signature-valid token; `/api/client-session` echoes the JWT
payload **without checking the account exists**, so every page rendered
half-broken against a deleted user (city error state, profile → /player
redirect chain, flashing transitions). The ghost session was cleared from
the client's webview storage; a fresh login with a real account is the
immediate user-side fix. Two real hardening gaps remain if the game were to
stay: (a) `/api/client-session` GET should 401 when the user row is gone,
and (b) the city page treats any fetch failure as a sticky terminal error
(`if (!res.ok) return null` caches the failure instead of retrying). Those
are moot under Option A.

## 8. Recommendation

Execute §4 in order: **backup (4.1) → optional sunset release (4.2) →
delete project (4.3) → repoint domain (4.4) → Neon delete (4.5) → key
revocations (4.6) → archive repos (4.7)**. Total effort ≈ 1–2h plus the
optional release. If any part of you wants the game inspectable later,
do 4.1 religiously — the dump is the game.
