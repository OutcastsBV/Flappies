import { describe, it, expect } from 'vitest';
import { isAdmin, getLoginUrl, getLogoutUrl } from '../lib/auth';

describe('isAdmin', () => {
  it('returns true when user has admin group', () => {
    expect(isAdmin({ groups: ['user', 'admin'] })).toBe(true);
  });

  it('returns false for non-admin users', () => {
    expect(isAdmin({ groups: ['user'] })).toBe(false);
    expect(isAdmin(null)).toBe(false);
    expect(isAdmin({})).toBe(false);
  });
});

describe('auth URLs', () => {
  it('builds a ZITADEL authorize URL', () => {
    const url = getLoginUrl();
    expect(url).toContain('http://localhost:8080/oauth/v2/authorize?');
    expect(url).toContain('client_id=flappies');
    expect(url).toContain('response_type=code');
    expect(url).toContain(encodeURIComponent('http://localhost:3002/callback'));
  });

  it('builds a ZITADEL end-session URL', () => {
    const url = getLogoutUrl();
    expect(url).toContain('http://localhost:8080/oidc/v1/end_session?');
    expect(url).toContain(
      encodeURIComponent('http://localhost:3002/')
    );
  });
});
