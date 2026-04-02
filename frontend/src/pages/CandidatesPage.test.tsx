import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { vi, beforeEach, describe, it, expect } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { CandidatesPage } from './CandidatesPage';
import * as analysesApi from '@/api/analyses';
import * as useAuthModule from '@/hooks/useAuth';

vi.mock('@/api/analyses');
vi.mock('@/hooks/useAuth');

const mockListAnalyses = vi.mocked(analysesApi.listAnalysesApi);
const mockGetDetail = vi.mocked(analysesApi.getAnalysisDetailApi);
const mockUseAuth = vi.mocked(useAuthModule.useAuth);

const MOCK_SHORTLISTED_ITEM = {
  id: 42,
  candidate_name: 'Jane Doe',
  score: 85,
  ats_score: 78,
  is_shortlisted: true,
  jd_id: 1,
  jd_title: 'Senior React Dev',
  created_at: '2026-03-28T10:00:00Z',
};

const MOCK_DETAIL = {
  id: 42,
  candidate_name: 'Jane Doe',
  resume_filename: 'jane_doe_cv.pdf',
  score: 85,
  ats_score: 78,
  matched_keywords: '["React","TypeScript"]',
  jd_match: '[]',
  feedback: 'Strong candidate.',
  reasoning: 'Excellent React skills.',
  is_shortlisted: true,
  jd_id: 1,
  created_by: 2,
  created_at: '2026-03-28T10:00:00Z',
  notes: [
    {
      id: 1,
      content: 'Good communication',
      analysis_id: 42,
      created_by: 2,
      created_at: '2026-03-28T12:00:00Z',
    },
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
  mockUseAuth.mockReturnValue({
    user: { email: 'arjun@test.com', role: 'interviewer', token: 'test-token' },
    login: vi.fn(),
    logout: vi.fn(),
    isAuthenticated: true,
  });
});

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <MemoryRouter>
      <QueryClientProvider client={queryClient}>
        <CandidatesPage />
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

describe('CandidatesPage', () => {
  it('renders_page_heading_candidates', async () => {
    mockListAnalyses.mockResolvedValue({ items: [], total: 0 });
    renderPage();
    expect(
      screen.getByRole('heading', { name: 'Candidates' }),
    ).toBeInTheDocument();
  });

  it('shows_empty_state_when_no_shortlisted_candidates', async () => {
    mockListAnalyses.mockResolvedValue({ items: [], total: 0 });
    renderPage();
    await waitFor(() => {
      expect(
        screen.getByText('No candidates shortlisted yet.'),
      ).toBeInTheDocument();
    });
  });

  it('renders_a_shortlisted_candidate_row', async () => {
    mockListAnalyses.mockResolvedValue({
      items: [MOCK_SHORTLISTED_ITEM],
      total: 1,
    });
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Jane Doe')).toBeInTheDocument();
    });
    expect(screen.getByText('Senior React Dev')).toBeInTheDocument();
    expect(screen.getByText('85')).toBeInTheDocument();
  });

  it('calls_listAnalysesApi_with_shortlisted_true', async () => {
    mockListAnalyses.mockResolvedValue({ items: [], total: 0 });
    renderPage();
    await waitFor(() => {
      expect(mockListAnalyses).toHaveBeenCalledWith('test-token', true);
    });
  });

  it('clicking_candidate_row_loads_briefing_view', async () => {
    mockListAnalyses.mockResolvedValue({
      items: [MOCK_SHORTLISTED_ITEM],
      total: 1,
    });
    mockGetDetail.mockResolvedValue(MOCK_DETAIL);
    renderPage();

    await waitFor(() => {
      expect(screen.getByText('Jane Doe')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Jane Doe').closest('tr')!);

    await waitFor(() => {
      expect(screen.getByText('Excellent React skills.')).toBeInTheDocument();
    });
  });

  it('briefing_view_shortlist_toggle_is_read_only', async () => {
    mockListAnalyses.mockResolvedValue({
      items: [MOCK_SHORTLISTED_ITEM],
      total: 1,
    });
    mockGetDetail.mockResolvedValue(MOCK_DETAIL);
    renderPage();

    await waitFor(() => {
      expect(screen.getByText('Jane Doe')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Jane Doe').closest('tr')!);

    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: 'Shortlist status (read-only)' }),
      ).toBeDisabled();
    });
  });

  it('back_button_returns_to_candidates_list', async () => {
    mockListAnalyses.mockResolvedValue({
      items: [MOCK_SHORTLISTED_ITEM],
      total: 1,
    });
    mockGetDetail.mockResolvedValue(MOCK_DETAIL);
    renderPage();

    await waitFor(() => {
      expect(screen.getByText('Jane Doe')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Jane Doe').closest('tr')!);

    await waitFor(() => {
      expect(screen.getByText('← Back to Candidates')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('← Back to Candidates'));

    await waitFor(() => {
      expect(
        screen.getByRole('heading', { name: 'Candidates' }),
      ).toBeInTheDocument();
    });
  });
});
