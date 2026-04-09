# Cron Jobs Report - NetWorth Project

## Overview
This project uses **Vercel Cron Jobs** for scheduled tasks. There are **6 cron jobs** configured in `vercel.json`, all with active implementations.

---

## 1. Portfolio Reward (`/api/cron/portfolio-reward`)
- **Schedule:** `0 * * * *` (every hour at minute 0)
- **Effective Interval:** 60 minutes (1 hour) - enforced by internal logic
- **Purpose:** Distributes 1% of portfolio value as credits to all active players
- **Logic:**
  - Calculates portfolio value: `player_value + sum of owned players' values`
  - Awards 1% of portfolio value as credits
  - Sends real-time notifications via Pusher
- **File:** `src/app/api/cron/portfolio-reward/route.ts`

---

## 2. Random Player (`/api/cron/random-player`)
- **Schedule:** `*/3 * * * *` (every 3 minutes)
- **Effective Interval:** 3 minutes
- **Purpose:** Creates new random NPC players and cleans up old/inactive NPCs
- **Logic:**
  - Creates new random player with randomized stats
  - Cleans up unowned NPCs older than 1 day
  - Cleans up NPCs offline 3+ days with $2 or less credit and $1 value
  - Internal enforcement ensures 3-minute interval between creations
- **File:** `src/app/api/cron/random-player/route.ts`

---

## 3. Random Player Status (`/api/cron/random-player-status`)
- **Schedule:** `*/1 * * * *` (every minute)
- **Purpose:** Provides status check for NPC creation timing
- **Logic:**
  - Returns whether a new NPC can be created based on 60-minute interval
  - Used by frontend for countdown synchronization
  - Does NOT modify data (read-only)
- **File:** `src/app/api/cron/random-player-status/route.ts`

---

## 4. Offline Penalty (`/api/cron/offline-penalty`)
- **Schedule:** `0 * * * *` (every hour at minute 0)
- **Effective Interval:** 60 minutes
- **Purpose:** Applies credit decay to inactive players
- **Logic:**
  - Applies 1% credit decay per hour for inactive players
  - Targets: NPCs without owners OR human players
  - Deletes NPCs without owners when credits reach 2 or less
  - Never affects player value (only credits)
  - Minimum credits: 2
- **File:** `src/app/api/cron/offline-penalty/route.ts`

---

## 5. Leaderboard Prizes (`/api/cron/leaderboard-prizes`)
- **Schedule:** `0 * * * *` (every hour at minute 0)
- **Effective Interval:** 60 minutes
- **Purpose:** Distributes prizes across 6 leaderboard categories
- **Logic:**
  - Awards top 3 players in each category (3x, 2x, 1x multiplier)
  - Categories: Portfolio, Demand, Empire, Legacy, Credits, Value
  - Only considers players active within last 12 hours
  - Also cleans up quick-play accounts older than 1 hour
- **File:** `src/app/api/cron/leaderboard-prizes/route.ts`

---

## 6. Rank Bonus (`/api/cron/rank-bonus`)
- **Schedule:** `0 * * * *` (every hour at minute 0)
- **Effective Interval:** 60 minutes (1 hour) - enforced by internal logic
- **Purpose:** Distributes bonuses based on rank tier standings
- **Logic:**
  - Awards top 3 players in 5 categories
  - Categories: Empire, Legacy, Credits, Value, Portfolio
  - Bonus amounts: $3 (1st), $2 (2nd), $1 (3rd)
  - Sends real-time notifications via Pusher
- **File:** `src/app/api/cron/rank-bonus/route.ts`

---

## Summary Table

**Schedule:** The cron expression that determines when the job triggers (format: minute hour day month weekday)
**Effective Interval:** How often the job actually executes after internal throttling logic is applied

| # | Cron Job | Schedule | Effective Interval | Status |
|---|----------|----------|-------------------|--------|
| 1 | Portfolio Reward | `0 * * * *` (hourly at :00) | 60 min | ✅ Active |
| 2 | Random Player | `*/3 * * * *` (every 3 min) | 3 min | ✅ Active |
| 3 | Random Player Status | `*/1 * * * *` (every minute) | 1 min | ✅ Active |
| 4 | Offline Penalty | `0 * * * *` (hourly at :00) | 60 min | ✅ Active |
| 5 | Leaderboard Prizes | `0 * * * *` (hourly at :00) | 60 min | ✅ Active |
| 6 | Rank Bonus | `0 * * * *` (hourly at :00) | 60 min | ✅ Active |

---

## Security
All cron jobs verify requests using `CRON_SECRET` environment variable via Bearer token authentication.

## Recommendations
1. **Consider consolidating schedules** - All jobs now run hourly except Random Player Status (every minute)

---

*Report generated on: 2026-04-02*