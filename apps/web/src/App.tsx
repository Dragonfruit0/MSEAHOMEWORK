import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './auth/AuthContext';
import { ProtectedRoute } from './components/ProtectedRoute';
import { LoginPage } from './pages/auth/LoginPage';
import { ChangePasswordPage } from './pages/auth/ChangePasswordPage';
import { HomeworkDetailPage } from './pages/student/HomeworkDetailPage';
import { RoleHome } from './pages/RoleHome';
import { AdminDashboardPage } from './pages/admin/AdminDashboardPage';
import { TeacherSubmissionsPage } from './pages/teacher/TeacherSubmissionsPage';
import { SetupWizardPage } from './pages/setup/SetupWizardPage';
import { CalendarPage } from './pages/CalendarPage';
import { ProfilePage } from './pages/ProfilePage';
import { GuidePage } from './pages/GuidePage';

const queryClient = new QueryClient();

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/guide" element={<GuidePage />} />
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
            <Route
              path="/teacher/homework/:id/submissions"
              element={
                <ProtectedRoute roles={['TEACHER']}>
                  <TeacherSubmissionsPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/calendar"
              element={
                <ProtectedRoute roles={['STUDENT', 'TEACHER']}>
                  <CalendarPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/profile"
              element={
                <ProtectedRoute roles={['STUDENT', 'TEACHER']}>
                  <ProfilePage />
                </ProtectedRoute>
              }
            />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </QueryClientProvider>
  );
}
