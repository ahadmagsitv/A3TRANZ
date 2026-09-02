-- Retries need a WHEN, not just a count. Without this, a failing row is picked
-- again on the very next pass and burns through every attempt in seconds — so
-- a provider outage lasting a minute exhausts the retries and the customer is
-- never told.
ALTER TABLE outbox ADD COLUMN next_attempt_at timestamptz NOT NULL DEFAULT now();
DROP INDEX IF EXISTS outbox_unsent;
CREATE INDEX outbox_unsent ON outbox (next_attempt_at) WHERE sent_at IS NULL;
