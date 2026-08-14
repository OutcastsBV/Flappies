function testAuthHeaders(sub, { roles = [], email = "test@example.com" } = {}) {
  return {
    Authorization: "Bearer test-token",
    "X-Test-User-Sub": sub,
    "X-Test-User-Email": email,
    "X-Test-Roles": roles.join(","),
  };
}

module.exports = { testAuthHeaders };
