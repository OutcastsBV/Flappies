CREATE TABLE shop_config (
    id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    happy_hour_start TIMESTAMP,
    happy_hour_end TIMESTAMP
);

INSERT INTO shop_config (id) VALUES (1);
