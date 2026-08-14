'use client';

import { useState } from 'react';
import { updateUser } from '../../lib/api';
import type { User } from '../../lib/types';

export default function UserModal({
  user,
  onClose,
  onSaved,
}: {
  user: User;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [username, setUsername] = useState(user.username);
  const [email, setEmail] = useState(user.email ?? '');
  const [balance, setBalance] = useState(user.balance);
  const [isActive, setIsActive] = useState(user.is_active);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function submit() {
    setSaving(true);
    setError('');

    try {
      await updateUser(user.id, {
        username,
        email,
        balance: Number(balance),
        is_active: isActive,
      });
      onSaved();
    } catch {
      setError('Failed to save user');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-white p-6 rounded-xl w-96 space-y-5">
        <h2 className="text-lg font-semibold">Edit user</h2>

        <div>
          <label className="block text-sm font-medium mb-1">Username</label>
          <input
            className="border p-2 w-full rounded"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Email</label>
          <input
            type="email"
            className="border p-2 w-full rounded"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Balance (€)</label>
          <input
            type="number"
            step="0.01"
            min="0"
            className="border p-2 w-full rounded"
            value={balance}
            onChange={(e) => setBalance(Number(e.target.value))}
          />
        </div>

        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={isActive}
            onChange={(e) => setIsActive(e.target.checked)}
          />
          <span className="text-sm font-medium">Active</span>
        </label>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="flex justify-end gap-3 pt-3">
          <button onClick={onClose} className="text-gray-700" disabled={saving}>
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={saving}
            className="bg-black text-white px-4 py-2 rounded disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}
