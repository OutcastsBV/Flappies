-- Prevent the same SumUp checkout from being recorded twice if two
-- checkouts race after the customer has already paid on the terminal.
CREATE UNIQUE INDEX IF NOT EXISTS idx_transaction_sumup_payment_reference
  ON "transaction" (payment_reference)
  WHERE payment_method = 'SUMUP' AND payment_reference IS NOT NULL;
