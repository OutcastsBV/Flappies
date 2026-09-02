'use client';

import { useEffect, useState } from 'react';
import {
  listSumupReaders,
  pairSumupReader,
  updatePaymentMethod,
} from '../../lib/api';
import type { PaymentMethodConfig, SumUpReader } from '../../lib/types';

export default function SumUpReaderSetup({
  method,
  onSaved,
}: {
  method: PaymentMethodConfig;
  onSaved: (updated: PaymentMethodConfig) => void;
}) {
  const [readers, setReaders] = useState<SumUpReader[]>([]);
  const [pairingCode, setPairingCode] = useState('');
  const [name, setName] = useState('Register');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const configured =
    method.fields.find((f) => f.key === 'api_key')?.has_value &&
    method.fields.find((f) => f.key === 'merchant_code')?.has_value;
  const selectedReaderId = method.fields.find((f) => f.key === 'reader_id')
    ?.value;

  async function refresh() {
    if (!configured) return;
    setError('');
    setLoading(true);
    try {
      setReaders(await listSumupReaders());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to list terminals');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [configured]);

  async function pair() {
    setError('');
    setLoading(true);
    try {
      await pairSumupReader(pairingCode, name);
      setPairingCode('');
      const updated = await updatePaymentMethod('SUMUP', {});
      onSaved(updated);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to pair terminal');
      setLoading(false);
    }
  }

  async function selectReader(readerId: string) {
    setError('');
    setLoading(true);
    try {
      const updated = await updatePaymentMethod('SUMUP', {
        config: { reader_id: readerId },
      });
      onSaved(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to select terminal');
    } finally {
      setLoading(false);
    }
  }

  if (!configured) {
    return (
      <p className="text-xs text-gray-500">
        Save an API key and merchant code first, then pair the Solo terminal.
        Bluetooth-only readers (Air / Plus) cannot take Cloud API payments.
      </p>
    );
  }

  return (
    <div className="space-y-3 pt-2 border-t">
      <p className="text-xs text-gray-600">
        Pair as many Solos as you need. Cashiers pick which terminal to charge
        when more than one is paired. “Default” is only the pre-selected
        checkout choice. On the Solo, log out of the SumUp app and start
        pairing so it shows an 8–9 character code. Wi-Fi Solo and Virtual Solo
        work; Air/Plus do not.
      </p>
      <div className="grid sm:grid-cols-2 gap-2">
        <input
          className="border p-2 w-full rounded text-sm uppercase"
          placeholder="Pairing code"
          value={pairingCode}
          onChange={(e) => setPairingCode(e.target.value)}
          maxLength={9}
        />
        <input
          className="border p-2 w-full rounded text-sm"
          placeholder="Name"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </div>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={pair}
          disabled={loading || pairingCode.trim().length < 8}
          className="text-sm border px-3 py-1.5 rounded disabled:opacity-50"
        >
          Pair terminal
        </button>
        <button
          type="button"
          onClick={refresh}
          disabled={loading}
          className="text-sm border px-3 py-1.5 rounded disabled:opacity-50"
        >
          Refresh list
        </button>
      </div>
      {readers.length > 0 && (
        <ul className="space-y-1 text-sm">
          {readers.map((reader) => (
            <li
              key={reader.id}
              className="flex justify-between items-center gap-2"
            >
              <span>
                {reader.name}{' '}
                <span className="text-xs text-gray-500">
                  {reader.status}
                  {reader.model ? ` · ${reader.model}` : ''}
                </span>
              </span>
              {selectedReaderId === reader.id ? (
                <span className="text-xs text-green-700">Default</span>
              ) : (
                <button
                  type="button"
                  onClick={() => selectReader(reader.id)}
                  disabled={loading || reader.status !== 'paired'}
                  className="text-xs border px-2 py-1 rounded disabled:opacity-50"
                >
                  Set default
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
