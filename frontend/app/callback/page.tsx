'use client';

import { Suspense, useEffect } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { API_BASE_URL } from '../../lib/config';
import { recordSession } from '../../lib/session';

function CallbackContent() {
  const params = useSearchParams();
  const router = useRouter();

  useEffect(() => {
    const code = params.get('code');
    if (!code) {
      router.push('/login');
      return;
    }

    fetch(`${API_BASE_URL}/auth/callback`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code }),
    })
      .then(async (res) => {
        if (!res.ok) {
          router.push('/login');
          return;
        }
        const data = await res.json();
        if (data.ok) {
          if (typeof data.expires_in === 'number') {
            recordSession(data.expires_in);
          }
          router.push('/dashboard');
        } else {
          router.push('/login');
        }
      })
      .catch(() => {
        router.push('/login');
      });
  }, [params, router]);

  return <p className="p-8">Signing you in…</p>;
}

export default function CallbackPage() {
  return (
    <Suspense fallback={<p className="p-8">Signing you in…</p>}>
      <CallbackContent />
    </Suspense>
  );
}
