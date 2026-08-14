ALTER TABLE shop_config
  ADD COLUMN IF NOT EXISTS happy_hour_days INTEGER[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS happy_hour_start_time TIME,
  ADD COLUMN IF NOT EXISTS happy_hour_end_time TIME;
