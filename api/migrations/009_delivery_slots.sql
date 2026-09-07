-- Delivery drops its first two slots: the container+chassis shot and the seal
-- in hand. What is left is the two return tickets, which were slots 2 and 3.
--
-- Slots are stored by INDEX, not by label, so without this every delivery photo
-- already taken shifts under the wrong name — a J1 ticket filed at index 2
-- would show as nothing at all, and a container shot at index 0 would show as
-- the J1 ticket. Renumber so the tickets keep their meaning.
--
-- The two removed slots' rows go with them. Their images stay in Cloudinary
-- (nothing here deletes an upload); it is the reference to a slot that no
-- longer exists that goes. Order matters — clear 0 and 1 before 2 and 3 move
-- onto them, or the (job_id, step, slot_index) key collides.
DELETE FROM job_evidence WHERE step = 'delivery' AND slot_index IN (0, 1);

UPDATE job_evidence SET slot_index = slot_index - 2
 WHERE step = 'delivery' AND slot_index IN (2, 3);
