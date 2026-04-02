import { useState, useEffect, useRef } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { toggleShortlistApi } from '@/api/candidates';

interface ShortlistToggleProps {
  analysisId: number;
  isShortlisted?: boolean;
  readOnly?: boolean;
}

export function ShortlistToggle({
  analysisId,
  isShortlisted = false,
  readOnly = false,
}: ShortlistToggleProps) {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  // Local optimistic state — mirrors prop, flips instantly on click
  const [optimistic, setOptimistic] = useState(isShortlisted);
  // Amber error toast
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Clear toast timer on unmount to prevent setState on unmounted component
  useEffect(() => {
    return () => {
      if (toastTimerRef.current !== null) clearTimeout(toastTimerRef.current);
    };
  }, []);

  // Sync optimistic state if parent re-renders with a new value
  // (e.g. after query invalidation refreshes the list)
  useEffect(() => {
    setOptimistic(isShortlisted);
  }, [isShortlisted]);

  const mutation = useMutation({
    mutationFn: (newValue: boolean) =>
      toggleShortlistApi(user!.token, analysisId, newValue),
    onMutate: (newValue) => {
      // Flip optimistic state immediately — no server round-trip wait
      setOptimistic(newValue);
      return { previousValue: !newValue }; // rollback context
    },
    onSuccess: () => {
      // Invalidate list + detail queries so they re-fetch confirmed state
      void queryClient.invalidateQueries({ queryKey: ['analyses'] });
    },
    onError: (_error, _newValue, context) => {
      // Revert to the pre-click value
      if (context) {
        setOptimistic(context.previousValue);
      }
      // Show amber error toast
      const msg =
        _error instanceof Error
          ? _error.message
          : 'Could not update shortlist status. Please try again.';
      setErrorMessage(msg);
      toastTimerRef.current = setTimeout(() => setErrorMessage(null), 3000);
    },
  });

  const handleClick = () => {
    if (!user || mutation.isPending || readOnly) return;
    mutation.mutate(!optimistic);
  };

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        disabled={mutation.isPending || readOnly}
        aria-label={
          readOnly
            ? 'Shortlist status (read-only)'
            : optimistic
              ? 'Remove from shortlist'
              : 'Shortlist candidate'
        }
        aria-pressed={optimistic}
        className={[
          'inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors',
          'disabled:pointer-events-none disabled:opacity-60',
          optimistic
            ? 'bg-[#038E43] text-white border-transparent'
            : 'border-border bg-background text-text-secondary hover:border-[#038E43] hover:text-[#038E43]',
        ].join(' ')}
      >
        {optimistic ? '★ Shortlisted' : 'Shortlist'}
      </button>

      {/* Amber error toast — consistent with StreamingAnalysisView.tsx pattern */}
      {errorMessage && (
        <div
          role="alert"
          className="fixed bottom-4 right-4 z-50 flex items-center gap-3 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 shadow-md"
        >
          <span className="text-sm font-medium text-amber-800">{errorMessage}</span>
          <button
            type="button"
            onClick={() => setErrorMessage(null)}
            className="ml-1 text-amber-600 hover:text-amber-800 focus-visible:outline-none"
            aria-label="Dismiss error"
          >
            ✕
          </button>
        </div>
      )}
    </>
  );
}
