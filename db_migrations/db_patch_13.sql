-- Add Wero (formerly Payconiq) as a record-only payment method, matching
-- Stripe and SumUp. Keys are entered in Admin → Config and encrypted at rest;
-- checkout does not call the Wero API yet.

INSERT INTO payment_method_config (method_key, label, enabled)
VALUES ('WERO', 'Wero', false)
ON CONFLICT (method_key) DO NOTHING;
