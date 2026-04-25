# Cron Jobs Report - NetWorth Project

## Overview
This project uses **Vercel Cron Jobs** for scheduled tasks. There are **8 cron jobs** configured in `vercel.json`, all with active implementations.

> ⚠️ Per-minute crons (`*/1 * * * *`) require a Vercel plan that supports that frequency.
> On Hobby, sub-daily crons are not guaranteed and can silently degrade the
> Goddess countdown / game-win pipeline (see job #8).

---

## 1. Portfolio Reward (`/api/cron/portfolio-reward`)
- **Schedule:** `*/10 * * * *` (every 10 minutes)
- **Purpose:** Distributes 0.2% of portfolio value as credits to all active players
- **File:** `src/app/api/cron/portfolio-reward/route.ts`

---

## 2. Random Player (`/api/cron/random-player`)
- **Schedule:** `*/3 * * * *` (every 3 minutes)
- **Purpose:** Creates new random NPC players and cleans up old/inactive NPCs
- **Logic:**
  - Creates new random player with randomized stats
  - Cleans up unowned NPCs older than 1 day
  - Cleans up NPCs offline 3+ days with $2 or less credit and $1 value
- **File:** `src/app/api/cron/random-player/route.ts`

---

## 3. Random Player Status (`/api/cron/random-player-status`)
- **Schedule:** `*/1 * * * *` (every minute)
- **Purpose:** Status check for NPC creation timing (read-only)
- **File:** `src/app/api/cron/random-player-status/route.ts`

---

## 4. Offline Penalty (`/api/cron/offline-penalty`)
- **Schedule:** `0 * * * *` (every hour at minute 0)
- **Purpose:** Credit decay for inactive players + idle-user ownership decay
- **Logic:**
  - 1% credit decay per hour for inactive players
  - After 24h offline, humans lose 1 owned NPC per additional hour (oldest first)
  - Goddesses are RELEASED (not deleted); non-goddess NPCs are hard-deleted
- **File:** `src/app/api/cron/offline-penalty/route.ts`

---

## 5. Leaderboard Prizes (`/api/cron/leaderboard-prizes`)
- **Schedule:** `0 * * * *` (every hour at minute 0)
- **Purpose:** Distributes prizes across leaderboard categories + cleans up quick-play accounts
- **File:** `src/app/api/cron/leaderboard-prizes/route.ts`

---

## 6. Rank Bonus (`/api/cron/rank-bonus`)
- **Schedule:** `*/6 * * * *` (every 6 minutes)
- **Purpose:** Distributes bonuses based on rank tier standings
- **File:** `src/app/api/cron/rank-bonus/route.ts`

---

## 7. Ownership Limit (`/api/cron/ownership-limit`)
- **Schedule:** `0 0 * * *` (daily at midnight)
- **Purpose:** Recalculates the dynamic max-ownership-per-player cap
- **File:** `src/app/api/cron/ownership-limit/route.ts`

---

## 8. Goddess Countdown (`/api/cron/goddess-countdown`)
- **Schedule:** `*/1 * * * *` (every minute)
- **Purpose:** Drives the GAME-WIN pipeline.
- **Logic:**
  1. Read countdown state from `game_settings`.
  2. If no active countdown → no-op.
  3. If remaining > 0 → no-op.
  4. If remaining == 0 AND user still owns all 5 goddesses AND is eligible
     (active, not multi-account-penalized) → call `triggerGameReset(userId, username, startedAt)`.
  5. `triggerGameReset`:
     - Inserts `hall_of_fame` row for the winner
     - Deletes ALL ownership / transactions / messages
     - HARD-DELETES all non-goddess NPCs
     - Resets humans to credits=100, playerValue=1, valueFloor=1, wasReset=2
     - Resets goddesses to their original floor values, credits=100
     - Clears the countdown and marks it processed (idempotent retries)
     - Broadcasts `game-won` via Pusher
- **Idempotency:** `goddess_countdown_last_processed_start` + 60s `hall_of_fame` window
- **Files:**
  - `src/app/api/cron/goddess-countdown/route.ts`
  - `src/actions/triggerGameReset.ts`
  - `src/lib/goddess-countdown.ts`

### Related admin endpoints (same CRON_SECRET auth)
- `GET /api/admin/countdown-state` — diagnostic: raw countdown state, challenger ownership check, recent HoF and goddess purchases.
- `POST /api/admin/trigger-game-reset` `{ userId, force? }` — manually trigger a win when the cron failed to.
- `npx tsx scripts/force-game-win.ts <userId>` — script-equivalent of the admin endpoint.

---

## Summary Table

| # | Cron Job | Schedule | Status |
|---|----------|----------|--------|
| 1 | Portfolio Reward | `*/10 * * * *` | ✅ Active |
| 2 | Random Player | `*/3 * * * *` | ✅ Active |
| 3 | Random Player Status | `*/1 * * * *` | ✅ Active |
| 4 | Offline Penalty | `0 * * * *` | ✅ Active |
| 5 | Leaderboard Prizes | `0 * * * *` | ✅ Active |
| 6 | Rank Bonus | `*/6 * * * *` | ✅ Active |
| 7 | Ownership Limit | `0 0 * * *` | ✅ Active |
| 8 | Goddess Countdown | `*/1 * * * *` | ✅ Active |

---

## Security
All cron jobs verify requests using `CRON_SECRET` environment variable via Bearer token authentication.

---

*Report last updated: 2026-04-21*
