# Study: Simplified Chinese (简体中文) localization for n38worth

**Date:** 2026-09-24 · **Status:** implemented locally (see "What shipped" for the
exact scope); nothing committed or deployed.
**Goal:** a fully bilingual English/简体中文 site — every player-facing surface
renders Chinese, users flip languages via a dropdown in the top-right corner,
and the choice persists.

Sources: full inventory of this repo (all 78 components, all page routes, the
lib vocabulary modules, the toast/event-feed/Pusher string paths), plus the
pre-existing English-only i18n skeleton that was already half-wired into the
codebase.

---

## TL;DR

1. **Extend the existing homegrown dictionary system — do NOT adopt next-intl /
   react-i18next.** The whole game is client-rendered (`"use client"` +
   react-query + Pusher everywhere), so a client-side dictionary with a
   ~230-key English source-of-truth and a typed Chinese twin covers ~95% of all
   user-visible text with zero new dependencies, zero route changes, and zero
   extra server cost.
2. **One site, two languages, no separate URL tree.** A `/zh` route prefix
   would mean moving every page under `src/app/[locale]/` (12 game routes +
   auth + public + API exclusions) — high blast radius for near-zero benefit at
   this stage. Instead: instant in-place switching (no reload), persisted in
   `localStorage` + a cookie, with `?lang=zh` as a shareable deep link
   (n38worth.com/?lang=zh) and browser-language auto-detection on first visit.
3. **Game vocabulary translates at DISPLAY time through locale-aware helpers
   beside its data** — the exact pattern the sci-fi rebrand already uses
   (display-name indirection): `cardDisplayName(u, locale)` for the Six,
   `professionName/professionPerk(name, locale)`, `rankTitle(title, locale)`,
   `missionLabel(i, locale)`. DB rows, API values, Pusher payloads and
   usernames stay English forever.
4. **What deliberately stays English in v1** (all need server work — phase 2):
   API error strings surfaced via `data.error`, the 7 game-event DM receipt
   writers (server-attested history written in the ACTING user's request, so
   the recipient's locale is unknown server-side), and the static
   `<title>/OG` metadata. Details + migration sketch in §6.
5. **Zero marginal cost.** No new dependency, no new route, no extra function
   invocation, no middleware change. The zh dictionary ships in the same JS
   bundle as en (a few tens of KB); the language switch is a pure client state
   change. CJK glyphs render via a system-font fallback stack (PingFang SC /
   Microsoft YaHei / Noto Sans SC) — no multi-megabyte webfont.

---

## 1. What existed before (inventory)

A prior half-finished i18n skeleton was already in the tree:

| Piece | State found |
|---|---|
| `src/lib/i18n.ts` | English-only flat dictionary, 100 keys, typed by a hand-written interface; `languageNames`/`languageFlags` exported but unused, listing only `en` |
| `src/components/LanguageContext.tsx` | hardcoded `translations.en`; no locale state, no switching, no persistence |
| `useLanguage()` consumers | 15 files (login/register/players/settings/transactions/history pages; HireButton, SellOutButton, Discard*, BlockSell, SendCredits, GlobalInfoBar, Navbar) — all partially converted, with leftover raw strings even in those files |
| Everything else | ~63 components + pages with hardcoded English, plus game vocabulary in `src/lib/{ranks,professions,display-names,missions-data}.ts` |

String surfaces inventoried (client-authored, so fully covered by a
client-side dictionary):

- All JSX copy: ~78 components + 20 page files, ≈ 18,700 lines total.
- Toasts: `src/lib/event-feed.ts` `toast.*` — every message is authored at the
  call site (client), including `src/hooks/usePlayerEvents.ts` (Pusher event
  toasts like "X bought you!").
- Aria-labels, tooltips (`title=`), placeholders, alt texts.

String surfaces that are NOT client-authored (out of v1 scope, §6): server
`{error}` JSON values from `/api/*`, the 7 DM receipt insert sites
(`pumpPlayer`, `blockSell`, `boost-card`, `reveal-avatar[-short]`,
`send-credits`, `multi-account`), cron-generated rows, and root-layout
`metadata` (title/description/OG — a static export; reading cookies there
would force dynamic rendering of every route, against the cost doctrine).

## 2. Options considered

| | A. next-intl with `[locale]` routes | B. next-intl, cookie-based (no routes) | **C. Extend homegrown system (chosen)** | D. Runtime DOM translation layer |
|---|---|---|---|---|
| New dependency | +40 kB | +40 kB | none | none (or small lib) |
| Route churn | every page moves under `src/app/[locale]/`, API exclusions, middleware rewrite | none | none | none |
| Server-component translation | yes | yes | no (client only) | n/a |
| SEO per language | best (distinct URLs) | weak | weak (`?lang=` only) | none |
| Risk to existing game code | high (auth redirects, `players/[username]`, trailing-slash config) | medium (provider + config wiring) | low (additive) | high (fights React reconciliation) |
| Fits this codebase | poorly — the app is an auth'd SPA-style client app; SSR text is the landing page + tiny chrome | acceptable | **ideal — matches the 15 files already using `t.*`** | rejected on principle |

Why C wins here: the only meaningful SSR text is the landing page, which is
itself a client component (`"use client"` in `src/app/page.tsx`); everything
else renders behind auth in the browser. Per-language SEO URLs are a marketing
question (§8), not a gameplay one, and can be layered on later without
rework — the dictionary and keys stay identical either way.

Rejected-but-noted: next-intl's ICU plural/format power is unnecessary for a
zh target (Chinese has no plural forms, and the game's dates are already
rendered through `date-fns`/`toLocaleTimeString`).

## 3. Architecture as implemented

```
src/lib/i18n.ts                 Locale type, LOCALES, languageNames/Flags,
                                `en` (source of truth), `zh: TranslationKeys`
                                (type-checked — zh can't drift from en),
                                translations record, normalizeLocale()
src/components/LanguageContext  locale state; priority on mount:
                                ?lang= param > localStorage("n38-lang") >
                                navigator.language (zh* → zh) > en;
                                setLocale() persists to localStorage +
                                cookie("n38-lang") and syncs
                                document.documentElement.lang
src/components/LanguageSwitcher dropdown (Globe icon): 🇬🇧 English /
                                简体中文 with a check on the active row;
                                `icon` variant in the game navbar's right
                                control cluster, `pill` variant fixed
                                top-right on landing/auth/public-chat pages
```

Locale-aware game vocabulary (display-time indirection, mirroring the
display-names pattern the sci-fi rebrand established):

| Helper | File | Note |
|---|---|---|
| `cardDisplayName(username, locale)` | `src/lib/display-names.ts` | 六使: 架构师 银行家 先知 锁匠 守钟人 空指针; Botnet → 僵尸网络; `theSixLabel(locale)` → 六使 |
| `rankTitle(title, locale)` | `src/lib/ranks.ts` | all 40 ladder titles mapped (Lurker→潜伏者 … Yotta→尧, Ghost→幽灵 … Hegemon→霸权者) |
| `professionName` / `professionPerk` | `src/lib/professions.ts` | 密码学家 零日客 超频师 缓存管家 服务器执法官 僵尸牧人 + perk copy; DB rows stay English |
| `missionLabel(i, locale)` / `finalGoddessLabel(t, locale)` | `src/lib/missions-data.ts` | "集齐 {n} 个化身，解锁银行家" pattern |

All helpers default to `"en"`, so every existing server-side caller (crons,
DM writers, purchase locks) is untouched.

Conventions (also added to AGENTS.md):

- New user-visible strings MUST get a dictionary key in BOTH `en` and `zh`
  (the `TranslationKeys` type enforces zh completeness at compile time).
- Interpolation via `{param}` placeholders + `.replace()` chains; plurals via
  two keys + ternary.
- CJK font fallback appended in `globals.css` (`--font-sans`/`--font-mono`):
  PingFang SC / Hiragino Sans GB / Microsoft YaHei / Noto Sans SC. Latin
  glyphs still render in Geist; the browser falls back per-glyph.

Known cosmetic behaviors (accepted): first paint is English for zh users
(hydration-safe mount switch — a one-frame flash at worst); `formatCompact`
number suffixes stay K/M (Chinese 万/亿 formatting is a phase-2 nicety);
`uppercase`/`tracking-[…]` CSS classes are no-ops on Han glyphs (harmless).

## 4. The translation glossary (canonical zh terms)

锁定 the core vocabulary so future copy stays consistent:

| English | 简体中文 |
|---|---|
| avatar (player card) | 化身 |
| hire / hire slots | 雇佣 / 雇佣位 |
| credits (¢) | 信用点 |
| boss | 老板 |
| value / portfolio value | 身价 / 投资组合价值 |
| OVERCLOCK | 超频 |
| FIREWALL | 防火墙 |
| BREACH | 击穿 |
| HARD LOCK | 硬锁 |
| CLOAKED / SCAN | 隐匿 / 扫描 |
| BOTNET | 僵尸网络 |
| poach | 挖角 |
| discard | 丢弃 |
| sell out (buy your freedom) | 赎身 |
| combo (profession sale) | 组合出售 |
| perk ("Firmware Perks") | 加成（固件加成） |
| rank / the ladders | 段位 |
| Grid / Widest Grid | 网格 / 最广网格 |
| mission ladder | 任务阶梯 |
| the Six | 六使 |
| root the mainframe / The Root Wall | 攻占主机 / 根墙 |
| the simulation / reboot | 模拟系统 / 重启 |
| hire (as action button GET) | 雇佣 |

## 5. What shipped in this pass

- i18n core (§3) + `LanguageSwitcher` mounted in 4 places: game navbar right
  cluster (desktop + mobile header), landing hero top-right, auth pages
  (fixed), public chat (fixed).
- Landing page fully converted (hero, How-to-Play dialog: getting started,
  earning, the five buttons, bonus avatars, professions/combos, mission
  ladder, rooting the mainframe, CTAs).
- Navbar fully converted (nav labels, wallet chips, mute tooltip, account
  menu, coach mark).
- All 6 lib vocabulary modules made locale-aware (§3 table).
- A coordinated sweep of the remaining ~70 components/pages: 8 parallel
  batches (market/cards, leaderboard/ranks, ownership/home, action buttons,
  settings/onboarding, chat/history, missions/goddesses, misc/countdowns)
  converting every user-visible string to `t.*` keys; new keys land in the
  merged dictionary with zh translations.
- `privacy`/`terms` pages converted (client components now).

Final numbers (2026-09-24): **91 files changed, 1,016 dictionary keys**
(207 hand-authored base + 809 swept via 8 batches), zero new dependencies,
`tsc --noEmit` clean, `eslint` 0 errors, `npm run build` green, and a
production-build browser smoke test verified: `?lang=zh` deep link, full
Chinese How-to-Play dialog, dropdown switching back to English, locale
persistence (localStorage + cookie + `<html lang>`) across navigation, and
CJK font rendering.

## 6. Deliberately English in v1 (phase-2 menu, with effort estimates)

| Surface | Why it's English now | Phase-2 fix |
|---|---|---|
| API error strings (`data.error`) | Authored server-side in ~40 routes; translating by string-matching is brittle | Return error CODES + translate client-side (`errors: {notEnoughCredits: …}`); biggest single win, ~1–2 days |
| DM receipts (7 insert sites) | Written in the actor's request; recipient's locale unknown; rows persist forever (translating at render time would need pattern-matching persisted English) | Add `users.locale` column (⚠ shared Neon prod DB — drizzle schema change needs its ALTER migration same-day, see AGENTS.md) and write receipts in the recipient's locale, or bilingual rows |
| Root `<title>`/OG metadata | Static export in the root layout; `cookies()` there forces every route dynamic (cost doctrine) | `generateMetadata` reading the cookie only for `/` (a dedicated landing `layout`), or per-locale landing routes later |
| `formatCompact` K/M suffixes | `Intl.NumberFormat("en")` hardcoded in helpers | Pass locale through to `Intl.NumberFormat(locale === "zh" ? "zh-CN" : "en")` |
| Cron/event-feed rows authored server-side | Same as API errors | Phase 2 with error-code-style keys |

## 7. QA / rollout plan

1. `npx tsc --noEmit` + `npm run lint` + `npm run build` locally (done as part
   of this pass).
2. Manual pass in dev: switch to 中文 on the landing page, register-flow
   walkthrough, navbar, market, profile, ownership lists, settings, chat
   shell, tutorial overlay, world-reset copy. Check long-string overflow
   (Chinese is usually SHORTER than English — low risk) and the two
   hero tagline letter-spacing classes (no-ops on CJK).
3. Deploy only when asked (per repo workflow): commit + `npx vercel --prod
   --yes` together.
4. Post-deploy smoke: n38worth.com/?lang=zh renders Chinese from first paint
   for a zh browser; switching back to English persists across sessions.

Rollback: revert the commit — no DB/env/migration coupling whatsoever.

## 8. Open questions (for the game owner)

1. Per-language URLs for SEO (e.g. `n38worth.com/zh` mirroring `/` only —
   a thin marketing page, not the whole game tree)? Recommended only if
   Chinese acquisition via search becomes a channel (see
   DISTRIBUTION_STUDY.md).
2. Server errors → codes (§6 row 1): worth doing regardless of language.
3. Auto-detect stays on? (First visit with a zh browser → Chinese.) Easy to
   make opt-in-only by deleting two lines in `LanguageContext.tsx`.
4. Traditional Chinese (繁體) later = one more dictionary file + one menu
   entry; the architecture already supports it.
