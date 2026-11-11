-- Delivery gets the container+chassis shot and the seal shot back as slots 0
-- and 1 (reverses 009). The two return tickets move from 0/1 to 2/3 so photos
-- already taken keep their meaning. Nothing sits at 2/3 today, so no collision.
UPDATE job_evidence SET slot_index = slot_index + 2 WHERE step = 'delivery';

-- Import and empty jobs no longer have a Load step.
UPDATE jobs SET step = 'delivery' WHERE type <> 'export' AND step = 'load';
