-- `Inspection.passedAt` is contract surface (M19 renders it, W5 quotes it) and
-- nothing stored it. Deriving it from the newest inspection row would be wrong:
-- that is when the last box was ticked, not when the job was cleared to start.
ALTER TABLE jobs ADD COLUMN pretrip_passed_at timestamptz;

-- Backfill the seeded jobs that are already past pre-trip: they passed when
-- they were assigned, which is the only honest stamp available after the fact.
UPDATE jobs SET pretrip_passed_at = assigned_at
 WHERE step <> 'pretrip' AND status <> 'blocked';
