const pool = require("../../db");

const TEST_CASHIER_SUB = "11111111-1111-1111-1111-111111111111";
const TEST_ADMIN_SUB = "22222222-2222-2222-2222-222222222222";
const TEST_MANAGER_SUB = "44444444-4444-4444-4444-444444444444";

async function seedTestData() {
  const cashierResult = await pool.query(
    `
    INSERT INTO "user" (keycloak_id, username, email, role, is_active)
    VALUES ($1, 'testcashier', 'cashier@test.com', 'cashier', true)
    RETURNING id
    `,
    [TEST_CASHIER_SUB]
  );

  const adminResult = await pool.query(
    `
    INSERT INTO "user" (keycloak_id, username, email, role, is_active)
    VALUES ($1, 'testadmin', 'admin@test.com', 'admin', true)
    RETURNING id
    `,
    [TEST_ADMIN_SUB]
  );

  const managerResult = await pool.query(
    `
    INSERT INTO "user" (keycloak_id, username, email, role, is_active)
    VALUES ($1, 'testmanager', 'manager@test.com', 'manager', true)
    RETURNING id
    `,
    [TEST_MANAGER_SUB]
  );

  const productResult = await pool.query(
    `
    INSERT INTO product (name, description, price, cost_price)
    VALUES ('Cola', 'Cold drink', 2.5, 1.0)
    RETURNING id
    `
  );

  const productId = productResult.rows[0].id;

  await pool.query(
    `
    INSERT INTO inventory (product_id, current_stock, reorder_level)
    VALUES ($1, 50, 5)
    `,
    [productId]
  );

  return {
    userId: cashierResult.rows[0].id,
    cashierId: cashierResult.rows[0].id,
    adminId: adminResult.rows[0].id,
    managerId: managerResult.rows[0].id,
    productId,
    userSub: TEST_CASHIER_SUB,
    cashierSub: TEST_CASHIER_SUB,
    adminSub: TEST_ADMIN_SUB,
    managerSub: TEST_MANAGER_SUB,
  };
}

module.exports = {
  seedTestData,
  TEST_USER_SUB: TEST_CASHIER_SUB,
  TEST_CASHIER_SUB,
  TEST_ADMIN_SUB,
  TEST_MANAGER_SUB,
};
