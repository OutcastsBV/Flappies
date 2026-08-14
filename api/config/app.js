module.exports = {
  // self_service: members buy for themselves (RFID login + wallet)
  // pos: staff sells to walk-in customers (future — CARD not implemented yet)
  operationMode: process.env.OPERATION_MODE || "self_service",

  paymentMethods: {
    self_service: ["WALLET"],
    // CARD intentionally omitted until a payment handler exists
    pos: ["WALLET"],
  },
};
