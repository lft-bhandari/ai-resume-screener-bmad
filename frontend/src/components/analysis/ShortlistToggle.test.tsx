import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { vi, beforeEach, describe, it, expect } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ShortlistToggle } from './ShortlistToggle';
import * as candidatesApi from '@/api/candidates';
import * as useAuthModule from '@/hooks/useAuth';

vi.mock('@/api/candidates');
vi.mock('@/hooks/useAuth');

const mockToggle = vi.mocked(candidatesApi.toggleShortlistApi);
const mockUseAuth = vi.mocked(useAuthModule.useAuth);

beforeEach(() => {
  vi.clearAllMocks();
  mockUseAuth.mockReturnValue({
    user: { email: 'r@test.com', role: 'recruiter', token: 'test-token' },
    login: vi.fn(),
    logout: vi.fn(),
    isAuthenticated: true,
  });
});

function renderToggle(analysisId = 1, isShortlisted = false) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <ShortlistToggle analysisId={analysisId} isShortlisted={isShortlisted} />
    </QueryClientProvider>,
  );
}

describe('ShortlistToggle', () => {
  it('renders_shortlist_button_when_not_shortlisted', () => {
    renderToggle(1, false);
    expect(screen.getByRole('button', { name: /shortlist candidate/i })).toBeInTheDocument();
    expect(screen.getByText('Shortlist')).toBeInTheDocument();
  });

  it('renders_shortlisted_button_when_shortlisted', () => {
    renderToggle(1, true);
    expect(screen.getByRole('button', { name: /remove from shortlist/i })).toBeInTheDocument();
    expect(screen.getByText('★ Shortlisted')).toBeInTheDocument();
  });

  it('clicking_button_calls_toggleShortlistApi', async () => {
    mockToggle.mockResolvedValue({ id: 1, is_shortlisted: true });
    renderToggle(1, false);

    fireEvent.click(screen.getByRole('button', { name: /shortlist candidate/i }));

    await waitFor(() => {
      expect(mockToggle).toHaveBeenCalledWith('test-token', 1, true);
    });
  });

  it('optimistic_ui_flips_state_before_api_resolves', () => {
    // Use a never-resolving promise to check intermediate state
    mockToggle.mockReturnValue(new Promise(() => {}));
    renderToggle(1, false);

    fireEvent.click(screen.getByRole('button', { name: /shortlist candidate/i }));

    // Should immediately show the toggled state (optimistic)
    expect(screen.getByText('★ Shortlisted')).toBeInTheDocument();
  });

  it('on_success_shows_no_toast', async () => {
    mockToggle.mockResolvedValue({ id: 1, is_shortlisted: true });
    renderToggle(1, false);

    fireEvent.click(screen.getByRole('button', { name: /shortlist candidate/i }));

    await waitFor(() => {
      expect(mockToggle).toHaveBeenCalled();
    });

    // No alert/toast should be present on success
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('on_error_reverts_state_and_shows_amber_toast', async () => {
    mockToggle.mockRejectedValue(new Error('Network error'));
    renderToggle(1, false);

    fireEvent.click(screen.getByRole('button', { name: /shortlist candidate/i }));

    // After optimistic flip, wait for the error to revert
    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });

    // Button should have reverted to original state
    expect(screen.getByText('Shortlist')).toBeInTheDocument();
    // Toast should contain the error message
    expect(screen.getByText('Network error')).toBeInTheDocument();
  });
});
