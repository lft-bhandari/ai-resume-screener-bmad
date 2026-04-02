import { render, screen, waitFor } from '@testing-library/react';
import { vi, beforeEach, describe, it, expect } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { DashboardPage } from '@/pages/DashboardPage';
import * as analysesApi from '@/api/analyses';
import * as jdApi from '@/api/job_descriptions';
import * as useAuthModule from '@/hooks/useAuth';

vi.mock('@/api/analyses');
vi.mock('@/api/job_descriptions');
vi.mock('@/hooks/useAuth');

const mockListAnalyses = vi.mocked(analysesApi.listAnalysesApi);
const mockListJDs = vi.mocked(jdApi.listJobDescriptionsApi);
const mockUseAuth = vi.mocked(useAuthModule.useAuth);

const MOCK_ANALYSES_RESPONSE = {
  items: [
    {
      id: 1,
      candidate_name: 'Alice Smith',
      score: 88,
      ats_score: 75,
      is_shortlisted: true,
      jd_id: 1,
      jd_title: 'Senior Engineer',
      created_at: '2026-03-28T10:00:00Z',
    },
    {
      id: 2,
      candidate_name: 'Bob Jones',
      score: 55,
      ats_score: 60,
      is_shortlisted: false,
      jd_id: 2,
      jd_title: 'Product Manager',
      created_at: '2026-03-27T09:00:00Z',
    },
  ],
  total: 2,
};

const MOCK_SHORTLISTED_RESPONSE = {
  items: [MOCK_ANALYSES_RESPONSE.items[0]],
  total: 1,
};

const MOCK_JD_RESPONSE = {
  items: [
    {
      id: 1,
      title: 'Senior Engineer',
      content: '...',
      created_at: '2026-03-20T00:00:00Z',
    },
  ],
  total: 1,
};

beforeEach(() => {
  vi.clearAllMocks();
  mockUseAuth.mockReturnValue({
    user: { email: 'priya@test.com', role: 'recruiter', token: 'test-token' },
    login: vi.fn(),
    logout: vi.fn(),
    isAuthenticated: true,
  });
  // Default: realistic mock — shortlisted call receives true param
  mockListAnalyses.mockImplementation((_token, shortlisted) =>
    shortlisted
      ? Promise.resolve(MOCK_SHORTLISTED_RESPONSE)
      : Promise.resolve(MOCK_ANALYSES_RESPONSE),
  );
  mockListJDs.mockResolvedValue(MOCK_JD_RESPONSE);
});

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  return render(
    <MemoryRouter>
      <QueryClientProvider client={queryClient}>
        <DashboardPage />
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

describe('DashboardPage', () => {
  it('renders page heading "Dashboard"', () => {
    renderPage();
    expect(
      screen.getByRole('heading', { name: 'Dashboard' }),
    ).toBeInTheDocument();
  });

  it('renders three stat card labels', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Analyses Run')).toBeInTheDocument();
      expect(screen.getByText('Candidates Shortlisted')).toBeInTheDocument();
      expect(screen.getByText('Active JDs')).toBeInTheDocument();
    });
  });

  it('renders correct stat values from API responses', async () => {
    renderPage();
    // Analyses Run = 2, Shortlisted = 1, Active JDs = 1
    await waitFor(() => {
      expect(screen.getByText('2')).toBeInTheDocument();
    });
    // Both shortlisted total and JD total are 1 — use getAllByText
    const ones = screen.getAllByText('1');
    expect(ones.length).toBeGreaterThanOrEqual(2);
  });

  it('calls listAnalysesApi with shortlisted=true for shortlisted stat', async () => {
    renderPage();
    await waitFor(() => {
      expect(mockListAnalyses).toHaveBeenCalledWith('test-token', true);
      expect(mockListAnalyses).toHaveBeenCalledWith('test-token');
    });
  });

  it('renders recent analyses rows with candidate names', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Alice Smith')).toBeInTheDocument();
      expect(screen.getByText('Bob Jones')).toBeInTheDocument();
    });
  });

  it('renders "Analyse Resume" link pointing to /analysis', () => {
    renderPage();
    const links = screen.getAllByRole('link', { name: /Analyse Resume/i });
    // Primary CTA link
    expect(links[0]).toHaveAttribute('href', '/analysis');
  });

  it('shows empty state when no analyses exist', async () => {
    mockListAnalyses.mockResolvedValue({ items: [], total: 0 });
    mockListJDs.mockResolvedValue({ items: [], total: 1 });
    renderPage();
    await waitFor(() => {
      expect(screen.getByText(/No analyses yet/i)).toBeInTheDocument();
    });
  });

  it('stat cards show 0 in zero state', async () => {
    mockListAnalyses.mockResolvedValue({ items: [], total: 0 });
    mockListJDs.mockResolvedValue({ items: [], total: 0 });
    renderPage();
    await waitFor(() => {
      const zeros = screen.getAllByText('0');
      expect(zeros.length).toBeGreaterThanOrEqual(3);
    });
  });
});
