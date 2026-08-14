'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  getSalesSummary,
  getSalesByProduct,
  getSalesByDay,
  getPnLReport,
} from '../../lib/api';
import type {
  SalesSummary,
  SalesByProduct,
  SalesByDay,
  PnLReport,
} from '../../lib/types';

function defaultFromDate() {
  const d = new Date();
  d.setDate(d.getDate() - 30);
  return d.toISOString().slice(0, 10);
}

function defaultToDate() {
  return new Date().toISOString().slice(0, 10);
}

export default function ReportsPanel() {
  const [from, setFrom] = useState(defaultFromDate);
  const [to, setTo] = useState(defaultToDate);
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState<SalesSummary | null>(null);
  const [byProduct, setByProduct] = useState<SalesByProduct[]>([]);
  const [byDay, setByDay] = useState<SalesByDay[]>([]);
  const [pnl, setPnl] = useState<PnLReport | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [s, bp, bd, p] = await Promise.all([
        getSalesSummary(from, to),
        getSalesByProduct(from, to),
        getSalesByDay(from, to),
        getPnLReport(from, to),
      ]);
      setSummary(s);
      setByProduct(bp);
      setByDay(bd);
      setPnl(p);
    } finally {
      setLoading(false);
    }
  }, [from, to]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <>
      <div className="flex flex-wrap justify-between items-center gap-4 mb-6">
        <h1 className="text-2xl font-semibold">Reports</h1>
        <div className="flex gap-3 items-center">
          <input
            type="date"
            className="border rounded px-3 py-2"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
          />
          <span className="text-gray-500">to</span>
          <input
            type="date"
            className="border rounded px-3 py-2"
            value={to}
            onChange={(e) => setTo(e.target.value)}
          />
          <button
            type="button"
            onClick={load}
            disabled={loading}
            className="border rounded px-3 py-2 hover:bg-gray-50 disabled:opacity-50"
          >
            Refresh
          </button>
        </div>
      </div>

      {loading ? (
        <p className="text-gray-700">Loading reports…</p>
      ) : (
        <div className="space-y-6">
          {summary && (
            <div className="grid sm:grid-cols-3 gap-4">
              <div className="bg-white rounded-xl shadow p-5">
                <p className="text-sm text-gray-600">Total revenue</p>
                <p className="text-2xl font-semibold">
                  €{Number(summary.total_revenue).toFixed(2)}
                </p>
              </div>
              <div className="bg-white rounded-xl shadow p-5">
                <p className="text-sm text-gray-600">Transactions</p>
                <p className="text-2xl font-semibold">
                  {summary.transaction_count}
                </p>
              </div>
              <div className="bg-white rounded-xl shadow p-5">
                <p className="text-sm text-gray-600">Wallet revenue</p>
                <p className="text-2xl font-semibold">
                  €{Number(summary.wallet_revenue).toFixed(2)}
                </p>
              </div>
            </div>
          )}

          {pnl && (
            <div className="bg-white rounded-xl shadow p-6">
              <h2 className="text-lg font-semibold mb-4">Profit &amp; Loss</h2>
              <div className="grid sm:grid-cols-3 gap-4 mb-4">
                <div>
                  <p className="text-sm text-gray-600">Revenue</p>
                  <p className="text-xl font-semibold">
                    €{pnl.totals.revenue.toFixed(2)}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Cost</p>
                  <p className="text-xl font-semibold">
                    €{pnl.totals.cost.toFixed(2)}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Profit</p>
                  <p className="text-xl font-semibold">
                    €{pnl.totals.profit.toFixed(2)}
                  </p>
                </div>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left">
                    <th className="py-2">Product</th>
                    <th className="py-2">Units</th>
                    <th className="py-2">Revenue</th>
                    <th className="py-2">Cost</th>
                    <th className="py-2">Profit</th>
                  </tr>
                </thead>
                <tbody>
                  {pnl.products.map((p) => (
                    <tr key={p.product_id} className="border-b">
                      <td className="py-2">{p.name}</td>
                      <td className="py-2">{p.units_sold}</td>
                      <td className="py-2">€{Number(p.revenue).toFixed(2)}</td>
                      <td className="py-2">€{Number(p.cost).toFixed(2)}</td>
                      <td className="py-2">€{Number(p.profit).toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="grid lg:grid-cols-2 gap-6">
            <div className="bg-white rounded-xl shadow p-6">
              <h2 className="text-lg font-semibold mb-4">Sales by product</h2>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left">
                    <th className="py-2">Product</th>
                    <th className="py-2">Units</th>
                    <th className="py-2">Revenue</th>
                  </tr>
                </thead>
                <tbody>
                  {byProduct.map((p) => (
                    <tr key={p.product_id} className="border-b">
                      <td className="py-2">{p.name}</td>
                      <td className="py-2">{p.units_sold}</td>
                      <td className="py-2">€{Number(p.revenue).toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="bg-white rounded-xl shadow p-6">
              <h2 className="text-lg font-semibold mb-4">Sales by day</h2>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left">
                    <th className="py-2">Day</th>
                    <th className="py-2">Orders</th>
                    <th className="py-2">Revenue</th>
                  </tr>
                </thead>
                <tbody>
                  {byDay.map((d) => (
                    <tr key={d.day} className="border-b">
                      <td className="py-2">{d.day}</td>
                      <td className="py-2">{d.transaction_count}</td>
                      <td className="py-2">€{Number(d.revenue).toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
