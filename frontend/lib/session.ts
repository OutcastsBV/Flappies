const SESSION_EXPIRES_KEY = 'kassa_session_expires_at';
const SESSION_LAST_ACTIVITY_KEY = 'kassa_session_last_activity';

/** Idle timeout before auto-logout (default 5 minutes). */
export const SESSION_IDLE_MS =
  Math.max(30, Number(process.env.NEXT_PUBLIC_SESSION_IDLE_SECONDS || 300)) *
  1000;

export function recordSession(expiresInSeconds: number) {
  const ttl = Math.max(1, Number(expiresInSeconds) || 3600);
  sessionStorage.setItem(SESSION_EXPIRES_KEY, String(Date.now() + ttl * 1000));
  touchActivity();
}

export function touchActivity() {
  sessionStorage.setItem(SESSION_LAST_ACTIVITY_KEY, String(Date.now()));
}

export function clearSession() {
  sessionStorage.removeItem(SESSION_EXPIRES_KEY);
  sessionStorage.removeItem(SESSION_LAST_ACTIVITY_KEY);
}

export function getSessionExpiresAt(): number | null {
  const raw = sessionStorage.getItem(SESSION_EXPIRES_KEY);
  if (!raw) return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

export function getLastActivity(): number | null {
  const raw = sessionStorage.getItem(SESSION_LAST_ACTIVITY_KEY);
  if (!raw) return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

export function isSessionExpired(now = Date.now()): boolean {
  const expiresAt = getSessionExpiresAt();
  return expiresAt !== null && now >= expiresAt;
}

export function isIdleExpired(now = Date.now()): boolean {
  const lastActivity = getLastActivity();
  if (lastActivity === null) return false;
  return now - lastActivity >= SESSION_IDLE_MS;
}

export function shouldEndSession(now = Date.now()): boolean {
  return isSessionExpired(now) || isIdleExpired(now);
}
