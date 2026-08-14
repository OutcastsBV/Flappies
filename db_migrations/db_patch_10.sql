-- Track whether a transaction was rung up while happy hour pricing was
-- active, so it can be flagged/filtered in the admin UI.

ALTER TABLE "transaction"
  ADD COLUMN happy_hour_active BOOLEAN NOT NULL DEFAULT false;
