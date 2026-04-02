import type { StreamingState } from '@/types/analysis';

type Phase = StreamingState['phase'];

const STEPS: { key: string; label: string }[] = [
  { key: 'scores', label: 'Scores' },
  { key: 'keywords', label: 'Keywords' },
  { key: 'jd_match', label: 'JD Match' },
  { key: 'reasoning', label: 'Reasoning' },
];

const PHASE_ORDER: Phase[] = [
  'connecting',
  'scores',
  'keywords',
  'jd_match',
  'reasoning',
  'complete',
];

function getStepStatus(
  stepKey: string,
  activePhase: Phase,
): 'waiting' | 'active' | 'complete' {
  if (activePhase === 'complete' || activePhase === 'error') return 'complete';
  const phaseIdx = PHASE_ORDER.indexOf(activePhase);
  const stepPhaseIdx = PHASE_ORDER.indexOf(stepKey as Phase);
  if (phaseIdx > stepPhaseIdx) return 'complete';
  if (stepKey === activePhase) return 'active';
  return 'waiting';
}

interface StreamingProgressIndicatorProps {
  phase: Phase;
}

export function StreamingProgressIndicator({
  phase,
}: StreamingProgressIndicatorProps) {
  return (
    <div
      className="flex items-center gap-1"
      role="progressbar"
      aria-label="Analysis progress"
    >
      {STEPS.map((step, idx) => {
        const status = getStepStatus(step.key, phase);
        return (
          <div key={step.key} className="flex items-center">
            <div className="flex flex-col items-center gap-1">
              <div
                className={[
                  'h-3 w-3 rounded-full transition-all duration-300',
                  status === 'complete'
                    ? 'bg-[#038E43]'
                    : status === 'active'
                      ? 'bg-[#038E43] animate-pulse ring-2 ring-[#038E43]/30'
                      : 'bg-surface border border-border',
                ].join(' ')}
                aria-hidden="true"
              />
              <span
                className={`text-[10px] font-medium ${
                  status === 'complete' || status === 'active'
                    ? 'text-[#038E43]'
                    : 'text-text-secondary'
                }`}
              >
                {step.label}
              </span>
            </div>
            {idx < STEPS.length - 1 && (
              <div
                className={`mb-5 mx-1 h-px w-6 ${
                  getStepStatus(STEPS[idx + 1].key, phase) !== 'waiting'
                    ? 'bg-[#038E43]'
                    : 'bg-surface'
                }`}
                aria-hidden="true"
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
