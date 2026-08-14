'use client';

import { useEffect, useState } from 'react';
import { getTransactions, getTransaction } from '../../lib/api';
import TransactionModal from './TransactionModal';
import { Transaction } from '../../lib/types';

export default function TransactionsPanel() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [selected, setSelected] = useState<Transaction | null>(null);

  useEffect(() => {
    getTransactions().then(setTransactions);
  }, []);

  return (
    <>
      <h1 className="text-2xl font-semibold mb-6">Transactions</h1>

      <ul className="bg-white rounded shadow divide-y">
        {transactions.map((t) => (
          <li
            key={t.id}
            className="p-4 cursor-pointer hover:bg-gray-100 flex justify-between"
            onClick={async () => {
              const full = await getTransaction(t.id);
              setSelected(full);
            }}
          >
            <span>
              #{t.id} — {t.username ?? 'Unknown'} —{' '}
              {new Date(t.timestamp).toLocaleString()}
            </span>
            <span className="font-medium">€{t.total_amount.toFixed(2)}</span>
          </li>
        ))}
      </ul>

      {selected && (
        <TransactionModal
          transaction={selected}
          onClose={() => setSelected(null)}
        />
      )}
    </>
  );
}
