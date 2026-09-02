'use client';

import { useEffect, useRef, useState } from 'react';
import {
  cancelSumupCheckout,
  createSumupCheckout,
  getSumupCheckout,
} from '../lib/api';
import type { SumUpCheckout } from '../lib/types';

const FAILED_STATUSES = new Set(['failed', 'cancelled']);
const POLL_MS = 2000;

let inflightCreate: Promise<SumUpCheckout> | null = null;
let inflightReaderId: string | null = null;
let cancelTimer: ReturnType<typeof setTimeout> | null = null;

function getOrCreateCheckout(readerId: string) {
  if (inflightCreate && inflightReaderId === readerId) {
    return inflightCreate;
  }

  if (inflightReaderId && inflightReaderId !== readerId) {
    const previousReaderId = inflightReaderId;
    void Promise.resolve(cancelSumupCheckout(previousReaderId)).catch(() => {});
  }

  inflightReaderId = readerId;
  inflightCreate = createSumupCheckout(readerId).catch((err) => {
    inflightCreate = null;
    inflightReaderId = null;
    throw err;
  });
  return inflightCreate;
}

function clearCheckoutSession() {
  inflightCreate = null;
  inflightReaderId = null;
  if (cancelTimer) {
    clearTimeout(cancelTimer);
    cancelTimer = null;
  }
}

export function resetSumupTerminalSession() {
  clearCheckoutSession();
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function statusCopy(status: string) {
  switch (status) {
    case 'successful':
      return 'Payment received — recording sale…';
    case 'failed':
      return 'Payment failed on the terminal. Close and try again.';
    case 'cancelled':
      return 'Payment was cancelled on the terminal.';
    default:
      return 'Ask the customer to tap or insert their card on the SumUp terminal.';
  }
}

export default function SumUpTerminalPanel({
  readerId,
  onPaid,
}: {
  readerId: string;
  onPaid: (paymentReference: string) => Promise<void>;
}) {
  const onPaidRef = useRef(onPaid);
  onPaidRef.current = onPaid;

  const [checkout, setCheckout] = useState<SumUpCheckout | null>(null);
  const [status, setStatus] = useState('pending');
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    const state = {
      readerId: null as string | null,
      checkoutId: null as string | null,
      succeeded: false,
    };

    if (cancelTimer) {
      clearTimeout(cancelTimer);
      cancelTimer = null;
    }

    async function run() {
      try {
        const created = await getOrCreateCheckout(readerId);
        if (cancelled) return;

        state.readerId = created.readerId;
        state.checkoutId = created.checkoutId;
        setCheckout(created);
        setStatus(created.status);

        while (!cancelled && !state.succeeded) {
          const current = await getSumupCheckout(
            state.readerId,
            state.checkoutId
          );
          if (cancelled) return;

          setStatus(current.status);

          if (current.status === 'successful') {
            state.succeeded = true;
            clearCheckoutSession();
            await onPaidRef.current(
              current.paymentReference || created.paymentReference
            );
            return;
          }

          if (FAILED_STATUSES.has(current.status)) {
            clearCheckoutSession();
            setError(statusCopy(current.status));
            return;
          }

          await sleep(POLL_MS);
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : 'SumUp payment failed'
          );
        }
      }
    }

    run();

    return () => {
      cancelled = true;
      if (state.succeeded) {
        clearCheckoutSession();
        return;
      }
      const readerId = state.readerId;
      const pending = inflightCreate;
      cancelTimer = setTimeout(() => {
        cancelTimer = null;
        inflightCreate = null;
        inflightReaderId = null;
        if (readerId) {
          void Promise.resolve(cancelSumupCheckout(readerId)).catch(() => {});
          return;
        }
        void Promise.resolve(pending)
          .then((created) =>
            created ? cancelSumupCheckout(created.readerId) : undefined
          )
          .catch(() => {});
      }, 0);
    };
  }, [readerId]);

  if (error) {
    return <p className="text-sm text-red-600">{error}</p>;
  }

  if (!checkout) {
    return (
      <p className="text-sm text-gray-600">Sending amount to the terminal…</p>
    );
  }

  return (
    <div className="space-y-2 text-center">
      <p className="text-sm text-gray-700">{statusCopy(status)}</p>
      <p className="text-xs text-gray-500">
        Keep this window open until the terminal finishes.
      </p>
    </div>
  );
}
