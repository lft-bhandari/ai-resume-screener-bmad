import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useAnalysisStream } from '@/hooks/useAnalysisStream';
import { ScoreCard } from './ScoreCard';
import { ReasoningCallout } from './ReasoningCallout';
import { KeywordChips } from './KeywordChips';
import { StreamingProgressIndicator } from './StreamingProgressIndicator';
import { ShortlistToggle } from './ShortlistToggle';

interface StreamingAnalysisViewProps {
  analysisId: number;
  candidateName: string;
  token: string;
}

export function StreamingAnalysisView({
  analysisId,
  candidateName,
  token,
}: StreamingAnalysisViewProps) {
  const { state, retry } = useAnalysisStream(analysisId, token);
  const { phase, result, errorMessage } = state;

  // Auto-scroll: each section ref scrolls into view when its phase becomes active
  const scoresRef = useRef<HTMLDivElement>(null);
  const keywordsRef = useRef<HTMLDivElement>(null);
  const jdMatchRef = useRef<HTMLDivElement>(null);
  const reasoningRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const refMap: Record<string, React.RefObject<HTMLDivElement | null>> = {
      scores: scoresRef,
      keywords: keywordsRef,
      jd_match: jdMatchRef,
      reasoning: reasoningRef,
    };
    const ref = refMap[phase];
    if (ref?.current) {
      ref.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [phase]);

  const isComplete = phase === 'complete';
  const isError = phase === 'error';

  const queryClient = useQueryClient();
  useEffect(() => {
    if (isComplete) {
      void queryClient.invalidateQueries({ queryKey: ['analyses'] });
    }
  }, [isComplete, queryClient]);

  const [showErrorToast, setShowErrorToast] = useState(false);
  useEffect(() => {
    setShowErrorToast(isError);
  }, [isError]);

  return (
    <div className="mx-auto max-w-[960px] space-y-6 p-8">
      {/* Candidate header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-text-primary">{candidateName}</h2>
          <p className="text-sm text-text-secondary">Analysis #{analysisId}</p>
        </div>
        <div className="flex items-center gap-3">
          {/* ShortlistToggle becomes focal point on complete via ring highlight */}
          <div
            className={
              isComplete
                ? 'ring-2 ring-[#038E43] ring-offset-2 rounded-lg'
                : ''
            }
          >
            <ShortlistToggle analysisId={analysisId} />
          </div>
          {isComplete && (
            <button
              type="button"
              disabled
              title="Note functionality available in Story 5.1"
              className="inline-flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-1.5 text-sm font-medium text-text-secondary disabled:opacity-60"
            >
              Add Note
            </button>
          )}
        </div>
      </div>

      {/* Progress indicator */}
      <StreamingProgressIndicator phase={phase} />

      {/* Streaming content — aria-live for screen reader support (AC: #7, UX-DR15) */}
      <div
        aria-live="polite"
        aria-label="Analysis results"
        className="space-y-6"
      >
        {/* Score cards — 2-column grid */}
        <div ref={scoresRef} className="grid grid-cols-2 gap-4">
          <ScoreCard
            score={result?.score ?? null}
            label="Overall Fit"
            loading={
              result?.score === undefined &&
              phase !== 'complete' &&
              phase !== 'error'
            }
          />
          <ScoreCard
            score={result?.ats_score ?? null}
            label="ATS Score"
            sublabel="ATS compatibility"
            loading={
              result?.ats_score === undefined &&
              phase !== 'complete' &&
              phase !== 'error'
            }
          />
        </div>

        {/* Keyword chips */}
        <div ref={keywordsRef}>
          <KeywordChips
            matched={result?.matched_keywords ?? []}
            missing={result?.missing_keywords ?? []}
            loading={
              !result?.matched_keywords &&
              (phase === 'keywords' || phase === 'connecting')
            }
          />
        </div>

        {/* JD match table */}
        <div ref={jdMatchRef}>
          {result?.jd_match && result.jd_match.length > 0 ? (
            <div className="overflow-hidden rounded-lg border border-border">
              <table className="w-full text-sm">
                <thead className="bg-surface">
                  <tr>
                    <th className="px-4 py-2 text-left font-medium text-text-secondary">
                      Skill
                    </th>
                    <th className="px-4 py-2 text-left font-medium text-text-secondary">
                      Present
                    </th>
                    <th className="px-4 py-2 text-left font-medium text-text-secondary">
                      Evidence
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {result.jd_match.map((item) => (
                    <tr key={item.skill}>
                      <td className="px-4 py-2 font-medium text-text-primary">
                        {item.skill}
                      </td>
                      <td className="px-4 py-2">
                        <span
                          className={
                            item.present ? 'text-[#038E43]' : 'text-[#b45309]'
                          }
                        >
                          {item.present ? '✓ Yes' : '✗ No'}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-text-secondary">
                        {item.evidence ?? '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            phase === 'jd_match' && (
              <div
                className="h-20 animate-pulse rounded-lg bg-surface"
                aria-hidden="true"
              />
            )
          )}
        </div>

        {/* Reasoning callout */}
        <div ref={reasoningRef}>
          {(state.reasoningBuffer || result?.reasoning || phase === 'reasoning') && (
            <ReasoningCallout
              text={state.reasoningBuffer || result?.reasoning || ''}
              streaming={phase === 'reasoning'}
            />
          )}
        </div>

        {/* Complete — action focal point */}
        {isComplete && (
          <div className="flex items-center gap-4 pt-2">
            <Link
              to="/history"
              className="text-sm text-[#038E43] underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#038E43]"
            >
              View in History →
            </Link>
          </div>
        )}
      </div>

      {/* Amber error toast with retry CTA (AC: #5) */}
      {showErrorToast && (
        <div
          role="alert"
          className="fixed bottom-4 right-4 z-50 flex items-center gap-3 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 shadow-md"
        >
          <span className="text-sm font-medium text-amber-800">
            {errorMessage ?? "Analysis couldn't complete. Try again?"}
          </span>
          <button
            type="button"
            onClick={retry}
            className="text-sm font-semibold text-amber-900 underline underline-offset-2 hover:no-underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#038E43]"
          >
            Retry
          </button>
          <button
            type="button"
            onClick={() => setShowErrorToast(false)}
            className="ml-1 text-amber-600 hover:text-amber-800 focus-visible:outline-none"
            aria-label="Dismiss error"
          >
            ✕
          </button>
        </div>
      )}
    </div>
  );
}
