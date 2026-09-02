-- Prevent the same Wero/Payconiq payment id from being recorded twice if
-- two checkouts race after the customer has already paid.
CREATE UNIQUE INDEX IF NOT EXISTS idx_transaction_wero_payment_reference
  ON "transaction" (payment_reference)
  WHERE payment_method = 'WERO' AND payment_reference IS NOT NULL;
