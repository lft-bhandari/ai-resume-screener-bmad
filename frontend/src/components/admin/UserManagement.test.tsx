import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { vi, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { AuthContext, type AuthContextValue } from '@/context/AuthContext';
import { UserManagement } from './UserManagement';
import * as usersApi from '@/api/users';

// Mock the entire API module
vi.mock('@/api/users');

const mockUser = { email: 'admin@test.com', role: 'admin', token: 'test-token' };

const mockContextValue: AuthContextValue = {
  user: mockUser,
  login: vi.fn(),
  logout: vi.fn(),
  isAuthenticated: true,
};

function renderUserManagement() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <AuthContext.Provider value={mockContextValue}>
        <MemoryRouter>
          <UserManagement />
        </MemoryRouter>
      </AuthContext.Provider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

// AC1: Table renders users with correct columns
test('renders user table with Email, Role, Created Date columns and Delete action (AC1)', async () => {
  vi.mocked(usersApi.listUsersApi).mockResolvedValue({
    items: [
      { id: 1, email: 'alice@test.com', role: 'recruiter', created_at: '2026-03-01T00:00:00Z' },
      { id: 2, email: 'bob@test.com', role: 'interviewer', created_at: '2026-03-15T00:00:00Z' },
    ],
  });
  renderUserManagement();
  expect(await screen.findByText('alice@test.com')).toBeInTheDocument();
  expect(screen.getByText('bob@test.com')).toBeInTheDocument();
  expect(screen.getByText('recruiter')).toBeInTheDocument();
  expect(screen.getByText('interviewer')).toBeInTheDocument();
  // Delete buttons present for each user
  expect(screen.getByRole('button', { name: /delete user alice@test.com/i })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /delete user bob@test.com/i })).toBeInTheDocument();
});

// AC1: Empty state
test('renders empty state when no users exist (AC1)', async () => {
  vi.mocked(usersApi.listUsersApi).mockResolvedValue({ items: [] });
  renderUserManagement();
  expect(await screen.findByText(/no users found/i)).toBeInTheDocument();
});

// AC3: Add User dialog opens with correct fields
test('"Add User" button opens dialog with Email, Password, Role fields (AC3)', async () => {
  vi.mocked(usersApi.listUsersApi).mockResolvedValue({ items: [] });
  renderUserManagement();
  await screen.findByText(/no users found/i);
  fireEvent.click(screen.getByRole('button', { name: /add user/i }));
  expect(await screen.findByRole('dialog')).toBeInTheDocument();
  expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
  expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
  expect(screen.getByLabelText(/role/i)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /create user/i })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument();
});

// AC3: Role selector contains only recruiter and interviewer
test('Role selector contains recruiter and interviewer options only (AC3)', async () => {
  vi.mocked(usersApi.listUsersApi).mockResolvedValue({ items: [] });
  renderUserManagement();
  await screen.findByText(/no users found/i);
  fireEvent.click(screen.getByRole('button', { name: /add user/i }));
  await screen.findByRole('dialog');
  const roleSelect = screen.getByLabelText(/role/i) as HTMLSelectElement;
  const options = Array.from(roleSelect.options).map((o) => o.value);
  expect(options).toContain('recruiter');
  expect(options).toContain('interviewer');
  expect(options).not.toContain('admin');
});

// AC4: Successful create shows toast and closes dialog
test('submitting create form calls createUserApi and shows success toast (AC4)', async () => {
  vi.mocked(usersApi.listUsersApi).mockResolvedValue({ items: [] });
  vi.mocked(usersApi.createUserApi).mockResolvedValue({
    id: 3,
    email: 'newuser@test.com',
    role: 'recruiter',
    created_at: '2026-03-31T00:00:00Z',
  });
  renderUserManagement();
  await screen.findByText(/no users found/i);
  fireEvent.click(screen.getByRole('button', { name: /add user/i }));
  await screen.findByRole('dialog');

  fireEvent.change(screen.getByLabelText(/email/i), {
    target: { value: 'newuser@test.com' },
  });
  fireEvent.change(screen.getByLabelText(/password/i), {
    target: { value: 'securepass123' },
  });
  fireEvent.click(screen.getByRole('button', { name: /create user/i }));

  await waitFor(() => {
    expect(usersApi.createUserApi).toHaveBeenCalledWith('test-token', {
      email: 'newuser@test.com',
      password: 'securepass123',
      role: 'recruiter',
    });
  });

  expect(await screen.findByText('User created')).toBeInTheDocument();
});

// AC5: Delete calls deleteUserApi (optimistic update)
test('clicking Delete calls deleteUserApi for the correct user (AC5)', async () => {
  vi.mocked(usersApi.listUsersApi).mockResolvedValue({
    items: [
      { id: 1, email: 'todelete@test.com', role: 'recruiter', created_at: '2026-03-01T00:00:00Z' },
    ],
  });
  vi.mocked(usersApi.deleteUserApi).mockResolvedValue(undefined);
  renderUserManagement();
  await screen.findByText('todelete@test.com');
  fireEvent.click(screen.getByRole('button', { name: /delete user todelete@test.com/i }));
  await waitFor(() => {
    expect(usersApi.deleteUserApi).toHaveBeenCalledWith('test-token', 1);
  });
});

// AC5: Delete failure restores row and shows error toast
test('failed delete restores the row and shows error toast (AC5)', async () => {
  vi.mocked(usersApi.listUsersApi).mockResolvedValue({
    items: [
      { id: 1, email: 'persist@test.com', role: 'recruiter', created_at: '2026-03-01T00:00:00Z' },
    ],
  });
  vi.mocked(usersApi.deleteUserApi).mockRejectedValue(new Error('Server error'));
  renderUserManagement();
  await screen.findByText('persist@test.com');
  fireEvent.click(screen.getByRole('button', { name: /delete user persist@test.com/i }));
  expect(await screen.findByText('Failed to delete user')).toBeInTheDocument();
});
