'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import AdminLayout, { type AdminTab } from '../../components/admin/AdminLayout';
import ProductsPanel from '../../components/admin/ProductsPanel';
import TransactionsPanel from '../../components/admin/TransactionsPanel';
import UserlistPanel from '../../components/admin/UserlistPanel';
import ConfigPanel from '../../components/admin/ConfigPanel';
import ReportsPanel from '../../components/admin/ReportsPanel';
import RegistersPanel from '../../components/admin/RegistersPanel';
import AuditPanel from '../../components/admin/AuditPanel';
import { getMe, getMyDetails } from '../../lib/api';
import { isManagerOrAdmin } from '../../lib/auth';
import type { Role } from '../../lib/types';

export default function AdminPage() {
  const router = useRouter();
  const [tab, setTab] = useState<AdminTab>('products');
  const [role, setRole] = useState<Role | null>(null);

  useEffect(() => {
    async function check() {
      try {
        const [me, details] = await Promise.all([getMe(), getMyDetails()]);
        if (!isManagerOrAdmin(me)) {
          router.push('/dashboard');
          return;
        }
        setRole(details.role);
      } catch {
        router.push('/login');
      }
    }
    check();
  }, [router]);

  if (!role) {
    return <p className="p-8">Loading…</p>;
  }

  return (
    <AdminLayout active={tab} onChange={setTab} currentUserRole={role}>
      {tab === 'products' && <ProductsPanel />}
      {tab === 'transactions' && <TransactionsPanel />}
      {tab === 'registers' && <RegistersPanel />}
      {tab === 'users' && <UserlistPanel currentUserRole={role} />}
      {tab === 'config' && role === 'admin' && <ConfigPanel />}
      {tab === 'reports' && <ReportsPanel />}
      {tab === 'audit' && <AuditPanel />}
    </AdminLayout>
  );
}
