import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './auth/AuthContext';
import { ProtectedRoute } from './components/ProtectedRoute';
import { LoginPage } from './pages/auth/LoginPage';
import { ChangePasswordPage } from './pages/auth/ChangePasswordPage';
import { HomeworkDetailPage } from './pages/student/HomeworkDetailPage';
import { RoleHome } from './pages/RoleHome';
import { AdminDashboardPage } from './pages/admin/AdminDashboardPage';
import { SetupWizardPage } from './pages/setup/SetupWizardPage';

const queryClient = new QueryClient();

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/setup" element={<SetupWizardPage />} />
            {/* Not wrapped in ProtectedRoute: that component redirects here
                whenever mustChangePassword is set, so wrapping it would loop. */}
            <Route path="/change-password" element={<ChangePasswordPage />} />
            <Route
              path="/"
              element={
                <ProtectedRoute>
                  <RoleHome />
                </ProtectedRoute>
              }
            />
            <Route
              path="/homework/:id"
              element={
                <ProtectedRoute roles={['STUDENT']}>
                  <HomeworkDetailPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin"
              element={
                <ProtectedRoute roles={['SUPER_ADMIN']}>
                  <AdminDashboardPage />
                </ProtectedRoute>
              }
            />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </QueryClientProvider>
  );
}
