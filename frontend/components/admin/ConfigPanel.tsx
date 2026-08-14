'use client';

import { useEffect, useState } from 'react';
import { getConfig, updateConfig } from '../../lib/api';
import type { ShopConfig } from '../../lib/types';

const WEEKDAYS = [
  { value: 1, label: 'Mon' },
  { value: 2, label: 'Tue' },
  { value: 3, label: 'Wed' },
  { value: 4, label: 'Thu' },
  { value: 5, label: 'Fri' },
  { value: 6, label: 'Sat' },
  { value: 0, label: 'Sun' },
];

function isHappyHourActive(config: ShopConfig) {
  const days = config.happy_hour_days ?? [];
  const startTime = config.happy_hour_start_time;
  const endTime = config.happy_hour_end_time;

  if (!days.length || !startTime || !endTime) {
    return false;
  }

  const now = new Date();
  const day = now.getDay();
  if (!days.includes(day)) {
    return false;
  }

  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const [startHour, startMinute] = startTime.split(':').map(Number);
  const [endHour, endMinute] = endTime.split(':').map(Number);
  const startMinutes = startHour * 60 + startMinute;
  const endMinutes = endHour * 60 + endMinute;

  if (startMinutes <= endMinutes) {
    return nowMinutes >= startMinutes && nowMinutes < endMinutes;
  }

  return nowMinutes >= startMinutes || nowMinutes < endMinutes;
}

export default function ConfigPanel() {
  const [days, setDays] = useState<number[]>([]);
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [operationMode, setOperationMode] = useState<'self_service' | 'pos'>('self_service');
  const [topUpEpcEnabled, setTopUpEpcEnabled] = useState(false);
  const [topUpStripeEnabled, setTopUpStripeEnabled] = useState(false);
  const [topUpEpcConfigured, setTopUpEpcConfigured] = useState(false);
  const [topUpStripeConfigured, setTopUpStripeConfigured] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const [active, setActive] = useState(false);

  async function load() {
    setLoading(true);
    setError('');

    try {
      const config: ShopConfig = await getConfig();
      setDays(config.happy_hour_days ?? []);
      setStartTime(config.happy_hour_start_time ?? '');
      setEndTime(config.happy_hour_end_time ?? '');
      setOperationMode(config.operation_mode ?? 'self_service');
      setTopUpEpcEnabled(config.top_up_epc_enabled ?? false);
      setTopUpStripeEnabled(config.top_up_stripe_enabled ?? false);
      setTopUpEpcConfigured(config.top_up_epc_configured ?? false);
      setTopUpStripeConfigured(config.top_up_stripe_configured ?? false);
      setActive(isHappyHourActive(config));
    } catch {
      setError('Failed to load config');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  function toggleDay(day: number) {
    setDays((current) =>
      current.includes(day)
        ? current.filter((value) => value !== day)
        : [...current, day].sort((a, b) => a - b)
    );
  }

  async function submit() {
    setSaving(true);
    setError('');
    setSaved(false);

    try {
      const config: ShopConfig = await updateConfig({
        happy_hour_days: days,
        happy_hour_start_time: startTime || null,
        happy_hour_end_time: endTime || null,
        operation_mode: operationMode,
        top_up_epc_enabled: topUpEpcEnabled,
        top_up_stripe_enabled: topUpStripeEnabled,
      });

      setDays(config.happy_hour_days ?? []);
      setStartTime(config.happy_hour_start_time ?? '');
      setEndTime(config.happy_hour_end_time ?? '');
      setOperationMode(config.operation_mode ?? 'self_service');
      setTopUpEpcEnabled(config.top_up_epc_enabled ?? false);
      setTopUpStripeEnabled(config.top_up_stripe_enabled ?? false);
      setTopUpEpcConfigured(config.top_up_epc_configured ?? false);
      setTopUpStripeConfigured(config.top_up_stripe_configured ?? false);
      setActive(isHappyHourActive(config));
      setSaved(true);
    } catch {
      setError('Failed to save config');
    } finally {
      setSaving(false);
    }
  }

  function clearHappyHour() {
    setDays([]);
    setStartTime('');
    setEndTime('');
  }

  if (loading) {
    return <p className="text-gray-700">Loading config…</p>;
  }

  return (
    <>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold">Config</h1>
      </div>

      <div className="bg-white rounded-xl shadow p-6 max-w-xl space-y-5">
        <div>
          <h2 className="text-lg font-semibold">Operation mode</h2>
          <p className="text-sm text-gray-600 mt-1">
            Self-service: members buy with their wallet. POS (future): staff sells to walk-in customers.
          </p>
          <select
            className="border p-2 w-full rounded mt-2"
            value={operationMode}
            onChange={(e) =>
              setOperationMode(e.target.value as 'self_service' | 'pos')
            }
          >
            <option value="self_service">Self-service (member card)</option>
            <option value="pos">POS (staff sells to clients)</option>
          </select>
        </div>

        <div>
          <h2 className="text-lg font-semibold">Top-up methods</h2>
          <p className="text-sm text-gray-600 mt-1">
            Enable or disable payment methods for wallet top-up. Methods also
            require server configuration in <code>.env</code>.
          </p>

          <div className="space-y-3 mt-3">
            <label className="flex items-start gap-3 text-sm">
              <input
                type="checkbox"
                checked={topUpEpcEnabled}
                disabled={!topUpEpcConfigured}
                onChange={(e) => setTopUpEpcEnabled(e.target.checked)}
                className="mt-1"
              />
              <span>
                <span className="font-medium">Bank transfer (EPC QR)</span>
                {!topUpEpcConfigured && (
                  <span className="block text-gray-500">
                    Not configured — set EPC_QR_IBAN and EPC_QR_BENEFICIARY_NAME
                    in the API environment.
                  </span>
                )}
              </span>
            </label>

            <label className="flex items-start gap-3 text-sm">
              <input
                type="checkbox"
                checked={topUpStripeEnabled}
                disabled={!topUpStripeConfigured}
                onChange={(e) => setTopUpStripeEnabled(e.target.checked)}
                className="mt-1"
              />
              <span>
                <span className="font-medium">Card (Stripe)</span>
                {!topUpStripeConfigured && (
                  <span className="block text-gray-500">
                    Not configured — set STRIPE_SECRET_KEY in the API environment.
                  </span>
                )}
              </span>
            </label>
          </div>
        </div>

        <div>
          <h2 className="text-lg font-semibold">Happy hour</h2>
          <p className="text-sm text-gray-600 mt-1">
            Pick the days and daily time window when all dashboard prices are halved.
            Times use a 24-hour clock.
          </p>
          <p className="text-sm mt-2">
            Status:{' '}
            <span
              className={
                active ? 'text-green-700 font-medium' : 'text-gray-700'
              }
            >
              {active ? 'Active now' : 'Inactive'}
            </span>
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium mb-2">Days</label>
          <div className="flex flex-wrap gap-2">
            {WEEKDAYS.map((day) => (
              <button
                key={day.value}
                type="button"
                onClick={() => toggleDay(day.value)}
                className={`px-3 py-2 rounded border text-sm ${
                  days.includes(day.value)
                    ? 'bg-black text-white border-black'
                    : 'bg-white text-gray-700 border-gray-300'
                }`}
              >
                {day.label}
              </button>
            ))}
          </div>
        </div>

        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">Start time</label>
            <input
              type="time"
              step={60}
              lang="en-GB"
              className="border p-2 w-full rounded"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">End time</label>
            <input
              type="time"
              step={60}
              lang="en-GB"
              className="border p-2 w-full rounded"
              value={endTime}
              onChange={(e) => setEndTime(e.target.value)}
            />
          </div>
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}
        {saved && !error && (
          <p className="text-sm text-green-700">Config saved.</p>
        )}

        <div className="flex justify-end gap-3 pt-2">
          <button
            onClick={clearHappyHour}
            className="text-gray-700"
            disabled={saving}
            type="button"
          >
            Clear
          </button>
          <button
            onClick={submit}
            disabled={saving}
            type="button"
            className="bg-black text-white px-4 py-2 rounded disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </>
  );
}
