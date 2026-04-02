import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AuthContext, type AuthContextValue } from '@/context/AuthContext';
import { AppSidebar } from './AppSidebar';

// Mock useNavigate so we can assert redirect calls without a real browser router
const mockNavigate = vi.fn();
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return { ...actual, useNavigate: () => mockNavigate };
});

const mockLogout = vi.fn().mockResolvedValue(undefined);

function makeContext(role: string): AuthContextValue {
  return {
    user: { email: `${role}@test.com`, role, token: 'test-token' },
    login: vi.fn(),
    logout: mockLogout,
    isAuthenticated: true,
  };
}

function renderSidebar(role: string, route = '/') {
  return render(
    <AuthContext.Provider value={makeContext(role)}>
      <MemoryRouter initialEntries={[route]}>
        <AppSidebar />
      </MemoryRouter>
    </AuthContext.Provider>,
  );
}

describe('AppSidebar', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows recruiter nav items and hides Candidates', () => {
    renderSidebar('recruiter');
    expect(screen.getByRole('link', { name: 'Dashboard' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Analysis' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'History' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Job Descriptions' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Candidates' })).not.toBeInTheDocument();
  });

  it('shows only Candidates for interviewer and hides recruiter items', () => {
    renderSidebar('interviewer');
    expect(screen.getByRole('link', { name: 'Candidates' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Dashboard' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Analysis' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'History' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Job Descriptions' })).not.toBeInTheDocument();
  });

  it('marks the History nav item as active on the /history route', () => {
    renderSidebar('recruiter', '/history');
    const historyLink = screen.getByRole('link', { name: 'History' });
    // NavLink sets aria-current="page" on the active link (React Router v7 behaviour)
    expect(historyLink).toHaveAttribute('aria-current', 'page');
  });

  it('calls logout() and navigates to /login when Logout is clicked', async () => {
    renderSidebar('recruiter');
    const logoutButton = screen.getByRole('button', { name: 'Logout' });
    fireEvent.click(logoutButton);
    await waitFor(() => {
      expect(mockLogout).toHaveBeenCalledOnce();
    });
    expect(mockNavigate).toHaveBeenCalledWith('/login', { replace: true });
  });
});
