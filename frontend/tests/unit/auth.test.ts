import { describe, expect, it } from 'vitest';
import { getLoginUrl, getLogoutUrl, isAdmin } from '../../lib/auth';

describe('auth helpers', () => {
  it('builds a ZITADEL authorize URL with required params', () => {
    const url = new URL(getLoginUrl());

    expect(url.pathname).toContain('/oauth/v2/authorize');
    expect(url.searchParams.get('response_type')).toBe('code');
    expect(url.searchParams.get('client_id')).toBeTruthy();
    expect(url.searchParams.get('redirect_uri')).toBeTruthy();
    expect(url.searchParams.get('scope')).toContain('openid');
  });

  it('builds a logout URL with post logout redirect', () => {
    const url = new URL(getLogoutUrl());

    expect(url.pathname).toContain('/end_session');
    expect(url.searchParams.get('post_logout_redirect_uri')).toBeTruthy();
  });

  it('detects admin users from groups', () => {
    expect(isAdmin({ groups: ['admin'] })).toBe(true);
    expect(isAdmin({ groups: ['user'] })).toBe(false);
    expect(isAdmin(null)).toBe(false);
  });
});
