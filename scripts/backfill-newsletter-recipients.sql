-- One-time script: Mark all current subscribed users as having received newsletter_1
-- This accounts for emails sent before the recipient tracking was added.
--
-- Run with:
--   psql $DATABASE_URL -f scripts/backfill-newsletter-recipients.sql

INSERT INTO newsletter_recipients (template_name, user_id, email, sent_at)
SELECT
  'newsletter_1',
  u.id,
  u.email,
  NOW()
FROM "user" u
LEFT JOIN email_preferences ep ON ep.user_id = u.id
WHERE ep.subscribed_to_newsletter IS NULL OR ep.subscribed_to_newsletter = true
ON CONFLICT (template_name, user_id) DO NOTHING;

-- Show how many were marked
SELECT count(*) AS backfilled_count FROM newsletter_recipients WHERE template_name = 'newsletter_1';
