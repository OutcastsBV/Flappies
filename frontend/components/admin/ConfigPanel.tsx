'use client';

import { useEffect, useState } from 'react';
import {
  getConfig,
  updateConfig,
  getPaymentMethodsAdmin,
  updatePaymentMethod,
} from '../../lib/api';
import type { PaymentMethodConfig, ShopConfig } from '../../lib/types';

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

function PaymentMethodRow({
  method,
  onSaved,
}: {
  method: PaymentMethodConfig;
  onSaved: (updated: PaymentMethodConfig) => void;
}) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function toggleEnabled() {
    setError('');
    setSaving(true);
    try {
      const updated = await updatePaymentMethod(method.method_key, {
        enabled: !method.enabled,
      });
      onSaved(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update');
    } finally {
      setSaving(false);
    }
  }

  async function saveKeys() {
    setError('');
    setSaving(true);
    try {
      const updated = await updatePaymentMethod(method.method_key, {
        config: values,
      });
      onSaved(updated);
      setValues({});
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save keys');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="border rounded-lg p-4 space-y-3">
      <div className="flex justify-between items-center">
        <div>
          <p className="font-medium">{method.label}</p>
          <p className="text-xs text-gray-500">{method.method_key}</p>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={method.enabled}
            disabled={saving}
            onChange={toggleEnabled}
          />
          Enabled
        </label>
      </div>

      {method.fields.length > 0 && (
        <div className="space-y-2">
          {method.fields.map((field) => (
            <div key={field.key}>
              <label className="block text-xs font-medium mb-1">
                {field.label}
                {field.has_value && (
                  <span className="text-green-700 ml-1">(configured)</span>
                )}
              </label>
              <input
                type={field.secret ? 'password' : 'text'}
                placeholder={field.has_value ? '••••••••' : ''}
                className="border p-2 w-full rounded text-sm"
                value={values[field.key] ?? ''}
                onChange={(e) =>
                  setValues((v) => ({ ...v, [field.key]: e.target.value }))
                }
              />
            </div>
          ))}
          <button
            type="button"
            onClick={saveKeys}
            disabled={saving}
            className="text-sm border px-3 py-1.5 rounded disabled:opacity-50"
          >
            Save keys
          </button>
        </div>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}

export default function ConfigPanel() {
  const [days, setDays] = useState<number[]>([]);
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const [active, setActive] = useState(false);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethodConfig[]>([]);

  async function load() {
    setLoading(true);
    setError('');

    try {
      const [config, methods] = await Promise.all([
        getConfig(),
        getPaymentMethodsAdmin(),
      ]);
      setDays(config.happy_hour_days ?? []);
      setStartTime(config.happy_hour_start_time ?? '');
      setEndTime(config.happy_hour_end_time ?? '');
      setActive(isHappyHourActive(config));
      setPaymentMethods(methods);
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
      });

      setDays(config.happy_hour_days ?? []);
      setStartTime(config.happy_hour_start_time ?? '');
      setEndTime(config.happy_hour_end_time ?? '');
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

  function handleMethodSaved(updated: PaymentMethodConfig) {
    setPaymentMethods((current) =>
      current.map((m) => (m.method_key === updated.method_key ? updated : m))
    );
  }

  if (loading) {
    return <p className="text-gray-700">Loading config…</p>;
  }

  return (
    <>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold">Config</h1>
      </div>

      <div className="space-y-6 max-w-xl">
        <div className="bg-white rounded-xl shadow p-6 space-y-3">
          <h2 className="text-lg font-semibold">Payment methods</h2>
          <p className="text-sm text-gray-600">
            Enable the methods cashiers can accept at checkout. Stripe and SumUp
            are recorded only — payment is taken on the provider&apos;s own
            terminal/app.
          </p>

          <div className="space-y-3">
            {paymentMethods.map((method) => (
              <PaymentMethodRow
                key={method.method_key}
                method={method}
                onSaved={handleMethodSaved}
              />
            ))}
          </div>
        </div>

        <div className="bg-white rounded-xl shadow p-6 space-y-5">
          <div>
            <h2 className="text-lg font-semibold">Happy hour</h2>
            <p className="text-sm text-gray-600 mt-1">
              Pick the days and daily time window when all register prices are
              halved. Times use a 24-hour clock.
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
      </div>
    </>
  );
}
