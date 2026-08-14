'use client';

import { useState } from 'react';
import { createUser } from '../../lib/api';

export default function CreateUserModal({
  onClose,
  onSaved,
}: {
  onClose: () => void;
  onSaved: () => void;
}) {
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [givenName, setGivenName] = useState('');
  const [familyName, setFamilyName] = useState('');
  const [balance, setBalance] = useState(0);
  const [isActive, setIsActive] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function submit() {
    setSaving(true);
    setError('');

    try {
      await createUser({
        username,
        email,
        password,
        given_name: givenName || undefined,
        family_name: familyName || undefined,
        balance: Number(balance),
        is_active: isActive,
      });
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create user');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-white p-6 rounded-xl w-96 space-y-4 max-h-[90vh] overflow-y-auto">
        <h2 className="text-lg font-semibold">Create user</h2>

        <div>
          <label className="block text-sm font-medium mb-1">Username</label>
          <input
            className="border p-2 w-full rounded"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Email</label>
          <input
            type="email"
            className="border p-2 w-full rounded"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Password</label>
          <input
            type="password"
            className="border p-2 w-full rounded"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            minLength={8}
            required
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium mb-1">First name</label>
            <input
              className="border p-2 w-full rounded"
              value={givenName}
              onChange={(e) => setGivenName(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Last name</label>
            <input
              className="border p-2 w-full rounded"
              value={familyName}
              onChange={(e) => setFamilyName(e.target.value)}
            />
          </div>
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

        {error && <p className="text-sm text-red-600 whitespace-pre-wrap">{error}</p>}

        <div className="flex justify-end gap-3 pt-2">
          <button onClick={onClose} className="text-gray-700" disabled={saving}>
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={saving || !username || !email || password.length < 8}
            className="bg-black text-white px-4 py-2 rounded disabled:opacity-50"
          >
            {saving ? 'Creating…' : 'Create'}
          </button>
        </div>
      </div>
    </div>
  );
}
