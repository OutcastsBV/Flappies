'use client';

import { useState } from 'react';
import { Transaction } from '../../lib/types';
import CorrectionModal from '../CorrectionModal';
import HappyHourBadge from '../HappyHourBadge';

export default function TransactionModal({
  transaction,
  onClose,
  onChanged,
}: {
  transaction: Transaction;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [showCorrection, setShowCorrection] = useState(false);
  const corrections = transaction.corrections ?? [];

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-white p-6 rounded-xl w-full max-w-md space-y-4">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          Transaction #{transaction.id}
          <HappyHourBadge active={transaction.happy_hour_active} />
        </h2>

        <p className="text-sm text-gray-600">
          {new Date(transaction.timestamp).toLocaleString()}
          {transaction.username && ` — ${transaction.username}`}
          {transaction.payment_method && (
            <span className="capitalize"> — {transaction.payment_method.toLowerCase()}</span>
          )}
        </p>

        {transaction.items.length === 0 ? (
          <p className="text-gray-600">No items</p>
        ) : (
          <ul className="space-y-2 text-sm">
            {transaction.items.map((item, idx) => (
              <li
                key={`${item.product_id}-${idx}`}
                className="flex justify-between"
              >
                <span>
                  {item.name ?? `Product #${item.product_id}`} × {item.quantity}
                </span>
                <span>
                  €{(item.unit_price * item.quantity).toFixed(2)}
                </span>
              </li>
            ))}
          </ul>
        )}

        <div className="pt-3 border-t flex justify-between font-semibold">
          <span>Total</span>
          <span>€{transaction.total_amount.toFixed(2)}</span>
        </div>

        {corrections.length > 0 && (
          <div className="space-y-2">
            <p className="text-sm font-medium">Corrections</p>
            <ul className="space-y-1 text-sm">
              {corrections.map((c) => (
                <li key={c.id} className="flex justify-between text-red-700">
                  <span>
                    {c.type.replace('_', ' ').toLowerCase()} — {c.reason}
                  </span>
                  <span>-€{c.amount.toFixed(2)}</span>
                </li>
              ))}
            </ul>
            {transaction.net_total != null && (
              <div className="flex justify-between font-semibold text-sm pt-1 border-t">
                <span>Net total</span>
                <span>€{transaction.net_total.toFixed(2)}</span>
              </div>
            )}
          </div>
        )}

        <div className="flex gap-3 pt-2">
          <button
            onClick={() => setShowCorrection(true)}
            className="flex-1 border py-2 rounded-md"
          >
            Add correction
          </button>
          <button
            onClick={onClose}
            className="flex-1 bg-black text-white py-2 rounded-md"
          >
            Close
          </button>
        </div>
      </div>

      {showCorrection && (
        <CorrectionModal
          transactionId={transaction.id}
          maxAmount={transaction.total_amount}
          onClose={() => setShowCorrection(false)}
          onSaved={() => {
            setShowCorrection(false);
            onChanged();
          }}
        />
      )}
    </div>
  );
}
