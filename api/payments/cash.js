/** Cash payments: validate the cashier entered enough tendered cash. */
function processCashPayment(total, { amountTendered } = {}) {
  if (typeof amountTendered !== "number" || Number.isNaN(amountTendered)) {
    throw new Error("amount_tendered is required for cash payments");
  }

  if (amountTendered < total) {
    throw new Error("Amount tendered is less than the total due");
  }

  return { changeDue: Number((amountTendered - total).toFixed(2)) };
}

module.exports = { processCashPayment };
