import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { listAnalysesApi } from '@/api/analyses';
import { listJobDescriptionsApi } from '@/api/job_descriptions';
import type { AnalysisListItem } from '@/types/analysis';

// ── Inline helper: ScoreBadge ─────────────────────────────────────────────
// (Not exported from CandidateHistoryTable or CandidatesPage — define inline
//  per established project pattern)
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

// ── Inline helper: StatCard ───────────────────────────────────────────────
interface StatCardProps {
  label: string;
  value: number | undefined;
  isLoading: boolean;
}

function StatCard({ label, value, isLoading }: StatCardProps) {
  return (
    <div className="border-l-4 border-[#038E43] bg-background rounded-lg p-5 shadow-sm">
      {isLoading ? (
        <div className="h-9 w-16 animate-pulse rounded bg-surface mb-1" />
      ) : (
        <div className="text-4xl font-bold text-text-primary leading-none">
          {value ?? 0}
        </div>
      )}
      <div className="text-sm text-text-secondary mt-2">{label}</div>
    </div>
  );
}

// ── Inline helper: RecentAnalysisRow ─────────────────────────────────────
function RecentAnalysisRow({ item }: { item: AnalysisListItem }) {
  return (
    <div className="flex items-center gap-4 py-3 border-b border-border last:border-0">
      <span className="flex-1 text-sm font-medium text-text-primary truncate">
        {item.candidate_name}
      </span>
      <span className="flex-shrink-0">
        {item.jd_title ? (
          <span className="inline-flex items-center rounded-full bg-surface px-2 py-0.5 text-xs font-medium text-text-secondary border border-border">
            {item.jd_title}
          </span>
        ) : (
          <span className="text-text-secondary text-sm">—</span>
        )}
      </span>
      <span className="flex-shrink-0 w-10 text-right">
        <ScoreBadge score={item.score} />
      </span>
      <span className="flex-shrink-0 text-sm text-text-secondary">
        {new Date(item.created_at).toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
        })}
      </span>
    </div>
  );
}

// ── Main page component ───────────────────────────────────────────────────
export function DashboardPage() {
  const { user } = useAuth();

  // Three parallel queries — derives all stats without a dedicated stats endpoint
  const analysesQuery = useQuery({
    queryKey: ['analyses'],
    queryFn: () => listAnalysesApi(user!.token),
    enabled: !!user,
  });

  const shortlistedQuery = useQuery({
    queryKey: ['analyses-shortlisted'],
    queryFn: () => listAnalysesApi(user!.token, true),
    enabled: !!user,
  });

  const jdQuery = useQuery({
    queryKey: ['job_descriptions'],
    queryFn: () => listJobDescriptionsApi(user!.token),
    enabled: !!user,
  });

  const recentItems = analysesQuery.data?.items.slice(0, 5) ?? [];
  const anyLoading =
    analysesQuery.isLoading || shortlistedQuery.isLoading || jdQuery.isLoading;
  const anyError =
    analysesQuery.isError || shortlistedQuery.isError || jdQuery.isError;

  return (
    <div className="p-6 max-w-[960px] mx-auto">
      <h1 className="text-2xl font-bold text-text-primary mb-6">Dashboard</h1>

      {/* Inline error banner — shown if any stat query fails */}
      {anyError && (
        <div className="mb-6 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Some stats could not be loaded. Data shown may be incomplete.
        </div>
      )}

      {/* ── Stat cards ───────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        <StatCard
          label="Analyses Run"
          value={analysesQuery.data?.total}
          isLoading={analysesQuery.isLoading}
        />
        <StatCard
          label="Candidates Shortlisted"
          value={shortlistedQuery.data?.total}
          isLoading={shortlistedQuery.isLoading}
        />
        <StatCard
          label="Active JDs"
          value={jdQuery.data?.total}
          isLoading={jdQuery.isLoading}
        />
      </div>

      {/* ── Prominent CTA ────────────────────────────────────────────── */}
      <div className="mb-8">
        <Link
          to="/analysis"
          className="inline-flex items-center rounded-md px-5 py-2.5 text-sm font-medium bg-[#038E43] text-white hover:bg-[#2AA764] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#038E43] focus-visible:ring-offset-2"
        >
          Analyse Resume
        </Link>
      </div>

      {/* ── Recent Analyses ──────────────────────────────────────────── */}
      <div>
        <h2 className="text-base font-semibold text-text-primary mb-3">
          Recent Analyses
        </h2>

        <div className="rounded-lg border border-border bg-background px-4">
          {/* Skeleton loading */}
          {anyLoading &&
            Array.from({ length: 5 }).map((_, i) => (
              <div
                key={i}
                className="flex items-center gap-4 py-3 border-b border-border last:border-0"
              >
                <div className="h-4 flex-1 animate-pulse rounded bg-surface" />
                <div className="h-4 w-20 animate-pulse rounded bg-surface" />
                <div className="h-4 w-8 animate-pulse rounded bg-surface" />
                <div className="h-4 w-12 animate-pulse rounded bg-surface" />
              </div>
            ))}

          {/* Empty state */}
          {!anyLoading && recentItems.length === 0 && (
            <div className="py-10 text-center text-text-secondary text-sm">
              No analyses yet.{' '}
              <Link
                to="/analysis"
                className="text-[#038E43] hover:underline underline-offset-2"
              >
                Click &apos;Analyse Resume&apos; to get started.
              </Link>
            </div>
          )}

          {/* Data rows */}
          {!anyLoading &&
            recentItems.map((item) => (
              <RecentAnalysisRow key={item.id} item={item} />
            ))}
        </div>
      </div>
    </div>
  );
}
