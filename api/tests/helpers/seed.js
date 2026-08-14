const pool = require("../../db");

const TEST_USER_SUB = "11111111-1111-1111-1111-111111111111";
const TEST_ADMIN_SUB = "22222222-2222-2222-2222-222222222222";

async function seedTestData() {
  const userResult = await pool.query(
    `
    INSERT INTO "user" (keycloak_id, username, email, balance, is_active)
    VALUES ($1, 'testuser', 'user@test.com', 100, true)
    RETURNING id
    `,
    [TEST_USER_SUB]
  );

  const adminResult = await pool.query(
    `
    INSERT INTO "user" (keycloak_id, username, email, balance, is_active)
    VALUES ($1, 'testadmin', 'admin@test.com', 0, true)
    RETURNING id
    `,
    [TEST_ADMIN_SUB]
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
    userId: userResult.rows[0].id,
    adminId: adminResult.rows[0].id,
    productId,
    userSub: TEST_USER_SUB,
    adminSub: TEST_ADMIN_SUB,
  };
}

module.exports = {
  seedTestData,
  TEST_USER_SUB,
  TEST_ADMIN_SUB,
};
