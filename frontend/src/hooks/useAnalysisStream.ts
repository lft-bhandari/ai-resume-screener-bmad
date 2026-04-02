import { useCallback, useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { fetchEventSource } from '@microsoft/fetch-event-source';
import { getAnalysisStreamUrl } from '@/api/analyses';
import type {
  AnalysisResult,
  ReasoningStepEvent,
  StreamingState,
} from '@/types/analysis';

const PHASE_FROM_STEP: Record<string, StreamingState['phase']> = {
  initialising: 'scores',
  skills_match: 'keywords',
  ats_check: 'jd_match',
  generating_output: 'reasoning',
};

export function useAnalysisStream(analysisId: number, token: string) {
  const queryClient = useQueryClient();
  const [state, setState] = useState<StreamingState>({
    phase: 'connecting',
    result: null,
    errorMessage: null,
    reasoningBuffer: '',
  });

  const abortRef = useRef<AbortController | null>(null);

  const connect = useCallback(() => {
    // Cancel any previous connection
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setState({
      phase: 'connecting',
      result: null,
      errorMessage: null,
      reasoningBuffer: '',
    });

    void fetchEventSource(getAnalysisStreamUrl(analysisId), {
      headers: { Authorization: `Bearer ${token}` },
      signal: controller.signal,
      onmessage(ev) {
        if (ev.event === 'reasoning_step') {
          const data = JSON.parse(ev.data) as ReasoningStepEvent;
          const phase = PHASE_FROM_STEP[data.step] ?? 'scores';
          setState((prev) => ({ ...prev, phase }));
        } else if (ev.event === 'analysis_complete') {
          const result = JSON.parse(ev.data) as AnalysisResult;
          setState((prev) => ({
            ...prev,
            phase: 'complete',
            result,
            reasoningBuffer: result.reasoning,
          }));
          // Invalidate the analyses list cache so History page reflects the new record
          void queryClient.invalidateQueries({ queryKey: ['analyses'] });
          controller.abort(); // Connection complete — close cleanly
        } else if (ev.event === 'error') {
          const { message } = JSON.parse(ev.data) as { message: string };
          setState((prev) => ({
            ...prev,
            phase: 'error',
            errorMessage: message,
          }));
          controller.abort();
        }
      },
      onerror(err) {
        if (controller.signal.aborted) return; // Expected abort — ignore
        console.error('SSE connection error', err);
        setState((prev) => ({
          ...prev,
          phase: 'error',
          errorMessage: "Analysis couldn't complete. Try again?",
        }));
        // Throw to prevent fetchEventSource auto-retry
        throw err instanceof Error ? err : new Error('SSE connection error');
      },
    });
  }, [analysisId, token]);

  useEffect(() => {
    connect();
    return () => {
      abortRef.current?.abort();
    };
  }, [connect]);

  return { state, retry: connect };
}
