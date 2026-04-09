-- Migration: Change value/amount columns from integer to bigint
-- Reason: player_value doubles on each purchase and has reached 2^30 (1,073,741,824),
-- which would overflow PostgreSQL's 4-byte integer max (2,147,483,647) on the next purchase.

ALTER TABLE users ALTER COLUMN player_value TYPE bigint;
ALTER TABLE users ALTER COLUMN value_floor TYPE bigint;
ALTER TABLE transactions ALTER COLUMN amount TYPE bigint;
ALTER TABLE ownership ALTER COLUMN purchase_price TYPE bigint;
