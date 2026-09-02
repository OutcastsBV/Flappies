'use client';

import { useEffect, useState } from 'react';
import Modal from './Modal';
import WeroQrPanel from './WeroQrPanel';
import SumUpTerminalPanel from './SumUpTerminalPanel';
import { listSumupReaders } from '../lib/api';
import type { EnabledPaymentMethod, SumUpReader } from '../lib/types';

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
  const [paidReference, setPaidReference] = useState('');
  const [sumupReaders, setSumupReaders] = useState<SumUpReader[]>([]);
  const [sumupReaderId, setSumupReaderId] = useState('');
  const [sumupReadersError, setSumupReadersError] = useState('');
  const [sumupReadersLoaded, setSumupReadersLoaded] = useState(false);

  const isCash = method === 'CASH';
  const isWero = method === 'WERO';
  const isSumUp = method === 'SUMUP';
  const selectedMethod = methods.find((m) => m.method_key === method);
  const tenderedValue = Number(amountTendered);
  const changeDue =
    isCash && Number.isFinite(tenderedValue) ? tenderedValue - total : 0;

  const quickAmounts = Array.from(
    new Set([total, Math.ceil(total / 5) * 5, Math.ceil(total / 10) * 10, Math.ceil(total / 20) * 20])
  ).filter((amount) => amount > 0);

  const defaultSumupReaderId = methods.find((m) => m.method_key === 'SUMUP')
    ?.default_reader_id;

  useEffect(() => {
    if (!isSumUp) return undefined;

    let cancelled = false;
    setSumupReadersLoaded(false);
    setSumupReadersError('');
    listSumupReaders()
      .then((readers) => {
        if (cancelled) return;
        const paired = readers.filter((reader) => reader.status === 'paired');
        setSumupReaders(paired);
        setSumupReadersLoaded(true);
        setSumupReaderId((current) => {
          if (current && paired.some((reader) => reader.id === current)) {
            return current;
          }
          if (paired.length === 1) return paired[0].id;
          if (
            defaultSumupReaderId &&
            paired.some((reader) => reader.id === defaultSumupReaderId)
          ) {
            return defaultSumupReaderId;
          }
          return '';
        });
      })
      .catch((err) => {
        if (!cancelled) {
          setSumupReadersLoaded(true);
          setSumupReadersError(
            err instanceof Error ? err.message : 'Failed to list SumUp terminals'
          );
        }
      });

    return () => {
      cancelled = true;
    };
  }, [isSumUp, defaultSumupReaderId]);

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

  async function handleSumupPaid(paymentReference: string) {
    setError('');
    setPaidReference(paymentReference);
    setSubmitting(true);
    try {
      await onConfirm('SUMUP', { paymentReference });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Checkout failed';
      setError(
        `Payment was received by SumUp but the sale could not be recorded. Do not charge again. Reference: ${paymentReference}. ${message}`
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function handleWeroPaid(paymentId: string) {
    setError('');
    setPaidReference(paymentId);
    setSubmitting(true);
    try {
      await onConfirm('WERO', { paymentReference: paymentId });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Checkout failed';
      setError(
        `Payment was received by Wero but the sale could not be recorded. Do not charge again. Reference: ${paymentId}. ${message}`
      );
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
                onClick={() => {
                  if (submitting) return;
                  setMethod(m.method_key);
                  setError('');
                  setPaidReference('');
                }}
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
        ) : isWero ? (
          paidReference ? (
            <p className="text-sm text-center text-gray-600">
              Payment received — recording sale…
            </p>
          ) : (
            <WeroQrPanel key={`${method}-${total}`} onPaid={handleWeroPaid} />
          )
        ) : isSumUp ? (
          paidReference ? (
            <p className="text-sm text-center text-gray-600">
              Payment received — recording sale…
            </p>
          ) : (
          <div className="space-y-3">
            {sumupReadersError ? (
              <p className="text-sm text-red-600">{sumupReadersError}</p>
            ) : !sumupReadersLoaded ? (
              <p className="text-sm text-gray-600">
                Loading SumUp terminals…
              </p>
            ) : sumupReaders.length === 0 ? (
              <p className="text-sm text-gray-600">
                No SumUp terminal is paired. Pair one in Admin → Config.
              </p>
            ) : (
              <>
                {sumupReaders.length > 1 && (
                  <div className="space-y-2">
                    <p className="text-sm font-medium">Terminal</p>
                    <div className="flex flex-wrap gap-2">
                      {sumupReaders.map((reader) => (
                        <button
                          key={reader.id}
                          type="button"
                          disabled={submitting}
                          onClick={() => {
                            setSumupReaderId(reader.id);
                            setError('');
                            setPaidReference('');
                          }}
                          className={`px-3 py-2 rounded border text-sm ${
                            sumupReaderId === reader.id
                              ? 'bg-black text-white border-black'
                              : 'bg-white text-gray-700 border-gray-300'
                          }`}
                        >
                          {reader.name}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                {sumupReaderId ? (
                  <SumUpTerminalPanel
                    key={`${method}-${total}-${sumupReaderId}`}
                    readerId={sumupReaderId}
                    onPaid={handleSumupPaid}
                  />
                ) : (
                  <p className="text-sm text-gray-600">
                    Choose which SumUp terminal to send the amount to.
                  </p>
                )}
              </>
            )}
          </div>
          )
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
              Payment is taken on the {selectedMethod?.label ?? method}{' '}
              terminal/app — this just records that it happened.
            </p>
          </div>
        )}

        {error && <p className="text-sm text-red-600">{error}</p>}

        {!isWero && !isSumUp && (
          <button
            type="button"
            onClick={handleConfirm}
            disabled={submitting}
            className="w-full bg-black text-white py-2 rounded-md disabled:opacity-50"
          >
            {submitting ? 'Processing…' : 'Confirm payment'}
          </button>
        )}

        {(isWero || isSumUp) && submitting && (
          <p className="text-sm text-center text-gray-600">Processing…</p>
        )}

        {(isWero || isSumUp) && paidReference && error && (
          <p className="text-xs text-gray-500 break-all">
            Keep this reference: {paidReference}
          </p>
        )}
      </div>
    </Modal>
  );
}
