CREATE TYPE payment_method AS ENUM ('WALLET', 'CARD');

ALTER TABLE "transaction"
  ADD COLUMN user_id INTEGER REFERENCES "user"(id),
  ADD COLUMN payment_method payment_method NOT NULL DEFAULT 'WALLET';

ALTER TABLE product
  ADD COLUMN cost_price DOUBLE PRECISION NOT NULL DEFAULT 0;

ALTER TABLE transactionitem
  ADD COLUMN unit_price DOUBLE PRECISION;

ALTER TABLE shop_config
  ADD COLUMN operation_mode VARCHAR(20) NOT NULL DEFAULT 'self_service';
