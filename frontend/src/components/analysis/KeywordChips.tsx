interface KeywordChipsProps {
  matched: string[];
  missing: string[];
  loading?: boolean;
}

export function KeywordChips({
  matched,
  missing,
  loading = false,
}: KeywordChipsProps) {
  if (loading) {
    return (
      <div>
        <p className="mb-2 text-sm font-medium text-text-primary">Keywords</p>
        <div className="flex flex-wrap gap-2">
          {[1, 2, 3].map((n) => (
            <div
              key={n}
              className="h-6 w-20 animate-pulse rounded-full bg-surface"
            />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div>
      <p className="mb-2 text-sm font-medium text-text-primary">Keywords</p>
      <div className="flex flex-wrap gap-2">
        {matched.map((kw) => (
          <span
            key={kw}
            className="rounded-full border border-[#038E43]/30 bg-[#038E43]/10 px-3 py-0.5 text-xs font-medium text-[#038E43]"
          >
            {kw}
          </span>
        ))}
        {missing.map((kw) => (
          <span
            key={kw}
            className="rounded-full border border-border bg-surface px-3 py-0.5 text-xs font-medium text-text-secondary line-through"
            aria-label={`Missing: ${kw}`}
          >
            {kw}
          </span>
        ))}
      </div>
      {matched.length === 0 && missing.length === 0 && (
        <p className="text-xs text-text-secondary">No keyword data</p>
      )}
    </div>
  );
}
