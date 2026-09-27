-- Evidence videos are archived in this bucket next to their thumbnails.
-- The original 2 MB cap (meant for thumbnails) rejected most videos, which
-- broke evidence preview and download. Telegram bots can fetch up to 20 MB.
UPDATE storage.buckets
SET file_size_limit = 20971520
WHERE id = 'telegram-evidence-thumbnails'
  AND (file_size_limit IS NULL OR file_size_limit < 20971520);
