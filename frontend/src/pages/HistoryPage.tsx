import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { getAnalysisDetailApi, listAnalysesApi } from '@/api/analyses';
import { CandidateDetailView } from '@/components/candidates/CandidateDetailView';
import { CandidateHistoryTable } from '@/components/candidates/CandidateHistoryTable';
import type { AnalysisListResponse } from '@/types/analysis';

const EMPTY_LIST: AnalysisListResponse = { items: [], total: 0 };

export function HistoryPage() {
  const { user } = useAuth();
  const [selectedAnalysisId, setSelectedAnalysisId] = useState<number | null>(
    null,
  );

  // List query — always active for authenticated users
  const listQuery = useQuery({
    queryKey: ['analyses'],
    queryFn: () => listAnalysesApi(user!.token),
    enabled: !!user,
  });

  // Detail query — only fetches when a row is selected
  const detailQuery = useQuery({
    queryKey: ['analyses', selectedAnalysisId],
    queryFn: () => getAnalysisDetailApi(user!.token, selectedAnalysisId!),
    enabled: !!user && selectedAnalysisId !== null,
  });

  if (selectedAnalysisId !== null) {
    if (detailQuery.isLoading) {
      return (
        <div className="p-6 max-w-[960px] mx-auto">
          <button
            onClick={() => setSelectedAnalysisId(null)}
            className="mb-6 flex items-center gap-1 text-sm text-text-secondary hover:text-[#038E43] transition-colors"
          >
            ← Back to History
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
            ← Back to History
          </button>
          <p className="text-text-secondary">
            Failed to load analysis.{' '}
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
      />
    );
  }

  // Default: table view
  if (listQuery.isError) {
    return (
      <div className="p-6 max-w-[960px] mx-auto">
        <h1 className="text-2xl font-bold text-text-primary mb-6">History</h1>
        <p className="text-sm text-red-600">
          Failed to load analyses. Please refresh the page.
        </p>
      </div>
    );
  }

  return (
    <CandidateHistoryTable
      data={listQuery.data ?? EMPTY_LIST}
      isLoading={listQuery.isLoading}
      onSelectAnalysis={setSelectedAnalysisId}
    />
  );
}
