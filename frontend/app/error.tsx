'use client';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-8">
      <h1 className="text-2xl font-semibold">Something went wrong</h1>
      <p className="text-sm text-neutral-600">{error.message}</p>
      <button
        type="button"
        onClick={reset}
        className="rounded bg-neutral-900 px-4 py-2 text-white"
      >
        Try again
      </button>
    </main>
  );
}
