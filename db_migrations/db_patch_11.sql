-- Append-only audit log for admin/manager-visible history of sensitive
-- actions (user/role management, payment method + config changes, register
-- open/close, corrections). Rows can only ever be inserted: a trigger blocks
-- UPDATE/DELETE at the database level so history cannot be altered even by
-- a compromised admin account or a bug bypassing the service layer.

CREATE TABLE audit_log (
    id             SERIAL PRIMARY KEY,
    actor_user_id  INTEGER REFERENCES "user"(id),
    actor_username VARCHAR(100),
    action         VARCHAR(60) NOT NULL,
    entity_type    VARCHAR(40) NOT NULL,
    entity_id      VARCHAR(40),
    details        JSONB NOT NULL DEFAULT '{}',
    created_at     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_audit_log_created_at ON audit_log(created_at DESC);
CREATE INDEX idx_audit_log_action ON audit_log(action);
CREATE INDEX idx_audit_log_entity ON audit_log(entity_type, entity_id);

CREATE OR REPLACE FUNCTION audit_log_immutable()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'audit_log rows are immutable: % is not allowed', TG_OP;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_audit_log_no_update
  BEFORE UPDATE ON audit_log
  FOR EACH ROW EXECUTE FUNCTION audit_log_immutable();

CREATE TRIGGER trg_audit_log_no_delete
  BEFORE DELETE ON audit_log
  FOR EACH ROW EXECUTE FUNCTION audit_log_immutable();
