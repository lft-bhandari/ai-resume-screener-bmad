import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ShortlistToggle } from '@/components/analysis/ShortlistToggle';
import type { AnalysisListItem, AnalysisListResponse } from '@/types/analysis';

interface CandidateHistoryTableProps {
  data: AnalysisListResponse;
  isLoading: boolean;
  onSelectAnalysis: (id: number) => void;
}

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

export function CandidateHistoryTable({
  data,
  isLoading,
  onSelectAnalysis,
}: CandidateHistoryTableProps) {
  const [nameFilter, setNameFilter] = useState('');
  const [jdFilter, setJdFilter] = useState('');
  const [shortlistedOnly, setShortlistedOnly] = useState(false);

  const jdOptions = useMemo(() => {
    const seen = new Set<string>();
    const options: string[] = [];
    for (const item of data.items) {
      if (item.jd_title && !seen.has(item.jd_title)) {
        seen.add(item.jd_title);
        options.push(item.jd_title);
      }
    }
    return options;
  }, [data.items]);

  const filtered = useMemo<AnalysisListItem[]>(() => {
    return data.items.filter((item) => {
      const matchesName = item.candidate_name
        .toLowerCase()
        .includes(nameFilter.toLowerCase());
      const matchesJd = jdFilter === '' || item.jd_title === jdFilter;
      const matchesShortlist = !shortlistedOnly || item.is_shortlisted;
      return matchesName && matchesJd && matchesShortlist;
    });
  }, [data.items, nameFilter, jdFilter, shortlistedOnly]);

  return (
    <div className="p-6 max-w-[960px] mx-auto">
      <h1 className="text-2xl font-bold text-text-primary mb-6">History</h1>

      {/* Filter bar */}
      <div className="flex gap-3 mb-4 items-center flex-wrap">
        <input
          type="text"
          placeholder="Search by candidate name…"
          value={nameFilter}
          onChange={(e) => setNameFilter(e.target.value)}
          className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-text-primary placeholder-text-secondary focus:outline-none focus:ring-2 focus:ring-[#038E43] focus:border-transparent"
          aria-label="Search by candidate name"
        />
        <select
          value={jdFilter}
          onChange={(e) => setJdFilter(e.target.value)}
          className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-[#038E43] focus:border-transparent"
          aria-label="Filter by job description"
        >
          <option value="">All Job Descriptions</option>
          {jdOptions.map((title) => (
            <option key={title} value={title}>
              {title}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-2 text-sm text-text-secondary cursor-pointer select-none">
          <input
            type="checkbox"
            checked={shortlistedOnly}
            onChange={(e) => setShortlistedOnly(e.target.checked)}
            className="accent-[#038E43]"
          />
          Shortlisted only
        </label>
      </div>

      {/* Table */}
      <div className="rounded-lg border border-border overflow-hidden">
        <table className="w-full">
          <thead className="bg-surface text-text-secondary text-xs uppercase">
            <tr>
              <th className="px-4 py-3 text-left">Candidate</th>
              <th className="px-4 py-3 text-left">Score</th>
              <th className="px-4 py-3 text-left">JD</th>
              <th className="px-4 py-3 text-left">Date</th>
              <th className="px-4 py-3 text-left">Shortlisted</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border bg-background">
            {isLoading &&
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={i}>
                  {[1, 2, 3, 4, 5].map((j) => (
                    <td key={j} className="px-4 py-3">
                      <div className="h-4 animate-pulse rounded bg-surface w-24" />
                    </td>
                  ))}
                </tr>
              ))}

            {!isLoading && filtered.length === 0 && (
              <tr>
                <td
                  colSpan={5}
                  className="px-4 py-12 text-center text-text-secondary"
                >
                  {data.items.length === 0 ? (
                    <>
                      No analyses yet. Upload your first resume to get started.{' '}
                      <Link
                        to="/analysis"
                        className="text-[#038E43] underline-offset-2 hover:underline"
                      >
                        Analyse Resume
                      </Link>
                    </>
                  ) : (
                    'No results for these filters. Try adjusting your search.'
                  )}
                </td>
              </tr>
            )}

            {!isLoading &&
              filtered.map((item) => (
                <tr
                  key={item.id}
                  onClick={() => onSelectAnalysis(item.id)}
                  className="hover:bg-surface/50 cursor-pointer transition-colors"
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="h-8 w-8 rounded-full bg-[#038E43]/15 flex items-center justify-center text-xs font-semibold text-[#038E43] flex-shrink-0">
                        {getInitials(item.candidate_name)}
                      </div>
                      <span className="text-sm font-medium text-text-primary">
                        {item.candidate_name}
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <ScoreBadge score={item.score} />
                  </td>
                  <td className="px-4 py-3">
                    {item.jd_title ? (
                      <span className="inline-block rounded bg-surface px-2 py-0.5 text-xs text-text-secondary">
                        {item.jd_title}
                      </span>
                    ) : (
                      <span className="text-text-secondary text-sm">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm text-text-secondary">
                    {new Date(item.created_at).toLocaleDateString('en-US', {
                      year: 'numeric',
                      month: 'short',
                      day: 'numeric',
                    })}
                  </td>
                  <td className="px-4 py-3">
                    {/* Prevent row click from firing when clicking toggle */}
                    <div onClick={(e) => e.stopPropagation()}>
                      <ShortlistToggle
                        analysisId={item.id}
                        isShortlisted={item.is_shortlisted}
                      />
                    </div>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
