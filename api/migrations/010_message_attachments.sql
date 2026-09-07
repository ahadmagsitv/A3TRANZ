-- A chat attachment needs more than its key.
--
-- `attachment_key` alone cannot say whether to render an image or a download
-- chip, and cannot name the file the recipient saves. Both were guessable from
-- the key's extension, which is exactly the sort of parsing that gets a .jpeg
-- wrong; store what the sender actually had instead.
ALTER TABLE messages
  ADD COLUMN attachment_name text,
  ADD COLUMN attachment_type text;

-- Backfill what the existing rows can support: every attachment before this
-- was an image, and the key is the only name they ever had.
UPDATE messages
   SET attachment_type = 'image/jpeg',
       attachment_name = regexp_replace(attachment_key, '^.*/', '')
 WHERE attachment_key IS NOT NULL;
