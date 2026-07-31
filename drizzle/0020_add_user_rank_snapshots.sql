-- Pre-computed leaderboard rank positions per user, refreshed by the
-- /api/cron/rank-snapshot cron. Avoids 5 correlated COUNT subqueries per
-- /api/leaderboard request.
CREATE TABLE IF NOT EXISTS user_rank_snapshots (
  user_id integer PRIMARY KEY,
  empire_rank integer NOT NULL,
  legacy_rank integer NOT NULL,
  credits_rank integer NOT NULL,
  value_rank integer NOT NULL,
  portfolio_rank integer NOT NULL,
  updated_at timestamp NOT NULL DEFAULT now()
);
