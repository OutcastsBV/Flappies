'use client';

import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { logoutLocal } from '../lib/auth';
import {
  getSessionExpiresAt,
  recordSession,
  shouldEndSession,
  touchActivity,
} from '../lib/session';
import { getMe } from '../lib/api';

const PROTECTED_PREFIXES = ['/dashboard', '/admin'];
const ACTIVITY_EVENTS = ['mousedown', 'keydown', 'touchstart', 'scroll', 'click'];
const CHECK_INTERVAL_MS = 15_000;

export function SessionMonitor() {
  const pathname = usePathname();
  const loggingOut = useRef(false);
  const isProtected = PROTECTED_PREFIXES.some((prefix) =>
    pathname?.startsWith(prefix)
  );

  useEffect(() => {
    if (!isProtected) return;

    async function ensureSessionMeta() {
      if (getSessionExpiresAt() !== null) return;

      try {
        await getMe();
        recordSession(3600);
      } catch {
        // 401 redirects via api layer
      }
    }

    function endSession() {
      if (loggingOut.current) return;
      loggingOut.current = true;
      void logoutLocal();
    }

    function checkSession() {
      if (shouldEndSession()) {
        endSession();
      }
    }

    function onActivity() {
      touchActivity();
    }

    function onVisibilityChange() {
      if (document.visibilityState === 'visible') {
        checkSession();
      }
    }

    void ensureSessionMeta();
    touchActivity();

    ACTIVITY_EVENTS.forEach((event) => {
      window.addEventListener(event, onActivity, { passive: true });
    });
    document.addEventListener('visibilitychange', onVisibilityChange);

    checkSession();
    const interval = window.setInterval(checkSession, CHECK_INTERVAL_MS);

    return () => {
      ACTIVITY_EVENTS.forEach((event) => {
        window.removeEventListener(event, onActivity);
      });
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.clearInterval(interval);
    };
  }, [isProtected, pathname]);

  return null;
}
