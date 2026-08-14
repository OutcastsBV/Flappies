'use client';

import { useEffect, useState } from 'react';
import { getRegisterSessions } from '../../lib/api';
import type { RegisterSession } from '../../lib/types';

function formatVariance(session: RegisterSession) {
  if (session.counted_cash_amount == null || session.expected_cash_amount == null) {
    return null;
  }
  return Number(
    (session.counted_cash_amount - session.expected_cash_amount).toFixed(2)
  );
}

export default function RegistersPanel() {
  const [sessions, setSessions] = useState<RegisterSession[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    getRegisterSessions()
      .then((data) => {
        if (!cancelled) setSessions(data);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <>
      <h1 className="text-2xl font-semibold mb-6">Registers</h1>

      {loading ? (
        <p className="text-gray-700">Loading register sessions…</p>
      ) : (
        <table className="w-full bg-white rounded shadow text-sm">
          <thead>
            <tr className="border-b">
              <th className="p-3 text-left">Cashier</th>
              <th className="p-3 text-left">Opened</th>
              <th className="p-3 text-left">Closed</th>
              <th className="p-3 text-left">Starting</th>
              <th className="p-3 text-left">Expected cash</th>
              <th className="p-3 text-left">Counted cash</th>
              <th className="p-3 text-left">Variance</th>
              <th className="p-3 text-left">Status</th>
            </tr>
          </thead>
          <tbody>
            {sessions.map((session) => {
              const variance = formatVariance(session);
              return (
                <tr key={session.id} className="border-b">
                  <td className="p-3">{session.opened_by_username}</td>
                  <td className="p-3">
                    {new Date(session.opened_at).toLocaleString()}
                  </td>
                  <td className="p-3">
                    {session.closed_at
                      ? new Date(session.closed_at).toLocaleString()
                      : '—'}
                  </td>
                  <td className="p-3">€{session.starting_amount.toFixed(2)}</td>
                  <td className="p-3">
                    {session.expected_cash_amount != null
                      ? `€${session.expected_cash_amount.toFixed(2)}`
                      : '—'}
                  </td>
                  <td className="p-3">
                    {session.counted_cash_amount != null
                      ? `€${session.counted_cash_amount.toFixed(2)}`
                      : '—'}
                  </td>
                  <td
                    className={`p-3 ${
                      variance != null && variance !== 0
                        ? 'text-red-600 font-medium'
                        : ''
                    }`}
                  >
                    {variance != null ? `€${variance.toFixed(2)}` : '—'}
                  </td>
                  <td className="p-3 capitalize">{session.status}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </>
  );
}
