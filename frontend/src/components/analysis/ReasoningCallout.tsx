interface ReasoningCalloutProps {
  text: string;
  streaming?: boolean;
}

export function ReasoningCallout({
  text,
  streaming = false,
}: ReasoningCalloutProps) {
  return (
    <>
      {/* Cursor blink keyframe */}
      <style>{`@keyframes blink { 0%, 100% { opacity: 1 } 50% { opacity: 0 } }`}</style>
      <div className="bg-[#B4FFD6]/30 border-l-4 border-[#038E43] rounded-r-lg p-4">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-[#038E43]">
          AI Reasoning
        </p>
        <p className="text-sm leading-relaxed text-text-primary">
          {text}
          {streaming && (
            <span
              className="ml-0.5 inline-block w-[2px] bg-[#038E43] align-middle"
              style={{ height: '1em', animation: 'blink 1s step-end infinite' }}
              aria-hidden="true"
            />
          )}
        </p>
      </div>
    </>
  );
}
