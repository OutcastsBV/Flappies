ALTER TABLE shop_config
  ADD COLUMN IF NOT EXISTS top_up_epc_enabled BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS top_up_stripe_enabled BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE top_up_request (
  id          SERIAL PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  amount      DOUBLE PRECISION NOT NULL CHECK (amount > 0),
  method      VARCHAR(20) NOT NULL CHECK (method IN ('epc_qr', 'stripe')),
  status      VARCHAR(20) NOT NULL DEFAULT 'pending'
              CHECK (status IN ('pending', 'completed', 'cancelled', 'expired')),
  reference   VARCHAR(140) NOT NULL UNIQUE,
  stripe_session_id VARCHAR(255),
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  completed_at TIMESTAMP
);

CREATE INDEX idx_top_up_request_user_id ON top_up_request(user_id);
CREATE INDEX idx_top_up_request_stripe_session ON top_up_request(stripe_session_id)
  WHERE stripe_session_id IS NOT NULL;
