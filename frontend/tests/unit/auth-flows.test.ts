import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('loginWithPassword / logout flows', () => {
  beforeEach(() => {
    vi.resetModules();
    sessionStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('records a session on successful password login', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, expires_in: 1800 }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const { loginWithPassword } = await import('../../lib/auth');
    const { getSessionExpiresAt } = await import('../../lib/session');

    const result = await loginWithPassword('alice', 'secret');

    expect(result.expires_in).toBe(1800);
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/auth/login'),
      expect.objectContaining({ method: 'POST' })
    );
    expect(getSessionExpiresAt()).not.toBeNull();
  });

  it('throws the server error message on failed login', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ error: 'Invalid username or password' }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const { loginWithPassword } = await import('../../lib/auth');

    await expect(loginWithPassword('alice', 'wrong')).rejects.toThrow(
      'Invalid username or password'
    );
  });

  it('logoutLocal clears the session and redirects to /login', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);
    const location = { href: '' };
    vi.stubGlobal('location', location);

    const { logoutLocal } = await import('../../lib/auth');
    const { recordSession, getSessionExpiresAt } = await import(
      '../../lib/session'
    );

    recordSession(3600);
    expect(getSessionExpiresAt()).not.toBeNull();

    await logoutLocal();

    expect(getSessionExpiresAt()).toBeNull();
    expect(location.href).toBe('/login');
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/auth/logout'),
      expect.objectContaining({ method: 'POST' })
    );
  });

  it('logoutLocal is a no-op while a logout is already in progress', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('location', { href: '' });

    const { logoutLocal } = await import('../../lib/auth');

    await Promise.all([logoutLocal(), logoutLocal()]);

    // The guard flag is shared across calls within this module instance,
    // so the second concurrent call should not trigger another fetch.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('logout clears the session and redirects to the ZITADEL end-session URL', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);
    const location = { href: '' };
    vi.stubGlobal('location', location);

    const { logout, getLogoutUrl } = await import('../../lib/auth');
    const { recordSession, getSessionExpiresAt } = await import(
      '../../lib/session'
    );

    recordSession(3600);
    await logout();

    expect(getSessionExpiresAt()).toBeNull();
    expect(location.href).toBe(getLogoutUrl());
  });
});
