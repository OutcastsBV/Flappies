'use client';

import { useEffect, useState } from 'react';
import { getAuditLog } from '../../lib/api';
import type { AuditLogEntry } from '../../lib/types';

const ACTIONS = [
  'user.create',
  'user.update',
  'payment_method.update',
  'config.update',
  'register.open',
  'register.close',
  'correction.create',
];

function formatDetails(details: Record<string, unknown>) {
  const entries = Object.entries(details || {});
  if (entries.length === 0) return '—';
  return entries
    .map(([key, value]) => `${key}: ${JSON.stringify(value)}`)
    .join(', ');
}

export default function AuditPanel() {
  const [entries, setEntries] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [action, setAction] = useState('');

  useEffect(() => {
    let cancelled = false;

    getAuditLog(action ? { action } : undefined)
      .then((data) => {
        if (!cancelled) setEntries(data);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [action]);

  return (
    <>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-semibold">Audit log</h1>
        <select
          className="border rounded px-3 py-2 text-sm"
          value={action}
          onChange={(e) => {
            setAction(e.target.value);
            setLoading(true);
          }}
        >
          <option value="">All actions</option>
          {ACTIONS.map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </select>
      </div>

      <p className="text-sm text-gray-500 mb-4">
        Read-only history of sensitive admin/manager actions. Entries can never be
        edited or deleted.
      </p>

      {loading ? (
        <p className="text-gray-700">Loading audit log…</p>
      ) : entries.length === 0 ? (
        <p className="text-gray-700">No audit entries found.</p>
      ) : (
        <table className="w-full bg-white rounded shadow text-sm">
          <thead>
            <tr className="border-b">
              <th className="p-3 text-left">When</th>
              <th className="p-3 text-left">Actor</th>
              <th className="p-3 text-left">Action</th>
              <th className="p-3 text-left">Entity</th>
              <th className="p-3 text-left">Details</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((entry) => (
              <tr key={entry.id} className="border-b align-top">
                <td className="p-3 whitespace-nowrap">
                  {new Date(entry.created_at).toLocaleString()}
                </td>
                <td className="p-3">{entry.actor_username ?? '—'}</td>
                <td className="p-3 font-mono text-xs">{entry.action}</td>
                <td className="p-3">
                  {entry.entity_type}
                  {entry.entity_id ? ` #${entry.entity_id}` : ''}
                </td>
                <td className="p-3 text-gray-600">{formatDetails(entry.details)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
