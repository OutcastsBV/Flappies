'use client';

import { useState } from 'react';
import Modal from './Modal';
import type { EnabledPaymentMethod } from '../lib/types';

export default function ChargeModal({
  total,
  methods,
  onClose,
  onConfirm,
}: {
  total: number;
  methods: EnabledPaymentMethod[];
  onClose: () => void;
  onConfirm: (
    method: string,
    details: { amountTendered?: number; paymentReference?: string }
  ) => Promise<void>;
}) {
  const [method, setMethod] = useState(methods[0]?.method_key ?? '');
  const [amountTendered, setAmountTendered] = useState('');
  const [paymentReference, setPaymentReference] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const isCash = method === 'CASH';
  const tenderedValue = Number(amountTendered);
  const changeDue =
    isCash && Number.isFinite(tenderedValue) ? tenderedValue - total : 0;

  const quickAmounts = Array.from(
    new Set([total, Math.ceil(total / 5) * 5, Math.ceil(total / 10) * 10, Math.ceil(total / 20) * 20])
  ).filter((amount) => amount > 0);

  async function handleConfirm() {
    setError('');

    if (!method) {
      setError('Choose a payment method');
      return;
    }

    if (isCash) {
      if (!Number.isFinite(tenderedValue) || tenderedValue < total) {
        setError('Amount tendered must be at least the total due');
        return;
      }
    }

    setSubmitting(true);
    try {
      await onConfirm(method, {
        amountTendered: isCash ? tenderedValue : undefined,
        paymentReference: !isCash && paymentReference ? paymentReference : undefined,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Checkout failed');
    } finally {
      setSubmitting(false);
    }
  }

  if (methods.length === 0) {
    return (
      <Modal title="Charge customer" onClose={onClose}>
        <p className="text-sm text-red-600">
          No payment methods are enabled. Ask an admin to enable one in Config.
        </p>
      </Modal>
    );
  }

  return (
    <Modal title="Charge customer" onClose={onClose}>
      <div className="space-y-4">
        <p className="text-2xl font-semibold text-center">
          €{total.toFixed(2)}
        </p>

        <div className="space-y-2">
          <p className="text-sm font-medium">Payment method</p>
          <div className="flex flex-wrap gap-2">
            {methods.map((m) => (
              <button
                key={m.method_key}
                type="button"
                onClick={() => setMethod(m.method_key)}
                className={`px-3 py-2 rounded border text-sm ${
                  method === m.method_key
                    ? 'bg-black text-white border-black'
                    : 'bg-white text-gray-700 border-gray-300'
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>

        {isCash ? (
          <div className="space-y-2">
            <label className="block text-sm font-medium">Amount tendered (€)</label>
            <input
              type="number"
              step="0.01"
              min="0"
              className="border p-2 w-full rounded"
              value={amountTendered}
              onChange={(e) => setAmountTendered(e.target.value)}
              autoFocus
            />
            <div className="flex flex-wrap gap-2">
              {quickAmounts.map((amount) => (
                <button
                  key={amount}
                  type="button"
                  onClick={() => setAmountTendered(amount.toFixed(2))}
                  className="px-2 py-1 text-xs border rounded"
                >
                  €{amount.toFixed(2)}
                </button>
              ))}
            </div>
            {amountTendered && Number.isFinite(tenderedValue) && (
              <p className="text-sm text-gray-700">
                Change due:{' '}
                <span className="font-medium">
                  €{Math.max(changeDue, 0).toFixed(2)}
                </span>
              </p>
            )}
          </div>
        ) : (
          <div>
            <label className="block text-sm font-medium mb-1">
              Reference note (optional)
            </label>
            <input
              className="border p-2 w-full rounded"
              placeholder="e.g. last 4 digits, receipt id…"
              value={paymentReference}
              onChange={(e) => setPaymentReference(e.target.value)}
              maxLength={140}
            />
            <p className="text-xs text-gray-500 mt-1">
              Payment is taken on the {method.toLowerCase()} terminal/app — this just
              records that it happened.
            </p>
          </div>
        )}

        {error && <p className="text-sm text-red-600">{error}</p>}

        <button
          type="button"
          onClick={handleConfirm}
          disabled={submitting}
          className="w-full bg-black text-white py-2 rounded-md disabled:opacity-50"
        >
          {submitting ? 'Processing…' : 'Confirm payment'}
        </button>
      </div>
    </Modal>
  );
}
