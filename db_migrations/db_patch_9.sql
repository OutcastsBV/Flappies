-- Convert Flappies from a member self-service wallet kiosk into a cashier-operated
-- cash register: drop member cards / wallet balance / top-up, add staff roles,
-- modular payment methods, register (till) sessions, and transaction corrections.

-- ---------------------------------------------------------------------------
-- 1. Staff roles
-- ---------------------------------------------------------------------------

ALTER TABLE "user"
  ADD COLUMN role VARCHAR(10) NOT NULL DEFAULT 'cashier'
    CHECK (role IN ('admin', 'manager', 'cashier'));

DROP TABLE IF EXISTS UserRights;
DROP TYPE IF EXISTS Rights;

-- ---------------------------------------------------------------------------
-- 2. Modular payment methods (replaces the fixed WALLET/CARD enum)
-- ---------------------------------------------------------------------------

ALTER TABLE "transaction" ALTER COLUMN payment_method DROP DEFAULT;
ALTER TABLE "transaction" ALTER COLUMN payment_method TYPE VARCHAR(20) USING payment_method::text;
DROP TYPE IF EXISTS payment_method;

CREATE TABLE payment_method_config (
    method_key  VARCHAR(20) PRIMARY KEY,
    label       VARCHAR(50) NOT NULL,
    enabled     BOOLEAN NOT NULL DEFAULT false,
    config      JSONB NOT NULL DEFAULT '{}',
    updated_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_by  INTEGER REFERENCES "user"(id)
);

INSERT INTO payment_method_config (method_key, label, enabled) VALUES
  ('CASH', 'Cash', true),
  ('STRIPE', 'Stripe', false),
  ('SUMUP', 'SumUp', false);

-- ---------------------------------------------------------------------------
-- 3. Register (till) sessions
-- ---------------------------------------------------------------------------

CREATE TABLE register_session (
    id                   SERIAL PRIMARY KEY,
    opened_by            INTEGER NOT NULL REFERENCES "user"(id),
    opened_at            TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    starting_amount      DOUBLE PRECISION NOT NULL CHECK (starting_amount >= 0),
    closed_by            INTEGER REFERENCES "user"(id),
    closed_at            TIMESTAMP,
    counted_cash_amount  DOUBLE PRECISION,
    expected_cash_amount DOUBLE PRECISION,
    status               VARCHAR(10) NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
    notes                TEXT
);

-- One open register per cashier at a time; several cashiers can each have
-- their own concurrently open register (e.g. multiple checkout terminals).
CREATE UNIQUE INDEX idx_register_session_one_open_per_user
  ON register_session (opened_by) WHERE status = 'open';

-- ---------------------------------------------------------------------------
-- 4. Transaction: link to register session, capture cash tendered/reference
-- ---------------------------------------------------------------------------

ALTER TABLE "transaction"
  ADD COLUMN register_session_id INTEGER REFERENCES register_session(id),
  ADD COLUMN amount_tendered DOUBLE PRECISION,
  ADD COLUMN payment_reference VARCHAR(140),
  ADD CONSTRAINT fk_transaction_payment_method
    FOREIGN KEY (payment_method) REFERENCES payment_method_config(method_key);

-- ---------------------------------------------------------------------------
-- 5. Corrections (refund / price adjustment / item removed / other)
-- ---------------------------------------------------------------------------

CREATE TYPE correction_type AS ENUM ('REFUND', 'PRICE_ADJUSTMENT', 'ITEM_REMOVED', 'OTHER');

CREATE TABLE correction (
    id             SERIAL PRIMARY KEY,
    transaction_id INTEGER NOT NULL REFERENCES "transaction"(id),
    type           correction_type NOT NULL,
    amount         DOUBLE PRECISION NOT NULL CHECK (amount > 0),
    reason         TEXT NOT NULL,
    created_by     INTEGER NOT NULL REFERENCES "user"(id),
    created_at     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_correction_transaction_id ON correction(transaction_id);

-- ---------------------------------------------------------------------------
-- 6. Drop member card / top-up / wallet balance concepts
-- ---------------------------------------------------------------------------

DROP TABLE IF EXISTS top_up_request;
DROP TABLE IF EXISTS rfidcard;
DROP TYPE IF EXISTS CardStatus;

ALTER TABLE "user"
  DROP COLUMN IF EXISTS card_id,
  DROP COLUMN IF EXISTS balance;

ALTER TABLE shop_config
  DROP COLUMN IF EXISTS operation_mode,
  DROP COLUMN IF EXISTS top_up_epc_enabled,
  DROP COLUMN IF EXISTS top_up_stripe_enabled;
