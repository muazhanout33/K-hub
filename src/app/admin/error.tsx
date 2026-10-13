'use client';

import { Button } from '@/components/ui/button';

/**
 * Route-level error boundary for the /admin segment.
 * `reset()` re-renders the segment, which remounts the page and re-runs its
 * data fetch — a genuine retry of the failed request.
 */
export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center gap-4 px-4">
      <p className="text-sm text-red-500" role="alert">
        {error.message || 'Something went wrong loading the admin dashboard.'}
      </p>
      <Button type="button" variant="secondary" size="sm" onClick={reset}>
        Try again
      </Button>
    </div>
  );
}
