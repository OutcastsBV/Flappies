CREATE TYPE CardStatus AS ENUM ('ACTIVE', 'BLOCKED');
CREATE TYPE Rights AS ENUM ('ADMIN', 'USER');

CREATE TABLE "user" (
    id          SERIAL PRIMARY KEY,
    card_id     INTEGER UNIQUE,
	keycloak_id UUID UNIQUE NOT NULL,
    username    VARCHAR(255) NOT NULL UNIQUE,
    balance     DOUBLE PRECISION DEFAULT 0,
    created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE RfidCard (
    id     SERIAL PRIMARY KEY,
	card_key	BYTEA UNIQUE NOT NULL,
    status      CardStatus NOT NULL,
    created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE Product (
    id          SERIAL PRIMARY KEY,
    name        TEXT NOT NULL,
    description TEXT,
    price       DOUBLE PRECISION NOT NULL,
    created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE Inventory (
    product_id     INTEGER PRIMARY KEY,
    current_stock  INTEGER NOT NULL,
    reorder_level  INTEGER NOT NULL,
    last_restock   TIMESTAMP,

    CONSTRAINT fk_inventory_product
        FOREIGN KEY (product_id)
        REFERENCES product(id)
        ON DELETE CASCADE
);

CREATE TABLE Cart (
    user_id   INTEGER,
    item_id   INTEGER,
    amount    INTEGER NOT NULL,

    PRIMARY KEY (user_id, item_id),

    CONSTRAINT fk_cart_user
        FOREIGN KEY (user_id)
        REFERENCES "user"(id)
        ON DELETE CASCADE,

    CONSTRAINT fk_cart_product
        FOREIGN KEY (item_id)
        REFERENCES product(id)
        ON DELETE CASCADE
);

CREATE TABLE "transaction" (
    id SERIAL PRIMARY KEY,
    timestamp      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    total_amount   INTEGER NOT NULL
);

CREATE TABLE TransactionItem (
    transaction_id INTEGER,
    product_id     INTEGER,
    quantity       INTEGER NOT NULL,

    PRIMARY KEY (transaction_id, product_id),

    CONSTRAINT fk_ti_transaction
        FOREIGN KEY (transaction_id)
        REFERENCES "transaction"(id)
        ON DELETE CASCADE,

    CONSTRAINT fk_ti_product
        FOREIGN KEY (product_id)
        REFERENCES product(id)
);

CREATE TABLE UserRights (
    user_id INTEGER,
    "right"   Rights,

    PRIMARY KEY (user_id, "right"),

    CONSTRAINT fk_userrights_user
        FOREIGN KEY (user_id)
        REFERENCES "user"(id)
        ON DELETE CASCADE
);
