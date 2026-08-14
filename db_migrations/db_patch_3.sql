ALTER TABLE rfidcard
ALTER COLUMN card_key TYPE VARCHAR(14);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'rfidcard_card_key_unique'
  ) THEN
    ALTER TABLE rfidcard
    ADD CONSTRAINT rfidcard_card_key_unique UNIQUE (card_key);
  END IF;
END $$;
