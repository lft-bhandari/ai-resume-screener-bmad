interface ScoreCardProps {
  score: number | null;
  label: string;
  sublabel?: string;
  loading?: boolean;
}

export function ScoreCard({
  score,
  label,
  sublabel,
  loading = false,
}: ScoreCardProps) {
  if (loading) {
    return (
      <div
        className="rounded-lg border border-border bg-background p-6"
        aria-busy="true"
        aria-label={`${label} loading`}
      >
        <div className="mb-2 h-4 w-24 animate-pulse rounded bg-surface" />
        <div className="mb-3 h-9 w-16 animate-pulse rounded bg-surface" />
        <div className="h-2 w-full animate-pulse rounded-full bg-surface" />
      </div>
    );
  }

  if (score === null) {
    return (
      <div className="rounded-lg border border-border bg-background p-6">
        <p className="mb-1 text-sm font-medium text-text-secondary">{label}</p>
        <p className="text-[2.25rem] font-bold leading-none text-text-secondary">N/A</p>
        {sublabel && <p className="mt-1 text-xs text-text-secondary">{sublabel}</p>}
      </div>
    );
  }

  const isHigh = score >= 70;
  const isMid = score >= 40 && score < 70;
  const scoreColour = isHigh
    ? 'text-[#038E43]'
    : isMid
      ? 'text-[#b45309]'
      : 'text-[#404040]';
  const barColour = isHigh
    ? 'bg-[#038E43]'
    : isMid
      ? 'bg-[#b45309]'
      : 'bg-[#404040]';
  const defaultSublabel = isHigh
    ? 'Strong match'
    : isMid
      ? 'Partial match'
      : 'Weak match';
  const sublabelText = sublabel ?? defaultSublabel;

  return (
    <div className="rounded-lg border border-border bg-background p-6">
      <p className="mb-1 text-sm font-medium text-text-secondary">{label}</p>
      <p className={`mb-1 text-[2.25rem] font-bold leading-none ${scoreColour}`}>
        {score.toFixed(0)}
        <span className="ml-0.5 text-base font-normal text-text-secondary">
          / 100
        </span>
      </p>
      <p className="mb-3 text-xs text-text-secondary">{sublabelText}</p>
      <div className="h-2 w-full overflow-hidden rounded-full bg-surface">
        <div
          className={`h-2 rounded-full transition-all duration-700 ${barColour}`}
          style={{ width: `${score}%` }}
          role="progressbar"
          aria-valuenow={score}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`${label}: ${score.toFixed(0)} out of 100`}
        />
      </div>
    </div>
  );
}
