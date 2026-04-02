import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from '@/context/AuthContext';
import { ProtectedRoute } from '@/components/shared/ProtectedRoute';
import { AppShell } from '@/components/shared/AppShell';
import { LoginPage } from '@/pages/LoginPage';
import { JobDescriptionsPage } from '@/pages/JobDescriptionsPage';
import { AnalysisPage } from '@/pages/AnalysisPage';
import { HistoryPage } from '@/pages/HistoryPage';
import { CandidatesPage } from '@/pages/CandidatesPage';
import { DashboardPage } from '@/pages/DashboardPage';
import { AdminPage } from '@/pages/AdminPage';

const queryClient = new QueryClient();

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            {/* Public route — no sidebar, no auth guard */}
            <Route path="/login" element={<LoginPage />} />

            {/* Protected route group — auth guard wraps all app routes */}
            <Route element={<ProtectedRoute />}>
              {/* AppShell provides sidebar + main layout for all authenticated pages */}
              <Route element={<AppShell />}>
                <Route path="/" element={<DashboardPage />} />
                <Route path="/analysis" element={<AnalysisPage />} />
                <Route path="/history" element={<HistoryPage />} />
                <Route
                  path="/job-descriptions"
                  element={<JobDescriptionsPage />}
                />
                <Route path="/candidates" element={<CandidatesPage />} />
                <Route path="/admin" element={<AdminPage />} />
              </Route>
            </Route>

            {/* Catch-all — redirect unknown paths to protected area */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  );
}

export default App;
