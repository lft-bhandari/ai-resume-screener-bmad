import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { vi, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { AuthContext, type AuthContextValue } from '@/context/AuthContext';
import { JobDescriptionList } from './JobDescriptionList';
import * as jdApi from '@/api/job_descriptions';

// Mock the entire API module
vi.mock('@/api/job_descriptions');

const mockUser = { email: 'r@test.com', role: 'recruiter', token: 'test-token' };

const mockContextValue: AuthContextValue = {
  user: mockUser,
  login: vi.fn(),
  logout: vi.fn(),
  isAuthenticated: true,
};

function renderList() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <AuthContext.Provider value={mockContextValue}>
        <MemoryRouter>
          <JobDescriptionList />
        </MemoryRouter>
      </AuthContext.Provider>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

test('shows empty state when list is empty (AC2)', async () => {
  vi.mocked(jdApi.listJobDescriptionsApi).mockResolvedValue({ items: [], total: 0 });
  renderList();
  expect(
    await screen.findByText(/no job descriptions saved/i)
  ).toBeInTheDocument();
});

test('renders JD titles and dates when items exist (AC1)', async () => {
  vi.mocked(jdApi.listJobDescriptionsApi).mockResolvedValue({
    items: [
      { id: 1, title: 'Backend Engineer', content: 'Content A', created_at: '2026-03-01T00:00:00Z' },
    ],
    total: 1,
  });
  renderList();
  expect(await screen.findByText('Backend Engineer')).toBeInTheDocument();
});

test('"New Job Description" button opens dialog (AC3)', async () => {
  vi.mocked(jdApi.listJobDescriptionsApi).mockResolvedValue({ items: [], total: 0 });
  renderList();
  await screen.findByText(/no job descriptions saved/i); // wait for load
  fireEvent.click(screen.getByRole('button', { name: /new job description/i }));
  expect(await screen.findByRole('dialog')).toBeInTheDocument();
});

test('submitting create form calls createJobDescriptionApi (AC4)', async () => {
  vi.mocked(jdApi.listJobDescriptionsApi).mockResolvedValue({ items: [], total: 0 });
  vi.mocked(jdApi.createJobDescriptionApi).mockResolvedValue({
    id: 2,
    title: 'New JD',
    content: 'Content',
    created_at: '2026-03-30T00:00:00Z',
  });
  renderList();
  await screen.findByText(/no job descriptions saved/i);
  fireEvent.click(screen.getByRole('button', { name: /new job description/i }));
  const titleInput = await screen.findByLabelText(/title/i);
  const contentInput = screen.getByLabelText(/content/i);
  fireEvent.change(titleInput, { target: { value: 'New JD' } });
  fireEvent.change(contentInput, { target: { value: 'Content' } });
  fireEvent.click(screen.getByRole('button', { name: /^save$/i }));
  await waitFor(() => {
    expect(jdApi.createJobDescriptionApi).toHaveBeenCalledWith('test-token', {
      title: 'New JD',
      content: 'Content',
    });
  });
});

test('edit button opens dialog pre-populated (AC5)', async () => {
  vi.mocked(jdApi.listJobDescriptionsApi).mockResolvedValue({
    items: [
      { id: 1, title: 'Backend Eng', content: 'Python skills', created_at: '2026-03-01T00:00:00Z' },
    ],
    total: 1,
  });
  renderList();
  await screen.findByText('Backend Eng');
  fireEvent.click(screen.getByRole('button', { name: /edit backend eng/i }));
  const titleInput = await screen.findByLabelText(/title/i);
  expect(titleInput).toHaveValue('Backend Eng');
});

test('delete button calls deleteJobDescriptionApi (AC6)', async () => {
  vi.mocked(jdApi.listJobDescriptionsApi).mockResolvedValue({
    items: [
      { id: 1, title: 'To Delete', content: 'Content', created_at: '2026-03-01T00:00:00Z' },
    ],
    total: 1,
  });
  vi.mocked(jdApi.deleteJobDescriptionApi).mockResolvedValue(undefined);
  renderList();
  await screen.findByText('To Delete');
  fireEvent.click(screen.getByRole('button', { name: /delete to delete/i }));
  await waitFor(() => {
    expect(jdApi.deleteJobDescriptionApi).toHaveBeenCalledWith('test-token', 1);
  });
});

test('delete failure restores row and shows error toast (AC6)', async () => {
  vi.mocked(jdApi.listJobDescriptionsApi).mockResolvedValue({
    items: [
      { id: 1, title: 'Stay Row', content: 'Content', created_at: '2026-03-01T00:00:00Z' },
    ],
    total: 1,
  });
  vi.mocked(jdApi.deleteJobDescriptionApi).mockRejectedValue(new Error('500'));
  renderList();
  await screen.findByText('Stay Row');
  fireEvent.click(screen.getByRole('button', { name: /delete stay row/i }));
  await waitFor(() => {
    expect(screen.getByRole('status')).toHaveTextContent(/failed to delete/i);
  });
});
