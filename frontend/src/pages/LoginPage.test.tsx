import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { vi } from 'vitest';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { AuthContext, type AuthContextValue } from '@/context/AuthContext';
import { LoginPage } from './LoginPage';

/**
 * Helper: renders LoginPage with a mock AuthContext.
 * Provides a /login route + "/" fallback so useNavigate('/') works in tests.
 */
function renderLoginPage(loginFn = vi.fn<(email: string, password: string) => Promise<void>>().mockResolvedValue(undefined)) {
  const contextValue: AuthContextValue = {
    user: null,
    login: loginFn,
    logout: vi.fn(),
    isAuthenticated: false,
  };
  return {
    loginFn,
    ...render(
      <AuthContext.Provider value={contextValue}>
        <MemoryRouter initialEntries={['/login']}>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/" element={<div>Dashboard</div>} />
          </Routes>
        </MemoryRouter>
      </AuthContext.Provider>
    ),
  };
}

test('renders email input, password input, and sign in button (AC2)', () => {
  renderLoginPage();
  expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
  expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument();
});

test('redirects to dashboard on successful login (AC3)', async () => {
  const { loginFn } = renderLoginPage();

  fireEvent.change(screen.getByLabelText(/email/i), {
    target: { value: 'admin@example.com' },
  });
  fireEvent.change(screen.getByLabelText(/password/i), {
    target: { value: 'password123' },
  });
  fireEvent.click(screen.getByRole('button', { name: /sign in/i }));

  await waitFor(() => {
    expect(loginFn).toHaveBeenCalledWith('admin@example.com', 'password123');
  });
  // navigate('/') renders the Dashboard route
  expect(await screen.findByText('Dashboard')).toBeInTheDocument();
});

test('shows inline error on failed login (AC4)', async () => {
  renderLoginPage(vi.fn().mockRejectedValue(new Error('401')));

  fireEvent.change(screen.getByLabelText(/email/i), {
    target: { value: 'bad@example.com' },
  });
  fireEvent.change(screen.getByLabelText(/password/i), {
    target: { value: 'wrongpassword' },
  });
  fireEvent.click(screen.getByRole('button', { name: /sign in/i }));

  expect(
    await screen.findByRole('alert')
  ).toHaveTextContent('Check your email or password');
});

test('password value is preserved after failed login (AC4)', async () => {
  renderLoginPage(vi.fn().mockRejectedValue(new Error('401')));

  fireEvent.change(screen.getByLabelText(/password/i), {
    target: { value: 'mypassword' },
  });
  fireEvent.click(screen.getByRole('button', { name: /sign in/i }));

  await screen.findByRole('alert');
  expect(screen.getByLabelText(/password/i)).toHaveValue('mypassword');
});

test('button is disabled while request is in-flight (AC5)', async () => {
  let resolveLogin!: () => void;
  const pendingLogin = vi.fn().mockImplementation(
    () => new Promise<void>((resolve) => { resolveLogin = resolve; })
  );
  renderLoginPage(pendingLogin);

  fireEvent.change(screen.getByLabelText(/email/i), {
    target: { value: 'admin@example.com' },
  });
  fireEvent.change(screen.getByLabelText(/password/i), {
    target: { value: 'password123' },
  });
  fireEvent.click(screen.getByRole('button'));

  // Button should be disabled while loading (text changes to "Signing in…")
  expect(screen.getByRole('button')).toBeDisabled();

  // Resolve the promise and confirm button re-enables
  resolveLogin();
  await waitFor(() => {
    expect(screen.getByRole('button', { name: /sign in/i })).not.toBeDisabled();
  });
});
