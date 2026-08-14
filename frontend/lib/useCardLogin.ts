'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { API_BASE_URL } from './config';
import { recordSession } from './session';

export function useCardLogin() {
  const router = useRouter();
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    const wsUrl = API_BASE_URL.replace(/^http/, 'ws') + '/ws/rfid';
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      console.log('WS connected (card login)');
    };

    ws.onmessage = async (event) => {
      try {
        const data = JSON.parse(event.data);

        if (data.type === 'card-login' && data.code) {
          const res = await fetch(`${API_BASE_URL}/auth/rfid-exchange`, {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ code: data.code }),
          });

          if (res.ok) {
            const data = await res.json().catch(() => ({}));
            if (typeof data.expires_in === 'number') {
              recordSession(data.expires_in);
            }
            router.push('/dashboard');
          } else {
            alert('Card login failed');
          }
        }

        if (data.type === 'card-error') {
          alert('Unknown card');
        }
      } catch (err) {
        console.error('WS message error', err);
      }
    };

    ws.onerror = (err) => {
      console.error('WS error', err);
    };

    ws.onclose = () => {
      console.log('WS closed');
    };

    return () => ws.close();
  }, [router]);
}
