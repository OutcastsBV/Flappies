import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import AuditPanel from '../../components/admin/AuditPanel';
import { getAuditLog } from '../../lib/api';
import type { AuditLogEntry } from '../../lib/types';

vi.mock('../../lib/api', () => ({
  getAuditLog: vi.fn(),
}));

const entries: AuditLogEntry[] = [
  {
    id: 1,
    actor_user_id: 2,
    actor_username: 'amy',
    action: 'register.open',
    entity_type: 'register_session',
    entity_id: '7',
    details: { starting_amount: 20 },
    created_at: '2026-01-01T10:00:00.000Z',
  },
  {
    id: 2,
    actor_user_id: 3,
    actor_username: 'ben',
    action: 'config.update',
    entity_type: 'shop_config',
    entity_id: null,
    details: {},
    created_at: '2026-01-01T11:00:00.000Z',
  },
];

describe('AuditPanel', () => {
  beforeEach(() => {
    vi.mocked(getAuditLog).mockReset();
  });

  it('shows a loading state, then renders entries once loaded', async () => {
    vi.mocked(getAuditLog).mockResolvedValue(entries);

    render(<AuditPanel />);

    expect(screen.getByText('Loading audit log…')).toBeInTheDocument();

    expect(await screen.findByText('amy')).toBeInTheDocument();
    expect(screen.getByText('ben')).toBeInTheDocument();
    expect(screen.getByRole('cell', { name: 'register.open' })).toBeInTheDocument();
    expect(screen.getByText('starting_amount: 20')).toBeInTheDocument();
  });

  it('shows a placeholder when there are no entries', async () => {
    vi.mocked(getAuditLog).mockResolvedValue([]);

    render(<AuditPanel />);

    expect(await screen.findByText('No audit entries found.')).toBeInTheDocument();
  });

  it('renders a dash for entries with no details or entity id', async () => {
    vi.mocked(getAuditLog).mockResolvedValue([entries[1]]);

    render(<AuditPanel />);

    expect(await screen.findByText('shop_config')).toBeInTheDocument();
    expect(screen.getByText('—')).toBeInTheDocument();
  });

  it('re-fetches filtered by action when the dropdown changes', async () => {
    vi.mocked(getAuditLog).mockResolvedValue(entries);

    render(<AuditPanel />);
    await waitFor(() => expect(getAuditLog).toHaveBeenCalledWith(undefined));

    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'config.update' } });

    await waitFor(() =>
      expect(getAuditLog).toHaveBeenCalledWith({ action: 'config.update' })
    );
  });

  it('exposes no edit, delete, or create controls anywhere', async () => {
    vi.mocked(getAuditLog).mockResolvedValue(entries);

    render(<AuditPanel />);
    await screen.findByText('amy');

    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    // The action filter dropdown listing e.g. "user.create" is fine; there
    // must simply be no interactive control that mutates audit history.
    expect(document.querySelectorAll('input, textarea')).toHaveLength(0);
  });
});
