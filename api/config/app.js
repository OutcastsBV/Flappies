module.exports = {
  // Payment methods are now managed dynamically via the payment_method_config
  // table (see services/paymentMethod.service.js) so admins can enable/disable
  // providers and store their API keys without a deploy.
  roles: ["admin", "manager", "cashier"],
};
