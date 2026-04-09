-- Migration: Change credits from real (float4) to double precision (float8)
-- Reason: real only has ~7 significant digits of precision. With credits in the billions
-- (10+ digits), arithmetic operations are losing precision. Double precision gives ~15 digits.

ALTER TABLE users ALTER COLUMN credits TYPE double precision;
