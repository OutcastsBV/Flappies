import { ZITADEL, API_BASE_URL } from './config';
import { clearSession, recordSession } from './session';

export function getLoginUrl() {
  const params = new URLSearchParams({
    client_id: ZITADEL.clientId,
    response_type: 'code',
    redirect_uri: ZITADEL.redirectUri,
    scope: 'openid profile email urn:zitadel:iam:org:project:roles',
    prompt: 'login',
  });

  return `${ZITADEL.issuer}/oauth/v2/authorize?${params.toString()}`;
}

export function getLogoutUrl() {
  const params = new URLSearchParams({
    post_logout_redirect_uri: ZITADEL.postLogoutRedirectUri,
  });

  return `${ZITADEL.issuer}/oidc/v1/end_session?${params.toString()}`;
}

export async function loginWithPassword(username: string, password: string) {
  const res = await fetch(`${API_BASE_URL}/auth/login`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || 'Login failed');
  }

  const data = await res.json();
  if (typeof data.expires_in === 'number') {
    recordSession(data.expires_in);
  }

  return data;
}

/** Clear app session and return to login (no IdP redirect). */
let localLogoutInProgress = false;

export async function logoutLocal() {
  if (localLogoutInProgress) return;
  localLogoutInProgress = true;
  clearSession();
  try {
    await fetch(`${API_BASE_URL}/auth/logout`, {
      method: 'POST',
      credentials: 'include',
    });
  } catch {
    // cookie may already be gone
  }
  window.location.href = '/login';
}

export async function logout() {
  clearSession();
  try {
    await fetch(`${API_BASE_URL}/auth/logout`, {
      method: 'POST',
      credentials: 'include',
    });
  } catch {
    // continue to IdP logout even if cookie clear fails
  }
  window.location.href = getLogoutUrl();
}

export function isAdmin(user: { groups?: string[] } | null) {
  return user?.groups?.includes('admin') ?? false;
}

export function isManagerOrAdmin(user: { groups?: string[] } | null) {
  return (
    (user?.groups?.includes('admin') || user?.groups?.includes('manager')) ??
    false
  );
}
