'use client';

import { useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import Modal from './Modal';
import {
  createEpcTopUp,
  createStripeTopUpSession,
  type EpcTopUpResult,
  type TopUpMethod,
} from '../lib/api';

type TopUpModalProps = {
  methods: TopUpMethod[];
  onClose: () => void;
};

export default function TopUpModal({ methods, onClose }: TopUpModalProps) {
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<TopUpMethod | ''>(
    methods.length === 1 ? methods[0] : ''
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [epcResult, setEpcResult] = useState<EpcTopUpResult | null>(null);

  async function handleSubmit() {
    setError('');
    const parsedAmount = Number(amount);

    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      setError('Enter a valid amount');
      return;
    }

    if (!method) {
      setError('Choose a payment method');
      return;
    }

    setLoading(true);

    try {
      if (method === 'epc_qr') {
        const result = await createEpcTopUp(parsedAmount);
        setEpcResult(result);
      } else {
        const result = await createStripeTopUpSession(parsedAmount);
        window.location.href = result.checkout_url;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Top-up failed');
    } finally {
      setLoading(false);
    }
  }

  if (epcResult) {
    return (
      <Modal title="Pay by bank transfer" onClose={onClose}>
        <div className="space-y-4">
          <p className="text-sm text-gray-600">{epcResult.message}</p>
          <div className="flex justify-center bg-white p-4 rounded border">
            <QRCodeSVG value={epcResult.epc_payload} size={220} />
          </div>
          <div className="text-sm space-y-1">
            <p>
              <span className="font-medium">Amount:</span> €
              {epcResult.amount.toFixed(2)}
            </p>
            <p>
              <span className="font-medium">Reference:</span>{' '}
              {epcResult.reference}
            </p>
            <p>
              <span className="font-medium">IBAN:</span> {epcResult.iban}
            </p>
            <p>
              <span className="font-medium">Beneficiary:</span>{' '}
              {epcResult.beneficiary_name}
            </p>
          </div>
        </div>
      </Modal>
    );
  }

  return (
    <Modal title="Top up balance" onClose={onClose}>
      <div className="space-y-4">
        <input
          type="number"
          min="0.01"
          step="0.01"
          placeholder="Amount (€)"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className="w-full border rounded px-3 py-2"
        />

        {methods.length > 1 && (
          <div className="space-y-2">
            <p className="text-sm font-medium">Payment method</p>
            {methods.includes('epc_qr') && (
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="topup-method"
                  value="epc_qr"
                  checked={method === 'epc_qr'}
                  onChange={() => setMethod('epc_qr')}
                />
                Bank transfer (EPC QR)
              </label>
            )}
            {methods.includes('stripe') && (
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="topup-method"
                  value="stripe"
                  checked={method === 'stripe'}
                  onChange={() => setMethod('stripe')}
                />
                Card (Stripe)
              </label>
            )}
          </div>
        )}

        {methods.length === 1 && (
          <p className="text-sm text-gray-600">
            {methods[0] === 'epc_qr'
              ? 'You will receive a bank transfer QR code.'
              : 'You will be redirected to Stripe to pay by card.'}
          </p>
        )}

        {error && <p className="text-sm text-red-600">{error}</p>}

        <button
          type="button"
          onClick={handleSubmit}
          disabled={loading}
          className="w-full bg-black text-white py-2 rounded-md disabled:opacity-50"
        >
          {loading ? 'Processing…' : 'Continue'}
        </button>
      </div>
    </Modal>
  );
}
