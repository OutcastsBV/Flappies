-- transaction.total_amount was left as INTEGER from the original schema,
-- even though product prices and transactionitem.unit_price are DOUBLE
-- PRECISION. Happy-hour pricing (half-price items) can produce a fractional
-- total, which INTEGER silently rejects with "invalid input syntax for type
-- integer". Widen it to match the rest of the money columns.

ALTER TABLE "transaction"
  ALTER COLUMN total_amount TYPE DOUBLE PRECISION;
