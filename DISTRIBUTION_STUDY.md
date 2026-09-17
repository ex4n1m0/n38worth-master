# Distribution & Audience Study — n38worth (2026-09-17)

Where to publish/promote the game to find interested users, based on the current
state of each channel (researched 2026-09) and the product's actual strengths.

---

## 1. What we're placing

**n38worth — "the human trading simulation"**: a free, persistent,
browser-based multiplayer economy game where every player is a tradeable card.

Assets that matter for distribution (most channels only care about these):

- **Zero-friction trial** — "Try as Guest" creates a demo avatar and drops the
  visitor straight into the game. No signup wall before fun. This is the single
  most important property for link-drop channels (HN, Reddit, Discord).
- **A one-line hook that self-explains**: "a stock market where the assets are
  the players." The friend.tech/Empire Avenue lineage is instantly familiar to
  tech audiences — without the crypto baggage, which is a plus on HN/Reddit.
- **Matrix/terminal aesthetic** — code rain, CRT scanlines, neon-on-black.
  Screenshots and 15-second clips sell it with zero explanation. Extremely
  aligned with the Hacker News / programmer demographic.
- **Idle-friendly loops** — hourly portfolio rewards, daily Banker reward,
  missions, +slots progression. Gives r/incremental_games-style players a reason
  to return daily even when the human population is low.
- **Built-in drama** — firewalls, breaches, poaching, and the public 1-hour
  "X is 12:34 from rooting the mainframe" countdown. These are the moments that
  become screenshots and short videos.
- **A real tech-stack story** — Next.js 16 / Neon / Drizzle / Pusher /
  Vercel serverless, heavy cost-control engineering, an AI-generated art
  pipeline. Developer audiences (HN, dev.to) respond to the build as much as
  the game.

Constraints to keep in mind:

- **Multiplayer needs critical mass.** Burst channels (HN, big subreddits) are
  actually the *right* shape for this: they deliver concurrent-population
  spikes rather than a trickle that dies. The NPC pool keeps a quiet server
  looking alive in between.
- **No monetization** — the goal is players, not revenue, which widens the
  acceptable channel list (portals, jams-adjacent communities, press).
- **Billing sensitivity** (per AGENTS.md): any spike plan must account for Neon
  connection limits, Vercel concurrency, and Pusher concurrent-connection caps.
- **Copy accuracy**: the landing page still claims "six autonomous daemon
  processes hunt Avatars around the clock" — false since the agent cron was
  disabled (2026-08-21). HN/Reddit commenters *will* test this and call it out.
  Fix the copy before any launch.

## 2. Who would actually play this

| Persona | Why they bite | Where they live |
|---|---|---|
| **The tech-curious HN reader** | "Stock market of people" + Matrix aesthetic + build story. Plays for a week via guest mode, tells coworkers. | Hacker News, Lobsters, dev.to |
| **The incremental/idle gamer** | Hourly rewards, slots, missions, 10× combo sale = a progression game wearing a PvP skin. Highest expected D30 retention of any persona. | r/incremental_games (+ its Discord) |
| **The webgame browser** | Plays whatever's linked, judges in 60 seconds. Guest mode passes their test. | r/WebGames, itch.io, Newgrounds, portals |
| **The social-competitive memer** | Buys friends, gets bought, screenshots the countdown, starts rivalries in chat. This persona *is* the content engine. | TikTok/Shorts/Reels, X, Discord |
| **The Matrix/cyberpunk fan** | Not a channel by itself — a content angle that raises conversion on all of the above. | everywhere |

Historical caution: Empire Avenue (2010–2015) and friend.tech (2023–24) both
proved the "trade shares of people" model attracts a burst of users — and that
the burst fades when the social meta-layer stagnates. n38worth's firewall/
breach/root-the-mainframe conflict is exactly the differentiator to lead with
in marketing copy, because it's what those predecessors lacked.

## 3. Channel analysis

Fit rated ●●●●● (5 = highest). "Effort" is one-time unless noted.

### 3.1 Hacker News — Show HN ●●●●●

The single best-fit burst channel: Matrix theme, no-crypto "social stock
market", instant guest play, and a genuine solo-dev engineering story.

- **How**: post `Show HN: n38worth – a stock market where the assets are the players`
  Tuesday–Thursday, ~8–10am ET (US morning). You only get one first post —
  spend it when the game is polished and the server can take it.
- **Etiquette**: HN punishes promotion and rewards candor. Disclose solo-dev
  status, share stack details and numbers in comments, answer every question
  in the first hours. Don't ask anyone to upvote (they detect and penalize it).
- **Expectation**: a typical Show HN gets 200–2,000 visits; front page is
  10k–50k. Either outcome is fine — the front page can only be re-attempted
  with a substantially different angle (e.g. a later "we rooted the mainframe
  for the first time" story post).
- **Risk**: signup-wall skepticism (mitigated by guest mode) and traffic cost.

### 3.2 Reddit ●●●●● (staggered, not simultaneous)

Reddit is several distinct communities with distinct rules. Sequence posts
days apart so each gets its own traction.

| Subreddit | Rules / notes | Fit |
|---|---|---|
| **r/WebGames** | Direct link to the playable game; **title must start with the game name** (e.g. `n38worth – hire, overclock and poach real players in a human stock market`). No downloads. Exactly our format. | ●●●●● |
| **r/incremental_games** | Self-promo restricted to weekly **Feedback Friday** threads (plus occasional milestone posts per sidebar rules). Community has made solo devs' careers off two posts. Frame honestly: an idle-flavored PvP market game, not a pure cookie-clicker. | ●●●●● |
| **r/playmygame, r/IndieDev, r/indiegames, r/IndieGaming** | Dev-friendly showcase subs, low traffic but easy and safe. | ●●● |
| **r/InternetIsBeautiful** | **Ruled out** — webgames and login-required sites are explicitly banned (they redirect webgames to r/webgames). | ✗ |
| **r/gaming, r/games** | 47M/3M subs but ~10% self-promo rule + harsh crowds. Only after an established account history; low priority. | ●● |

Sitewide: keep self-promo under ~10% of account activity, comment in these
communities for a couple of weeks before posting your own link, disclose
ownership ("I made this").

### 3.3 Indie webgame press ●●●● (cheap, credible backlinks)

- **[AlphaBetaGamer](https://www.alphabetagamer.com/)** — "world's largest beta
  testing site," actively covers indie/browser games via a
  [submissions page](https://www.alphabetagamer.com/contact-us/); site features
  want "in development" games (a "open beta" framing fits), completed games can
  still go to their YouTube channel (~large indie audience).
- **[FreeGamePlanet](https://www.freegameplanet.com/)** — daily browser-game
  coverage, overlapping audience.
- Both send modest traffic (hundreds to low thousands) but give credible
  third-party descriptions to point to later ("as seen on…").

### 3.4 Web game portals ●●● for CrazyGames; ✗ for Poki

- **CrazyGames** (~20M monthly players): supports server-hosted multiplayer —
  they host only the static client, your API stays on Vercel. Requirements:
  ≤50MB initial / ≤250MB total, multiplayer requires CrazyGames account
  integration via their SDK (guest/demo identity would need mapping), manual QA.
  Our Next.js client would need a static-export build (`out/` already exists
  for the Capacitor build) pointing at the production API — real but bounded
  work. Worth it only after the launch channels prove retention.
- **Poki**: **ruled out** — demands lifetime web exclusivity (incompatible with
  our own domain) plus portrait-mode support and manual QA.
- **itch.io**: a listing with a strong banner GIF costs an hour and converts
  poorly for persistent multiplayer (their discovery is devlog/jam-driven),
  but it's a credible homepage and a place for the AlphaBetaGamer crowd to
  find you. Do it on launch week; don't expect much.
- **Newgrounds**: HTML5 uploads work, niche traffic, feedback culture. Optional.

### 3.5 Product Hunt ●●●

All-or-nothing: top-3 launches get more traffic in hours than every other
launch site combined; everything else gets ~nothing, and games are not PH's
focus. Do it *after* HN/Reddit, on a Tuesday, with the gallery (og.jpg),
a "human trading simulation" tagline and at least one outside hunter if
possible. Value is mainly the badge + SEO backlink. Also list on a couple of
the smaller launch directories (LaunchList maintains a current list) — they
send little traffic but cost minutes each.

### 3.6 Social & short-form video ●●●● (the compounding channel)

- **Bluesky**: the gamedev community largely moved here from X. Custom feeds
  ("Game Dev" by @trezy.codes, "Indie Devs & Games") replaced hashtag
  discovery; #ScreenshotSaturday and #WIPchat still function. The game's
  neon/matrix look photographs extremely well — post the countdown banner,
  poach notifications, the Root Wall.
- **X**: smaller but still hosts #ScreenshotSaturday and an active
  Indie Game Devs community. Crosspost; low marginal cost.
- **TikTok / YouTube Shorts / Reels**: the only channel with unbounded upside.
  Consensus format for 2025–26: 15–40 seconds, hook in the first second
  (spectacle / satisfaction / "wait, what?"), genuine voice, volume over
  polish. Native hooks this game already has: *"a stranger bought me for
  4,000¢ and I can't escape"*, *"someone is 12 minutes from winning and
  everyone is trying to stop them"*, combo-sale payoff, breach revenge arcs.
  This is a standing habit (2–3 clips/week), not a launch-day action.
- **A dev.to / Medium build-story article** ("How I built a stock market where
  the assets are the players — on Next.js and $X/month") doubles as evergreen
  SEO and is exactly the kind of post that gets resubmitted to HN organically
  by readers.

### 3.7 Discord ●●●● (retention, not acquisition)

A multiplayer game with in-game chat still needs a Discord: it's where
rivalries, coalition-building and "the server roots the mainframe" moments get
organized, and where a launch spike turns into a daily population. Create the
server in the prep phase, seed it with the first 20–30 players, link it in-game.
For acquisition, post in community servers that allow it (Indie Games Discord
~21k members, Game Dev Network, Alpha Beta Gamer's server) per each server's
promo rules.

### 3.8 Google Play (existing Capacitor build) ●●

The `android/` build means a Play listing is available, but Play indie
discovery is weak and the game is web-first; maintenance cost of a second
platform is real. Treat as a later "convenience for retained players" step
(install icon on their phone), not an acquisition channel. A PWA install
prompt may capture most of the same value for free.

### 3.9 Developer-ecosystem showcases ●

Vercel's "Made with Vercel" / Next.js showcase gallery: trivial to submit,
tiny traffic, small credibility boost with exactly the HN-adjacent audience.
Five minutes, do it once.

## 4. What NOT to do

1. **r/InternetIsBeautiful** — webgames and signups are explicitly banned.
2. **Poki** — lifetime web exclusivity conflicts with owning the domain/community.
3. **Posting everywhere within the same hour** — each community's algorithm
   needs its own traction window; also reads as spam. Stagger by days.
4. **Vote manipulation / "please upvote" asks** — detectable, punishable,
   and fatal on HN.
5. **Rebuilding the game as a portal-native static client before proving
   retention** — CrazyGames integration is real work; do it only if the launch
   channels show the game retains.
6. **Launching on stale copy** — fix the "autonomous daemons hunt around the
   clock" claim (agent cron is disabled) before putting the landing page in
   front of thousands of nitpicky early adopters.

## 5. Recommended launch plan

**Phase 0 — Prep (before any posting)**
- ~~Fix inaccurate landing copy~~ ✅ done 2026-09-17 (daemon claim replaced; combo
  firewall caveat added; in-game vocabulary refreshed).
- ~~Add lightweight analytics + UTM-tagged links~~ ✅ done 2026-09-17: self-hosted,
  no third parties — `analytics_events` table (drizzle/0022), landing-visit
  beacon (`src/lib/utm.ts`, first-touch UTM cookies, 30d), signup attribution
  wired into all 5 account-creation sites (register, demo, quickplay, both
  OAuth paths). Report: `npm run analytics:summary [days]`. Channel links in
  §7. **Requires `npm run db:push` (or running drizzle/0022 SQL) on deploy.**
- Stand up the Discord server; link it in-game. *(manual — needs your account)*
- Load/cost sanity check — see §6 (main finding: **Pusher free tier caps at 100
  concurrent connections**; check the plan before launch day).
- Recruit 10–20 friendly users (personal network) so new visitors see a living
  economy, chat scroll, and an active countdown. *(manual)*

**Phase 1 — Burst week (the one shot at each community)**
1. Tue–Thu morning ET: **Show HN**.
2. +2–3 days: **r/WebGames** (title starts with `n38worth –`).
3. That Friday: **r/incremental_games Feedback Friday** thread.
4. Same week: **itch.io listing** + submit to **AlphaBetaGamer/FreeGamePlanet**.

**Phase 2 — Consolidation (weeks 2–4)**
- r/playmygame, r/IndieDev, r/indiegames, r/IndieGaming posts.
- A milestone post back to r/incremental_games / HN only if there's news
  (first mainframe root, big numbers — "1,000 avatars traded").
- **Product Hunt** Tuesday launch + smaller directories.
- dev.to build-story article.

**Phase 3 — Compounding (standing habits)**
- 2–3 short videos/week (TikTok/Shorts/Reels) using the native drama hooks.
- Bluesky/X #ScreenshotSaturday cadence + community management in Discord.
- Decide on CrazyGames portal integration based on Phase 1–2 retention data.
- Optionally ship the Google Play listing for retained players.

## 6. Load & cost sanity check (2026-09-17, code-grounded)

What actually happens if a Show HN post sends a burst at n38worth.com:

- **Neon (database): not the bottleneck.** The app uses the
  `@neondatabase/serverless` HTTP driver (`src/db/index.ts`) against the
  project's *pooler* endpoint — every query is a stateless HTTPS call, no
  connections are held by Vercel functions, and the pooler absorbs
  concurrency. Burst cost = more in-flight queries, not connection-limit
  errors. Watch Neon compute autoscaling/size on the dashboard during the
  spike, nothing more.
- **Vercel (functions): cheap by design.** The landing page is static, and
  the heavily-hit public GETs (landing-data, ranks, hall-of-fame…) are
  already CDN-cached with s-maxage — a flood of first-time visitors mostly
  hits the edge, not functions. Function load comes from game-action POSTs
  (fine on Pro) plus one tiny analytics beacon POST per visit.
- **Pusher (realtime): the real ceiling.** Every open game tab holds ONE
  socket connection. The **Sandbox (free) plan allows 100 concurrent
  connections and 200k messages/day** — meaning at most ~100 players with
  the game open at once; past that, new subscribers are rejected and those
  players fall back to the (slow) polling. The Startup plan ($49/mo) raises
  this to 500 connections / 1M messages. **Before launch day: check which
  plan the app is on, and either upgrade for launch week or consciously
  accept degraded realtime for visitors past the cap.**
- A realistic pre-launch smoke test without any tooling: open the game in
  N incognito windows (N = expected concurrent), confirm the countdown/
  chat stay live, and watch Vercel + Neon dashboards. For bigger numbers,
  `k6 http https://n38worth.com/api/landing-data` with 200 VUs for 5 minutes
  exercises the exact cached path a HN flood hits.

## 7. Channel launch links (UTM-tagged)

Base: `https://n38worth.com`. The beacon records both UTM tags and the
referrer domain, so even untagged links (e.g. the bare domain in a Show HN
post — do NOT tag that one, it looks spammy on HN) are attributed via their
referrer (`news.ycombinator.com`). Tagged links to paste per channel:

| Channel | Link |
|---|---|
| Show HN post URL | `https://n38worth.com` (bare — referrer attribution) |
| HN comment / social bios | `https://n38worth.com/?utm_source=hackernews&utm_medium=referral&utm_campaign=show-hn` |
| r/WebGames post | `https://n38worth.com/?utm_source=reddit&utm_medium=social&utm_campaign=webgames` |
| r/incremental_games (Feedback Friday) | `https://n38worth.com/?utm_source=reddit&utm_medium=social&utm_campaign=incremental-games` |
| other subreddits | `…?utm_source=reddit&utm_medium=social&utm_campaign=<subreddit-name>` |
| Bluesky posts | `…?utm_source=bluesky&utm_medium=social&utm_campaign=launch` |
| X posts | `…?utm_source=twitter&utm_medium=social&utm_campaign=launch` |
| TikTok / Shorts bio | `…?utm_source=tiktok&utm_medium=video&utm_campaign=launch` |
| YouTube Shorts bio | `…?utm_source=youtube&utm_medium=video&utm_campaign=launch` |
| itch.io page button | `…?utm_source=itch&utm_medium=referral&utm_campaign=launch` |
| Product Hunt | `…?utm_source=producthunt&utm_medium=referral&utm_campaign=launch` |
| dev.to build-story article | `…?utm_source=devto&utm_medium=referral&utm_campaign=build-story` |
| Discord servers / invite embeds | `…?utm_source=discord&utm_medium=social&utm_campaign=<server-name>` |

After each posting wave: `npm run analytics:summary 7` — visits, signups and
conversion % per channel, first-touch attributed.

## 8. Honest expectations

- Realistic total for a well-executed Phase 1 without a front-page hit:
  **~1k–5k visitors, 200–800 signups**, of which idle-loop players retain best.
- One front-page event (HN or a viral clip) changes the order of magnitude but
  cannot be planned for — only made survivable (Phase 0 load check).
- The genre's history (Empire Avenue, friend.tech) says the burst decays in
  months unless the social meta stays interesting. The sustainable levers are
  the ones that manufacture stories: countdown drama, rivalries, the Root Wall.
  Marketing should feed those back out (clips, weekly recap posts) rather than
  only acquiring.

## Sources

- [How to launch on Hacker News (Marke Pear)](https://www.markepear.dev/blog/dev-tool-hacker-news-launch) ·
  [Lucas F. Costa's HN launch guide](https://lucasfcosta.com/blog/hn-launch) ·
  [Best game Show HNs](https://bestofshowhn.com/search?q=game)
- [20 subreddits that allow game promotion](https://www.reddit.com/r/GameDevelopment/comments/1peg1zs/here_are_20_subreddits_that_allow_you_to_promote/) ·
  [r/incremental_games Feedback Friday](https://www.reddit.com/r/incremental_games/comments/1wd5ffs/feedback_friday/) ·
  [r/WebGames](https://www.reddit.com/r/WebGames/) ·
  [r/InternetIsBeautiful rules](https://www.reddit.com/r/InternetIsBeautiful/wiki/rules/) ·
  [Reddit promo tips (GameDeveloper)](https://www.gamedeveloper.com/business/don-t-get-downvoted-some-tips-for-promoting-your-indie-game-on-reddit)
- [CrazyGames requirements](https://docs.crazygames.com/requirements/intro/) ·
  [CrazyGames multiplayer docs](https://docs.crazygames.com/requirements/multiplayer/) ·
  [Poki requirements](https://developers.poki.com/guide/requirements-quality) ·
  [Poki 2026 blog (portrait requirement)](https://poki.com/blog/building-web-browser-games-2026)
- [itch.io launch guide](https://app.cinevva.com/guides/itch-io-launch-guide) ·
  [Staying on itch's front page (Luden.io)](https://blog.luden.io/how-we-stayed-on-the-front-page-of-itch-io-for-over-a-month-8e0d0cf1cc17) ·
  [Newgrounds game guidelines](https://www.newgrounds.com/wiki/help-information/terms-of-use/game-guidelines)
- [AlphaBetaGamer](https://www.alphabetagamer.com/) ·
  [FreeGamePlanet](https://www.freegameplanet.com/)
- [Bluesky for game devs (r/gamedev guide)](https://www.reddit.com/r/gamedev/comments/1grfxsk/for_game_developers_on_bluesky_new_twitter_heres/) ·
  [Game Developer on Bluesky](https://www.gamedeveloper.com/business/what-are-game-developers-getting-out-of-bluesky-)
- [TikTok for indie games 2025 (Acorn Games)](https://acorngames.gg/blog/2025/8/10/the-indie-devs-guide-to-mastering-tiktok-in-2025) ·
  [Bugnet TikTok guide](https://bugnet.io/blog/tiktok-marketing-for-indie-games) ·
  [How to Market a Game (Zukowski)](https://howtomarketagame.com/2022/02/14/how-to-go-viral-on-tiktok/)
- [Empire.Kred history](https://en.wikipedia.org/wiki/Empire.Kred) ·
  [CNN on Empire Avenue (2011)](http://www.cnn.com/2011/TECH/web/08/16/empire.avenue/index.html) ·
  [What is friend.tech (CoinMarketCap)](https://coinmarketcap.com/academy/article/what-is-friendtech)
- [Product Hunt alternatives (LaunchList)](https://getlaunchlist.com/blog/product-hunt-alternatives)
- [Pusher Channels plans](https://pusher.com/channels/) ·
  [Pusher plan limits (Bird docs)](https://docs.bird.com/pusher/account-billing/account-billing/plans/how-does-my-channels-plan-level-affect-the-limits-of-my-apps)
