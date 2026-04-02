import { render, screen } from '@testing-library/react';
import { vi } from 'vitest';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { AuthContext, type AuthContextValue } from '@/context/AuthContext';
import { ProtectedRoute } from './ProtectedRoute';
import type { AuthUser } from '@/types/auth';

function renderWithAuth(isAuthenticated: boolean, user: AuthUser | null = null) {
  const contextValue: AuthContextValue = {
    user,
    login: vi.fn(),
    logout: vi.fn(),
    isAuthenticated,
  };
  return render(
    <AuthContext.Provider value={contextValue}>
      <MemoryRouter initialEntries={['/protected']}>
        <Routes>
          <Route path="/login" element={<div>Login Page</div>} />
          <Route element={<ProtectedRoute />}>
            <Route path="/protected" element={<div>Protected Content</div>} />
          </Route>
        </Routes>
      </MemoryRouter>
    </AuthContext.Provider>
  );
}

test('redirects to /login when not authenticated (AC1)', () => {
  renderWithAuth(false);
  expect(screen.getByText('Login Page')).toBeInTheDocument();
  expect(screen.queryByText('Protected Content')).not.toBeInTheDocument();
});

test('renders children when authenticated (AC1)', () => {
  renderWithAuth(true, { email: 'test@example.com', role: 'recruiter', token: 'test-token' });
  expect(screen.getByText('Protected Content')).toBeInTheDocument();
  expect(screen.queryByText('Login Page')).not.toBeInTheDocument();
});
