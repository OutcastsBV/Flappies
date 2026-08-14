'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import AdminLayout from '../../components/admin/AdminLayout';
import ProductsPanel from '../../components/admin/ProductsPanel';
import TransactionsPanel from '../../components/admin/TransactionsPanel';
import UserlistPanel from '../../components/admin/UserlistPanel';
import ConfigPanel from '../../components/admin/ConfigPanel';
import ReportsPanel from '../../components/admin/ReportsPanel';
import { getMe } from '../../lib/api';
import { isAdmin } from '../../lib/auth';

type Tab = 'products' | 'transactions' | 'users' | 'config' | 'reports';

export default function AdminPage() {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>('products');
  const [ready, setReady] = useState(false);

  useEffect(() => {
    async function check() {
      try {
        const user = await getMe();
        if (!isAdmin(user)) {
          router.push('/dashboard');
          return;
        }
        setReady(true);
      } catch {
        router.push('/login');
      }
    }
    check();
  }, [router]);

  if (!ready) {
    return <p className="p-8">Loading…</p>;
  }

  return (
    <AdminLayout active={tab} onChange={setTab}>
      {tab === 'products' && <ProductsPanel />}
      {tab === 'transactions' && <TransactionsPanel />}
      {tab === 'users' && <UserlistPanel />}
      {tab === 'config' && <ConfigPanel />}
      {tab === 'reports' && <ReportsPanel />}
    </AdminLayout>
  );
}
