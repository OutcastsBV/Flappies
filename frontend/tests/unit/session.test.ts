import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  clearSession,
  getLastActivity,
  getSessionExpiresAt,
  isIdleExpired,
  isSessionExpired,
  recordSession,
  shouldEndSession,
  touchActivity,
} from '../../lib/session';

describe('session', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T12:00:00Z'));
    sessionStorage.clear();
  });

  it('records absolute expiry from expires_in', () => {
    recordSession(3600);
    expect(getSessionExpiresAt()).toBe(Date.now() + 3600 * 1000);
    expect(getLastActivity()).toBe(Date.now());
  });

  it('detects absolute session expiry', () => {
    recordSession(60);
    expect(isSessionExpired()).toBe(false);
    vi.advanceTimersByTime(61_000);
    expect(isSessionExpired()).toBe(true);
  });

  it('detects idle expiry after inactivity', () => {
    recordSession(3600);
    touchActivity();
    vi.advanceTimersByTime(301_000);
    expect(isIdleExpired()).toBe(true);
    expect(shouldEndSession()).toBe(true);
  });

  it('resets idle timer on activity', () => {
    recordSession(3600);
    vi.advanceTimersByTime(200_000);
    touchActivity();
    vi.advanceTimersByTime(200_000);
    expect(isIdleExpired()).toBe(false);
  });

  it('clears stored session metadata', () => {
    recordSession(3600);
    clearSession();
    expect(getSessionExpiresAt()).toBeNull();
    expect(getLastActivity()).toBeNull();
  });
});
