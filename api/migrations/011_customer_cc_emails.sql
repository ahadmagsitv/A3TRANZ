-- W15 "Add recipient": extra addresses CC'd on the completion email, on top
-- of the customer's primary `email`. An array, not a table — it is only ever
-- read and written whole, alongside the customer it belongs to.
ALTER TABLE customers ADD COLUMN cc_emails text[] NOT NULL DEFAULT '{}';
