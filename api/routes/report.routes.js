const express = require("express");
const authenticate = require("../middleware/authenticate");
const requireUser = require("../middleware/requireUser");
const requireRole = require("../middleware/requireRole");
const {
  getSalesSummary,
  getSalesByProduct,
  getSalesByDay,
  getSalesByPaymentMethod,
  getPnLReport,
} = require("../services/report.service");

const router = express.Router();

router.get(
  "/sales",
  authenticate,
  requireUser,
  requireRole("admin"),
  async (req, res) => {
    const summary = await getSalesSummary(req.query.from, req.query.to);
    res.json(summary);
  }
);

router.get(
  "/sales/by-product",
  authenticate,
  requireUser,
  requireRole("admin"),
  async (req, res) => {
    const data = await getSalesByProduct(req.query.from, req.query.to);
    res.json(data);
  }
);

router.get(
  "/sales/by-day",
  authenticate,
  requireUser,
  requireRole("admin"),
  async (req, res) => {
    const data = await getSalesByDay(req.query.from, req.query.to);
    res.json(data);
  }
);

router.get(
  "/sales/by-payment-method",
  authenticate,
  requireUser,
  requireRole("admin"),
  async (req, res) => {
    const data = await getSalesByPaymentMethod(req.query.from, req.query.to);
    res.json(data);
  }
);

router.get(
  "/pnl",
  authenticate,
  requireUser,
  requireRole("admin"),
  async (req, res) => {
    const data = await getPnLReport(req.query.from, req.query.to);
    res.json(data);
  }
);

module.exports = router;
