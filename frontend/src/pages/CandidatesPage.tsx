import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { getAnalysisDetailApi, listAnalysesApi } from '@/api/analyses';
import { CandidateDetailView } from '@/components/candidates/CandidateDetailView';
import type { AnalysisListResponse } from '@/types/analysis';

const EMPTY_LIST: AnalysisListResponse = { items: [], total: 0 };

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
}

function ScoreBadge({ score }: { score: number | null }) {
  if (score === null)
    return <span className="text-text-secondary text-sm">—</span>;
  const colour =
    score >= 70
      ? 'text-[#038E43]'
      : score >= 40
        ? 'text-[#b45309]'
        : 'text-[#404040]';
  return (
    <span className={`font-semibold text-sm ${colour}`}>
      {score.toFixed(0)}
    </span>
  );
}

export function CandidatesPage() {
  const { user } = useAuth();
  const [selectedAnalysisId, setSelectedAnalysisId] = useState<number | null>(
    null,
  );

  // Fetch ONLY shortlisted candidates — interviewer view
  const listQuery = useQuery({
    queryKey: ['shortlisted-candidates'],
    queryFn: () => listAnalysesApi(user!.token, true),
    enabled: !!user,
  });

  // Detail query — only active when a candidate row is clicked
  const detailQuery = useQuery({
    queryKey: ['analyses', selectedAnalysisId],
    queryFn: () => getAnalysisDetailApi(user!.token, selectedAnalysisId!),
    enabled: !!user && selectedAnalysisId !== null,
  });

  // ── Detail view ────────────────────────────────────────────────────────
  if (selectedAnalysisId !== null) {
    if (detailQuery.isLoading) {
      return (
        <div className="p-6 max-w-[960px] mx-auto">
          <button
            onClick={() => setSelectedAnalysisId(null)}
            className="mb-6 flex items-center gap-1 text-sm text-text-secondary hover:text-[#038E43] transition-colors"
          >
            ← Back to Candidates
          </button>
          <div className="space-y-4">
            <div className="h-8 w-48 animate-pulse rounded bg-surface" />
            <div className="grid grid-cols-2 gap-4">
              <div className="h-32 animate-pulse rounded-lg bg-surface" />
              <div className="h-32 animate-pulse rounded-lg bg-surface" />
            </div>
            <div className="h-24 animate-pulse rounded-lg bg-surface" />
          </div>
        </div>
      );
    }

    if (detailQuery.isError || !detailQuery.data) {
      return (
        <div className="p-6 max-w-[960px] mx-auto">
          <button
            onClick={() => setSelectedAnalysisId(null)}
            className="mb-6 flex items-center gap-1 text-sm text-text-secondary hover:text-[#038E43] transition-colors"
          >
            ← Back to Candidates
          </button>
          <p className="text-text-secondary">
            Failed to load candidate briefing.{' '}
            <button
              onClick={() => void detailQuery.refetch()}
              className="text-[#038E43] underline-offset-2 hover:underline"
            >
              Try again
            </button>
          </p>
        </div>
      );
    }

    return (
      <CandidateDetailView
        analysis={detailQuery.data}
        onBack={() => setSelectedAnalysisId(null)}
        readOnly={true}
        onBackLabel="← Back to Candidates"
      />
    );
  }

  // ── List view ──────────────────────────────────────────────────────────
  if (listQuery.isError) {
    return (
      <div className="p-6 max-w-[960px] mx-auto">
        <h1 className="text-2xl font-bold text-text-primary mb-6">Candidates</h1>
        <p className="text-sm text-red-600">
          Failed to load candidates. Please refresh the page.
        </p>
      </div>
    );
  }

  const data = listQuery.data ?? EMPTY_LIST;
  const isLoading = listQuery.isLoading;

  return (
    <div className="p-6 max-w-[960px] mx-auto">
      <h1 className="text-2xl font-bold text-text-primary mb-6">Candidates</h1>

      <div className="rounded-lg border border-border overflow-hidden">
        <table className="w-full">
          <thead className="bg-surface text-text-secondary text-xs uppercase">
            <tr>
              <th className="px-4 py-3 text-left">Candidate</th>
              <th className="px-4 py-3 text-left">JD</th>
              <th className="px-4 py-3 text-left">Score</th>
              <th className="px-4 py-3 text-left">Date</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border bg-background">
            {/* Skeleton loading rows */}
            {isLoading &&
              Array.from({ length: 4 }).map((_, i) => (
                <tr key={i}>
                  {[1, 2, 3, 4].map((j) => (
                    <td key={j} className="px-4 py-3">
                      <div className="h-4 animate-pulse rounded bg-surface w-24" />
                    </td>
                  ))}
                </tr>
              ))}

            {/* Empty state */}
            {!isLoading && data.items.length === 0 && (
              <tr>
                <td
                  colSpan={4}
                  className="px-4 py-12 text-center text-text-secondary"
                >
                  No candidates shortlisted yet.
                </td>
              </tr>
            )}

            {/* Data rows */}
            {!isLoading &&
              data.items.map((item) => (
                <tr
                  key={item.id}
                  onClick={() => setSelectedAnalysisId(item.id)}
                  className="hover:bg-surface/50 cursor-pointer transition-colors"
                >
                  {/* Candidate — avatar initials + name */}
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div
                        className="h-8 w-8 rounded-full bg-[#038E43]/15 flex items-center justify-center flex-shrink-0"
                        aria-hidden="true"
                      >
                        <span className="text-[#038E43] text-xs font-semibold">
                          {getInitials(item.candidate_name)}
                        </span>
                      </div>
                      <span className="text-sm font-medium text-text-primary">
                        {item.candidate_name}
                      </span>
                    </div>
                  </td>

                  {/* JD badge */}
                  <td className="px-4 py-3">
                    {item.jd_title ? (
                      <span className="inline-flex items-center rounded-full bg-surface px-2 py-0.5 text-xs font-medium text-text-secondary border border-border">
                        {item.jd_title}
                      </span>
                    ) : (
                      <span className="text-text-secondary text-sm">—</span>
                    )}
                  </td>

                  {/* Score badge */}
                  <td className="px-4 py-3">
                    <ScoreBadge score={item.score} />
                  </td>

                  {/* Date */}
                  <td className="px-4 py-3 text-sm text-text-secondary">
                    {new Date(item.created_at).toLocaleDateString('en-US', {
                      year: 'numeric',
                      month: 'short',
                      day: 'numeric',
                    })}
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
