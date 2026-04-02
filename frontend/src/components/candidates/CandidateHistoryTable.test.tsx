import { render, screen, fireEvent } from '@testing-library/react';
import { vi, beforeEach, describe, it, expect } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { AuthContext, type AuthContextValue } from '@/context/AuthContext';
import { CandidateHistoryTable } from './CandidateHistoryTable';
import type { AnalysisListResponse } from '@/types/analysis';

const mockUser = { email: 'r@test.com', role: 'recruiter', token: 'test-token' };

const mockContextValue: AuthContextValue = {
  user: mockUser,
  login: vi.fn(),
  logout: vi.fn(),
  isAuthenticated: true,
};

const mockListResponse: AnalysisListResponse = {
  items: [
    {
      id: 1,
      candidate_name: 'Alice Smith',
      score: 78,
      ats_score: 82,
      is_shortlisted: true,
      jd_id: 10,
      jd_title: 'Senior Engineer',
      created_at: '2026-03-25T10:00:00Z',
    },
    {
      id: 2,
      candidate_name: 'Bob Jones',
      score: 45,
      ats_score: 50,
      is_shortlisted: false,
      jd_id: 10,
      jd_title: 'Senior Engineer',
      created_at: '2026-03-26T10:00:00Z',
    },
  ],
  total: 2,
};

const emptyListResponse: AnalysisListResponse = { items: [], total: 0 };

function renderTable(
  data: AnalysisListResponse = mockListResponse,
  isLoading = false,
  onSelectAnalysis = vi.fn(),
) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <AuthContext.Provider value={mockContextValue}>
        <MemoryRouter>
          <CandidateHistoryTable
            data={data}
            isLoading={isLoading}
            onSelectAnalysis={onSelectAnalysis}
          />
        </MemoryRouter>
      </AuthContext.Provider>
    </QueryClientProvider>,
  );
}

describe('CandidateHistoryTable', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders_page_h1_reads_history', () => {
    renderTable();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      'History',
    );
  });

  it('renders_history_table_with_candidate_rows', () => {
    renderTable();
    expect(screen.getByText('Alice Smith')).toBeInTheDocument();
    expect(screen.getByText('Bob Jones')).toBeInTheDocument();
    // Score badge for Alice (score 78)
    expect(screen.getByText('78')).toBeInTheDocument();
    // JD badge
    expect(screen.getAllByText('Senior Engineer').length).toBeGreaterThan(0);
  });

  it('renders_empty_state_when_no_analyses', () => {
    renderTable(emptyListResponse);
    expect(
      screen.getByText(
        /No analyses yet. Upload your first resume to get started./,
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Analyse Resume' })).toBeInTheDocument();
  });

  it('renders_skeleton_rows_while_loading', () => {
    renderTable(emptyListResponse, true);
    // 5 skeleton rows × 5 cells = 25 skeleton divs
    const skeletons = document.querySelectorAll('.animate-pulse');
    expect(skeletons.length).toBeGreaterThanOrEqual(5);
  });

  it('filter_by_name_shows_matching_rows_only', () => {
    renderTable();
    const searchInput = screen.getByPlaceholderText(
      /Search by candidate name/,
    );
    fireEvent.change(searchInput, { target: { value: 'Alice' } });
    expect(screen.getByText('Alice Smith')).toBeInTheDocument();
    expect(screen.queryByText('Bob Jones')).not.toBeInTheDocument();
  });

  it('filter_by_name_is_case_insensitive', () => {
    renderTable();
    const searchInput = screen.getByPlaceholderText(
      /Search by candidate name/,
    );
    fireEvent.change(searchInput, { target: { value: 'alice' } });
    expect(screen.getByText('Alice Smith')).toBeInTheDocument();
    expect(screen.queryByText('Bob Jones')).not.toBeInTheDocument();
  });

  it('filter_by_jd_shows_matching_rows_only', () => {
    const multiJdData: AnalysisListResponse = {
      items: [
        { ...mockListResponse.items[0] },
        {
          ...mockListResponse.items[1],
          jd_id: 20,
          jd_title: 'Frontend Developer',
        },
      ],
      total: 2,
    };
    renderTable(multiJdData);
    const jdSelect = screen.getByRole('combobox', {
      name: /Filter by job description/,
    });
    fireEvent.change(jdSelect, { target: { value: 'Senior Engineer' } });
    expect(screen.getByText('Alice Smith')).toBeInTheDocument();
    expect(screen.queryByText('Bob Jones')).not.toBeInTheDocument();
  });

  it('filter_shortlisted_only_shows_shortlisted_rows', () => {
    renderTable();
    const checkbox = screen.getByRole('checkbox');
    fireEvent.click(checkbox);
    // Alice is shortlisted, Bob is not
    expect(screen.getByText('Alice Smith')).toBeInTheDocument();
    expect(screen.queryByText('Bob Jones')).not.toBeInTheDocument();
  });

  it('clicking_row_calls_onSelectAnalysis_with_id', () => {
    const onSelect = vi.fn();
    renderTable(mockListResponse, false, onSelect);
    // Click the Alice row (first data row)
    fireEvent.click(screen.getByText('Alice Smith'));
    expect(onSelect).toHaveBeenCalledWith(1);
  });

  it('no_results_filter_message_when_filter_applied', () => {
    renderTable();
    const searchInput = screen.getByPlaceholderText(
      /Search by candidate name/,
    );
    fireEvent.change(searchInput, { target: { value: 'Nonexistent Person' } });
    expect(
      screen.getByText(/No results for these filters/),
    ).toBeInTheDocument();
  });
});
