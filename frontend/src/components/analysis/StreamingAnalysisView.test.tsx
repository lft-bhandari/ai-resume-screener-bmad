import { render, screen, fireEvent } from '@testing-library/react';
import { vi, beforeEach, describe, test, expect } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { AuthContext, type AuthContextValue } from '@/context/AuthContext';
import { StreamingAnalysisView } from './StreamingAnalysisView';
import * as useAnalysisStreamModule from '@/hooks/useAnalysisStream';
import type { StreamingState } from '@/types/analysis';

// Mock @microsoft/fetch-event-source — not used directly but imported by hook
vi.mock('@microsoft/fetch-event-source', () => ({
  fetchEventSource: vi.fn(),
}));

// Mock the useAnalysisStream hook
vi.mock('@/hooks/useAnalysisStream');

const mockRetry = vi.fn();

const mockUser = { email: 'r@test.com', role: 'recruiter', token: 'test-token' };

const mockContextValue: AuthContextValue = {
  user: mockUser,
  login: vi.fn(),
  logout: vi.fn(),
  isAuthenticated: true,
};

function makeState(overrides: Partial<StreamingState>): StreamingState {
  return {
    phase: 'connecting',
    result: null,
    errorMessage: null,
    reasoningBuffer: '',
    ...overrides,
  };
}

function renderView(analysisId = 1, candidateName = 'Jane Smith') {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <AuthContext.Provider value={mockContextValue}>
        <MemoryRouter>
          <StreamingAnalysisView
            analysisId={analysisId}
            candidateName={candidateName}
            token="test-token"
          />
        </MemoryRouter>
      </AuthContext.Provider>
    </QueryClientProvider>,
  );
}

// jsdom does not implement scrollIntoView — mock it globally
window.HTMLElement.prototype.scrollIntoView = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
});

describe('StreamingAnalysisView', () => {
  test('renders score card skeletons when connecting (AC3)', () => {
    vi.mocked(useAnalysisStreamModule.useAnalysisStream).mockReturnValue({
      state: makeState({ phase: 'connecting' }),
      retry: mockRetry,
    });
    renderView();
    // Skeleton elements are present (aria-busy divs)
    const skeletons = document.querySelectorAll('[aria-busy="true"]');
    expect(skeletons.length).toBeGreaterThanOrEqual(2);
  });

  test('renders candidate name and analysis ID (AC3)', () => {
    vi.mocked(useAnalysisStreamModule.useAnalysisStream).mockReturnValue({
      state: makeState({ phase: 'connecting' }),
      retry: mockRetry,
    });
    renderView(42, 'Alice Wong');
    expect(screen.getByText('Alice Wong')).toBeInTheDocument();
    expect(screen.getByText('Analysis #42')).toBeInTheDocument();
  });

  test('renders score values when analysis_complete received (AC4)', () => {
    vi.mocked(useAnalysisStreamModule.useAnalysisStream).mockReturnValue({
      state: makeState({
        phase: 'complete',
        result: {
          score: 85,
          ats_score: 90,
          matched_keywords: ['Python', 'FastAPI'],
          missing_keywords: ['Kubernetes'],
          jd_match: [],
          feedback: 'Strong candidate',
          reasoning: 'Good match overall.',
        },
        reasoningBuffer: 'Good match overall.',
      }),
      retry: mockRetry,
    });
    renderView();
    // Score values rendered (toFixed(0) = "85", "90")
    expect(screen.getByText('85')).toBeInTheDocument();
    expect(screen.getByText('90')).toBeInTheDocument();
  });

  test('reveals shortlist toggle and "Add Note" on complete (AC4)', () => {
    vi.mocked(useAnalysisStreamModule.useAnalysisStream).mockReturnValue({
      state: makeState({
        phase: 'complete',
        result: {
          score: 75,
          ats_score: 80,
          matched_keywords: [],
          missing_keywords: [],
          jd_match: [],
          feedback: '',
          reasoning: 'Fine.',
        },
        reasoningBuffer: 'Fine.',
      }),
      retry: mockRetry,
    });
    renderView();
    // ShortlistToggle is present (disabled placeholder in 4.5)
    expect(
      screen.getByRole('button', { name: /shortlist/i }),
    ).toBeInTheDocument();
    // Add Note button present on complete
    expect(
      screen.getByRole('button', { name: /add note/i }),
    ).toBeInTheDocument();
  });

  test('shows amber error toast with retry CTA on error phase (AC5)', () => {
    vi.mocked(useAnalysisStreamModule.useAnalysisStream).mockReturnValue({
      state: makeState({
        phase: 'error',
        errorMessage: "Analysis couldn't complete. Try again?",
      }),
      retry: mockRetry,
    });
    renderView();
    // Error toast visible
    expect(
      screen.getByRole('alert'),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/analysis couldn't complete/i),
    ).toBeInTheDocument();
    // Retry button visible and callable
    const retryBtn = screen.getByRole('button', { name: /retry/i });
    expect(retryBtn).toBeInTheDocument();
    fireEvent.click(retryBtn);
    expect(mockRetry).toHaveBeenCalledTimes(1);
  });

  test('streaming container has aria-live="polite" (AC7)', () => {
    vi.mocked(useAnalysisStreamModule.useAnalysisStream).mockReturnValue({
      state: makeState({ phase: 'connecting' }),
      retry: mockRetry,
    });
    renderView();
    const liveRegion = document.querySelector('[aria-live="polite"]');
    expect(liveRegion).not.toBeNull();
    expect(liveRegion?.getAttribute('aria-live')).toBe('polite');
  });

  test('progress indicator renders all 4 phase labels (AC3)', () => {
    vi.mocked(useAnalysisStreamModule.useAnalysisStream).mockReturnValue({
      state: makeState({ phase: 'keywords' }),
      retry: mockRetry,
    });
    renderView();
    expect(screen.getByText('Scores')).toBeInTheDocument();
    // "Keywords" may appear in both the progress indicator and the chips header
    expect(screen.getAllByText('Keywords').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('JD Match')).toBeInTheDocument();
    expect(screen.getByText('Reasoning')).toBeInTheDocument();
  });

  test('"View in History" link visible on complete (AC4)', () => {
    vi.mocked(useAnalysisStreamModule.useAnalysisStream).mockReturnValue({
      state: makeState({
        phase: 'complete',
        result: {
          score: 60,
          ats_score: 65,
          matched_keywords: [],
          missing_keywords: [],
          jd_match: [],
          feedback: '',
          reasoning: 'OK.',
        },
        reasoningBuffer: 'OK.',
      }),
      retry: mockRetry,
    });
    renderView();
    expect(screen.getByText(/view in history/i)).toBeInTheDocument();
  });
});
