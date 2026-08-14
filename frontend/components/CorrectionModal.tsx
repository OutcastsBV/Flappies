'use client';

import { useState } from 'react';
import Modal from './Modal';
import { createCorrection } from '../lib/api';
import type { CorrectionType } from '../lib/types';

const TYPES: { value: CorrectionType; label: string }[] = [
  { value: 'REFUND', label: 'Refund' },
  { value: 'PRICE_ADJUSTMENT', label: 'Bad price' },
  { value: 'ITEM_REMOVED', label: 'Bad item' },
  { value: 'OTHER', label: 'Other' },
];

export default function CorrectionModal({
  transactionId,
  maxAmount,
  onClose,
  onSaved,
}: {
  transactionId: number;
  maxAmount?: number;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [type, setType] = useState<CorrectionType>('REFUND');
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function submit() {
    setError('');
    const parsedAmount = Number(amount);

    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      setError('Enter a valid amount');
      return;
    }

    if (!reason.trim()) {
      setError('A reason is required');
      return;
    }

    setSaving(true);
    try {
      await createCorrection({
        transaction_id: transactionId,
        type,
        amount: parsedAmount,
        reason: reason.trim(),
      });
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create correction');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title="Add correction" onClose={onClose}>
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium mb-2">Type</label>
          <div className="flex flex-wrap gap-2">
            {TYPES.map((t) => (
              <button
                key={t.value}
                type="button"
                onClick={() => setType(t.value)}
                className={`px-3 py-2 rounded border text-sm ${
                  type === t.value
                    ? 'bg-black text-white border-black'
                    : 'bg-white text-gray-700 border-gray-300'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Amount (€)</label>
          <input
            type="number"
            step="0.01"
            min="0.01"
            max={maxAmount}
            className="border p-2 w-full rounded"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
          {maxAmount != null && (
            <p className="text-xs text-gray-500 mt-1">
              Transaction total: €{maxAmount.toFixed(2)}
            </p>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Reason</label>
          <textarea
            className="border p-2 w-full rounded"
            rows={3}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="flex justify-end gap-3 pt-2">
          <button onClick={onClose} className="text-gray-700" disabled={saving}>
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={saving}
            className="bg-black text-white px-4 py-2 rounded disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save correction'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
