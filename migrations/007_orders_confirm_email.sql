-- Stage 46 — persist the optional confirmation email (Stage 39 saved
-- it only to send the first email, then dropped it). Needed for
-- status-update notifications: when an admin moves an order through
-- new → in_work → done, we look up confirm_email on the order row
-- and notify the customer there. Falls back to extracting an email
-- from `contact` if confirm_email is empty.
ALTER TABLE orders ADD COLUMN confirm_email TEXT;
