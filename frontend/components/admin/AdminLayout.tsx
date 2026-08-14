'use client';

import { useRouter } from 'next/navigation';

export default function AdminLayout({
  active,
  onChange,
  children,
}: {
  active: 'products' | 'transactions' | 'users' | 'config' | 'reports';
  onChange: (
    tab: 'products' | 'transactions' | 'users' | 'config' | 'reports'
  ) => void;
  children: React.ReactNode;
}) {
  const router = useRouter();

  const tabs = [
    { id: 'products' as const, label: 'Products' },
    { id: 'transactions' as const, label: 'Transactions' },
    { id: 'users' as const, label: 'Users' },
    { id: 'reports' as const, label: 'Reports' },
    { id: 'config' as const, label: 'Config' },
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
            ← Back to shop
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
      </aside>

      <main className="flex-1 p-8">{children}</main>
    </div>
  );
}
