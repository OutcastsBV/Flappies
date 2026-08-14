'use client';

import { useEffect, useState } from 'react';
import { getUsers } from '../../lib/api';
import type { Role, User } from '../../lib/types';
import UserModal from './UserModal';
import CreateUserModal from './CreateUserModal';

export default function UserlistPanel({
  currentUserRole,
}: {
  currentUserRole: Role;
}) {
  const [users, setUsers] = useState<User[]>([]);
  const [editing, setEditing] = useState<User | null>(null);
  const [creating, setCreating] = useState(false);

  async function reloadUsers() {
    setUsers(await getUsers());
  }

  useEffect(() => {
    let cancelled = false;

    getUsers().then((data) => {
      if (!cancelled) {
        setUsers(data);
      }
    });

    return () => {
      cancelled = true;
    };
  }, []);

  const canEdit = (user: User) =>
    currentUserRole === 'admin' || user.role === 'cashier';

  return (
    <>
      <div className="mb-6 flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold">Users</h1>
        <button
          onClick={() => setCreating(true)}
          className="bg-black text-white px-4 py-2 rounded text-sm"
        >
          Create user
        </button>
      </div>

      <table className="w-full bg-white rounded shadow text-sm">
        <thead>
          <tr className="border-b">
            <th className="p-3 text-left">Username</th>
            <th className="p-3 text-left">Role</th>
            <th className="p-3 text-left">Email</th>
            <th className="p-3 text-left">Active</th>
            <th className="p-3"></th>
          </tr>
        </thead>
        <tbody>
          {users.map((user) => (
            <tr key={user.id} className="border-b">
              <td className="p-3">{user.username}</td>
              <td className="p-3 capitalize">{user.role}</td>
              <td className="p-3">{user.email}</td>
              <td className="p-3">{user.is_active ? 'Yes' : 'No'}</td>
              <td className="p-3">
                {canEdit(user) && (
                  <button
                    onClick={() => setEditing(user)}
                    className="text-blue-600"
                  >
                    Edit
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {editing && (
        <UserModal
          user={editing}
          currentUserRole={currentUserRole}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            reloadUsers();
          }}
        />
      )}

      {creating && (
        <CreateUserModal
          currentUserRole={currentUserRole}
          onClose={() => setCreating(false)}
          onSaved={() => {
            setCreating(false);
            reloadUsers();
          }}
        />
      )}
    </>
  );
}
