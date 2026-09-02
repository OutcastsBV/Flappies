'use client';

import { useEffect, useRef, useState } from 'react';
import {
  cancelWeroPayment,
  createWeroPayment,
  getWeroPayment,
} from '../lib/api';
import type { WeroPayment } from '../lib/types';

const FAILED_STATUSES = new Set([
  'FAILED',
  'CANCELLED',
  'EXPIRED',
  'AUTHORIZATION_FAILED',
]);

const POLL_MS = 2000;

let inflightCreate: Promise<WeroPayment> | null = null;
let cancelTimer: ReturnType<typeof setTimeout> | null = null;

function getOrCreatePayment() {
  if (!inflightCreate) {
    inflightCreate = createWeroPayment().catch((err) => {
      inflightCreate = null;
      throw err;
    });
  }
  return inflightCreate;
}

function clearWeroSession() {
  inflightCreate = null;
  if (cancelTimer) {
    clearTimeout(cancelTimer);
    cancelTimer = null;
  }
}

export function resetWeroQrSession() {
  clearWeroSession();
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function statusCopy(status: string) {
  switch (status) {
    case 'IDENTIFIED':
      return 'Customer scanned — waiting for confirmation…';
    case 'AUTHORIZED':
      return 'Confirming payment…';
    case 'SUCCEEDED':
      return 'Payment received — recording sale…';
    case 'EXPIRED':
      return 'QR code expired. Close and try again.';
    case 'CANCELLED':
      return 'Payment was cancelled.';
    case 'FAILED':
    case 'AUTHORIZATION_FAILED':
      return 'Payment failed. Close and try again.';
    default:
      return 'Show this QR to the customer.';
  }
}

function secondsLeft(expiresAt: string | null) {
  if (!expiresAt) return null;
  const ms = new Date(expiresAt).getTime() - Date.now();
  return Math.max(0, Math.ceil(ms / 1000));
}

export default function WeroQrPanel({
  onPaid,
}: {
  onPaid: (paymentId: string) => Promise<void>;
}) {
  const onPaidRef = useRef(onPaid);
  onPaidRef.current = onPaid;

  const [payment, setPayment] = useState<WeroPayment | null>(null);
  const [status, setStatus] = useState('PENDING');
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [remaining, setRemaining] = useState<number | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    const state = { paymentId: null as string | null, succeeded: false };

    if (cancelTimer) {
      clearTimeout(cancelTimer);
      cancelTimer = null;
    }

    async function run() {
      try {
        const created = await getOrCreatePayment();
        if (cancelled) return;

        state.paymentId = created.paymentId;
        setPayment(created);
        setStatus(created.status);
        setExpiresAt(created.expiresAt);

        while (!cancelled && !state.succeeded) {
          const current = await getWeroPayment(state.paymentId);
          if (cancelled) return;

          setStatus(current.status);
          if (current.expiresAt) setExpiresAt(current.expiresAt);

          if (current.status === 'SUCCEEDED') {
            state.succeeded = true;
            clearWeroSession();
            await onPaidRef.current(current.paymentId);
            return;
          }

          if (FAILED_STATUSES.has(current.status)) {
            clearWeroSession();
            setError(statusCopy(current.status));
            return;
          }

          await sleep(POLL_MS);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Wero payment failed');
        }
      }
    }

    run();

    return () => {
      cancelled = true;
      if (state.succeeded) {
        clearWeroSession();
        return;
      }
      const paymentId = state.paymentId;
      const pending = inflightCreate;
      cancelTimer = setTimeout(() => {
        cancelTimer = null;
        inflightCreate = null;
        if (paymentId) {
          void Promise.resolve(cancelWeroPayment(paymentId)).catch(() => {});
          return;
        }
        void Promise.resolve(pending)
          .then((created) =>
            created ? cancelWeroPayment(created.paymentId) : undefined
          )
          .catch(() => {});
      }, 0);
    };
  }, []);

  useEffect(() => {
    setRemaining(secondsLeft(expiresAt));
    if (!expiresAt) return undefined;

    const timer = window.setInterval(() => {
      setRemaining(secondsLeft(expiresAt));
    }, 1000);

    return () => window.clearInterval(timer);
  }, [expiresAt]);

  if (error) {
    return <p className="text-sm text-red-600">{error}</p>;
  }

  if (!payment) {
    return <p className="text-sm text-gray-600">Creating Wero payment…</p>;
  }

  return (
    <div className="space-y-3 text-center">
      {payment.qrcodeUrl ? (
        // Payconiq hosts the PNG; a native img avoids Next image-domain config.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={payment.qrcodeUrl}
          alt="Wero QR code"
          width={250}
          height={250}
          className="mx-auto"
        />
      ) : (
        <p className="text-sm text-red-600">QR code was not returned by Wero.</p>
      )}
      <p className="text-sm text-gray-700">{statusCopy(status)}</p>
      {remaining != null && status === 'PENDING' && (
        <p className="text-xs text-gray-500">Expires in {remaining}s</p>
      )}
    </div>
  );
}
