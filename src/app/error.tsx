"use client";

import { useEffect } from "react";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log to console but sanitize — never expose stack traces to users
    console.error("App error boundary caught:", error.message);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 p-8">
      <div className="text-6xl">🏁</div>
      <h2 className="text-xl font-bold text-neutral-100">
        Something went wrong
      </h2>
      <p className="max-w-md text-center text-sm text-neutral-400">
        We hit a wall — the data couldn&apos;t load. This is usually temporary.
      </p>
      <button
        onClick={reset}
        className="rounded-lg bg-red-600 px-6 py-2 text-sm font-medium text-white transition hover:bg-red-500"
      >
        Try Again
      </button>
    </div>
  );
}
