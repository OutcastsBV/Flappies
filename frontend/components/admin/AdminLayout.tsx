'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Role } from '../../lib/types';
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
      <aside className="w-64 bg-white border-r p-6 space-y-4">
        <div className="space-y-2">
          <h2 className="text-xl font-semibold">Admin</h2>
          <button
            type="button"
            onClick={() => router.push('/dashboard')}
            className="text-sm text-gray-600 hover:text-black"
          >
            ← Back to register
          </button>
        </div>

        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => onChange(tab.id)}
            className={`w-full text-left px-3 py-2 rounded ${
              active === tab.id ? 'bg-black text-white' : 'hover:bg-gray-100'
            }`}
          >
            {tab.label}
          </button>
        ))}

        <div className="pt-4 border-t">
          <button
            type="button"
            onClick={() => setShowSupport(true)}
            className="w-full text-left px-3 py-2 rounded text-gray-700 hover:bg-gray-100"
          >
            Support / feature request
          </button>
        </div>
      </aside>

      <main className="flex-1 p-8">{children}</main>

      {showSupport && <SupportModal onClose={() => setShowSupport(false)} />}
    </div>
  );
}
