import { KeywordChips } from '@/components/analysis/KeywordChips';
import { ReasoningCallout } from '@/components/analysis/ReasoningCallout';
import { ScoreCard } from '@/components/analysis/ScoreCard';
import { ShortlistToggle } from '@/components/analysis/ShortlistToggle';
import type { AnalysisDetailResponse, JDMatchItem } from '@/types/analysis';

interface CandidateDetailViewProps {
  analysis: AnalysisDetailResponse;
  onBack: () => void;
  readOnly?: boolean;
  onBackLabel?: string;
}

export function CandidateDetailView({
  analysis,
  onBack,
  readOnly = false,
  onBackLabel = '← Back to History',
}: CandidateDetailViewProps) {
  // Parse matched_keywords: stored as flat JSON array string e.g. '["React","TypeScript"]'
  let matchedKeywords: string[] = [];
  try {
    const parsed: unknown = JSON.parse(analysis.matched_keywords ?? '[]');
    matchedKeywords = Array.isArray(parsed) ? (parsed as string[]) : [];
  } catch {
    // leave empty array — render gracefully
  }

  // missing_keywords is intentionally NOT persisted in the DB (SSE-only field).
  const missingKeywords: string[] = [];

  // Parse jd_match: stored as JSON array of SkillMatch objects
  let jdMatchItems: JDMatchItem[] = [];
  try {
    const parsed: unknown = JSON.parse(analysis.jd_match ?? '[]');
    jdMatchItems = Array.isArray(parsed) ? (parsed as JDMatchItem[]) : [];
  } catch {
    // leave empty array
  }

  return (
    <div className="p-6 max-w-[960px] mx-auto">
      {/* Back link */}
      <button
        onClick={onBack}
        className="mb-6 flex items-center gap-1 text-sm text-text-secondary hover:text-[#038E43] transition-colors"
      >
        {onBackLabel}
      </button>

      {/* Candidate header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">
            {analysis.candidate_name}
          </h1>
          <p className="text-sm text-text-secondary mt-1">
            Analysed{' '}
            {new Date(analysis.created_at).toLocaleDateString('en-US', {
              year: 'numeric',
              month: 'long',
              day: 'numeric',
            })}
          </p>
        </div>
        {/* ShortlistToggle — still placeholder; Story 5.4 activates it */}
        <ShortlistToggle
          analysisId={analysis.id}
          isShortlisted={analysis.is_shortlisted}
          readOnly={readOnly}
        />
      </div>

      {/* Score cards — 2-column grid */}
      <div className="grid grid-cols-2 gap-4 mb-6">
        <ScoreCard
          score={analysis.score}
          label="Overall Score"
          loading={false}
        />
        <ScoreCard
          score={analysis.ats_score}
          label="ATS Score"
          sublabel="Keyword match"
          loading={false}
        />
      </div>

      {/* Keywords */}
      <section className="mb-6">
        <h2 className="text-sm font-semibold text-text-secondary uppercase tracking-wide mb-3">
          Keywords
        </h2>
        <KeywordChips
          matched={matchedKeywords}
          missing={missingKeywords}
          loading={false}
        />
      </section>

      {/* AI feedback summary */}
      {analysis.feedback && (
        <section className="mb-6">
          <h2 className="text-sm font-semibold text-text-secondary uppercase tracking-wide mb-3">
            Summary
          </h2>
          <p className="text-sm text-text-primary leading-relaxed">{analysis.feedback}</p>
        </section>
      )}

      {/* JD Match table */}
      {jdMatchItems.length > 0 && (
        <section className="mb-6">
          <h2 className="text-sm font-semibold text-text-secondary uppercase tracking-wide mb-3">
            JD Match Analysis
          </h2>
          <div className="rounded-lg border border-border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-surface text-text-secondary text-xs uppercase">
                <tr>
                  <th className="px-4 py-2 text-left">Skill</th>
                  <th className="px-4 py-2 text-left">Present</th>
                  <th className="px-4 py-2 text-left">Evidence</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border bg-background">
                {jdMatchItems.map((row, idx) => (
                  <tr key={idx}>
                    <td className="px-4 py-2 font-medium text-text-primary">
                      {row.skill}
                    </td>
                    <td className="px-4 py-2">
                      <span
                        className={
                          row.present ? 'text-[#038E43]' : 'text-text-secondary'
                        }
                      >
                        {row.present ? '✓ Yes' : '✗ No'}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-text-secondary">
                      {row.evidence ?? '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Reasoning callout */}
      {analysis.reasoning && (
        <section className="mb-6">
          <h2 className="text-sm font-semibold text-text-secondary uppercase tracking-wide mb-3">
            AI Reasoning
          </h2>
          <ReasoningCallout text={analysis.reasoning} streaming={false} />
        </section>
      )}

      {/* Recruiter notes */}
      <section className="mb-6">
        <h2 className="text-sm font-semibold text-text-secondary uppercase tracking-wide mb-3">
          Recruiter Notes ({analysis.notes.length})
        </h2>
        {analysis.notes.length === 0 ? (
          <p className="text-sm text-text-secondary">No notes added yet.</p>
        ) : (
          <ul className="space-y-3">
            {analysis.notes.map((note) => (
              <li
                key={note.id}
                className="rounded-lg border border-border bg-background p-4"
              >
                <p className="text-sm text-text-primary">{note.content}</p>
                <p className="mt-1 text-xs text-text-secondary">
                  {new Date(note.created_at).toLocaleDateString('en-US', {
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric',
                  })}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
