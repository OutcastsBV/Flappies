'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Role } from '../../lib/types';
import { logout } from '../../lib/auth';
import SupportModal from './SupportModal';

export type AdminTab =
  | 'products'
  | 'transactions'
  | 'users'
  | 'registers'
  | 'config'
  | 'reports'
  | 'audit';

export default function AdminLayout({
  active,
  onChange,
  currentUserRole,
  children,
}: {
  active: AdminTab;
  onChange: (tab: AdminTab) => void;
  currentUserRole: Role;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [showSupport, setShowSupport] = useState(false);

  const tabs: { id: AdminTab; label: string }[] = [
    { id: 'products', label: 'Products' },
    { id: 'transactions', label: 'Transactions' },
    { id: 'registers', label: 'Registers' },
    { id: 'users', label: 'Users' },
    { id: 'reports', label: 'Reports' },
    // Only admins can view/change payment method and happy-hour config.
    ...(currentUserRole === 'admin'
      ? [{ id: 'config' as const, label: 'Config' }]
      : []),
    // Read-only history — visible to both admins and managers.
    { id: 'audit', label: 'Audit' },
  ];

  return (
    <div className="min-h-screen flex bg-gray-100 text-black">
      <aside className="w-64 bg-white border-r p-6 flex flex-col gap-4">
        <div className="space-y-2">
          <h2 className="text-xl font-semibold">Management</h2>
          <button
            type="button"
            onClick={() => router.push('/dashboard')}
            className="w-full bg-black text-white px-3 py-2 rounded text-sm"
          >
            ← Back to register
          </button>
        </div>

        <nav className="space-y-1 flex-1">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => onChange(tab.id)}
              className={`w-full text-left px-3 py-2 rounded ${
                active === tab.id ? 'bg-black text-white' : 'hover:bg-gray-100'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>

        <div className="pt-4 border-t space-y-1">
          <button
            type="button"
            onClick={() => setShowSupport(true)}
            className="w-full text-left px-3 py-2 rounded text-gray-700 hover:bg-gray-100"
          >
            Support / feature request
          </button>
          <button
            type="button"
            onClick={() => void logout()}
            className="w-full text-left px-3 py-2 rounded text-gray-700 hover:bg-gray-100"
          >
            Logout
          </button>
        </div>
      </aside>

      <main className="flex-1 p-8">{children}</main>

      {showSupport && <SupportModal onClose={() => setShowSupport(false)} />}
    </div>
  );
}
