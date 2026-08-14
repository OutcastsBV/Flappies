'use client';

import { useEffect, useState } from 'react';
import { getTransactions, getTransaction } from '../../lib/api';
import TransactionModal from './TransactionModal';
import HappyHourBadge from '../HappyHourBadge';
import { Transaction } from '../../lib/types';

type HappyHourFilter = 'all' | 'happy_hour' | 'regular';

export default function TransactionsPanel() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [selected, setSelected] = useState<Transaction | null>(null);
  const [happyHourFilter, setHappyHourFilter] = useState<HappyHourFilter>('all');

  function loadTransactions(filter: HappyHourFilter = happyHourFilter) {
    getTransactions({
      happy_hour:
        filter === 'happy_hour' ? true : filter === 'regular' ? false : undefined,
    }).then(setTransactions);
  }

  useEffect(() => {
    loadTransactions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [happyHourFilter]);

  async function openTransaction(id: number) {
    const full = await getTransaction(id);
    setSelected(full);
  }

  return (
    <>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-semibold">Transactions</h1>
        <select
          className="border rounded px-3 py-2 text-sm"
          value={happyHourFilter}
          onChange={(e) => setHappyHourFilter(e.target.value as HappyHourFilter)}
        >
          <option value="all">All</option>
          <option value="happy_hour">Happy hour only</option>
          <option value="regular">Regular price</option>
        </select>
      </div>

      <ul className="bg-white rounded shadow divide-y">
        {transactions.map((t) => (
          <li
            key={t.id}
            className="p-4 cursor-pointer hover:bg-gray-100 flex justify-between items-center"
            onClick={() => openTransaction(t.id)}
          >
            <span className="flex items-center gap-2">
              #{t.id} — {t.username ?? 'Unknown'} —{' '}
              {new Date(t.timestamp).toLocaleString()}
              {t.payment_method && (
                <span className="text-gray-500 capitalize">
                  {' '}
                  ({t.payment_method.toLowerCase()})
                </span>
              )}
              <HappyHourBadge active={t.happy_hour_active} />
            </span>
            <span className="font-medium">€{t.total_amount.toFixed(2)}</span>
          </li>
        ))}
      </ul>

      {selected && (
        <TransactionModal
          transaction={selected}
          onClose={() => setSelected(null)}
          onChanged={() => {
            loadTransactions();
            openTransaction(selected.id);
          }}
        />
      )}
    </>
  );
}
