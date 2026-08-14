import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { API_BASE_URL } from '../../lib/config';

describe('apiFetch credentials', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('sends credentials and JSON content-type by default', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ id: 1 }),
      text: async () => '',
      headers: new Headers(),
    });
    vi.stubGlobal('fetch', fetchMock);

    const { apiFetch } = await import('../../lib/api');
    await apiFetch(`${API_BASE_URL}/me`, { method: 'GET' });

    expect(fetchMock).toHaveBeenCalledOnce();
    const [, options] = fetchMock.mock.calls[0];
    expect(options.credentials).toBe('include');
  });

  it('does not attach Authorization from localStorage', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({}),
      text: async () => '',
      headers: new Headers(),
    });
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('localStorage', {
      getItem: vi.fn(() => 'should-not-be-used'),
      setItem: vi.fn(),
      clear: vi.fn(),
    });

    const { apiFetch } = await import('../../lib/api');
    await apiFetch(`${API_BASE_URL}/cart`, {
      method: 'POST',
      body: JSON.stringify({ item_id: 1, amount: 1 }),
    });

    const [, options] = fetchMock.mock.calls[0];
    const headers = options.headers as Record<string, string>;
    expect(headers.Authorization).toBeUndefined();
    expect(headers['Content-Type']).toBe('application/json');
  });

  it('logs out locally and throws when a request comes back unauthorized', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({}),
      text: async () => '',
      headers: new Headers(),
    });
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('location', { href: '' });
    sessionStorage.clear();

    const { getMe } = await import('../../lib/api');

    await expect(getMe()).rejects.toThrow('Unauthorized');
    // logoutLocal() also calls fetch to hit /auth/logout
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('rejects with the response body text when the API errors without 401', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({}),
      text: async () => 'boom',
      headers: new Headers(),
    });
    vi.stubGlobal('fetch', fetchMock);

    const { getCart } = await import('../../lib/api');

    await expect(getCart()).rejects.toThrow('boom');
  });
});
