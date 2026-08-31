import { useQuery } from '@tanstack/react-query';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { api } from '../api/client';
import { HomeworkFeedPage } from './student/HomeworkFeedPage';
import { TeacherDashboardPage } from './teacher/TeacherDashboardPage';
import { BranchAssignmentsPage } from './branch/BranchAssignmentsPage';
import { AdminDashboardPage } from './admin/AdminDashboardPage';

function SuperAdminHome() {
  // Setup itself is public until first-run completes, and locked to
  // SUPER_ADMIN afterwards — so this check only ever runs once we know
  // we're authenticated as one.
  const { data, isLoading } = useQuery({
    queryKey: ['setup-state'],
    queryFn: async () => (await api.get<{ completed: boolean }>('/setup/state')).data,
  });
  if (isLoading) return <div className="p-10 text-center text-sm text-slate-400">Loading…</div>;
  return data?.completed ? <AdminDashboardPage /> : <Navigate to="/setup" replace />;
}

export function RoleHome() {
  const { user } = useAuth();
  switch (user?.role) {
    case 'STUDENT':
      return <HomeworkFeedPage />;
    case 'TEACHER':
      return <TeacherDashboardPage />;
    case 'BRANCH_HEAD':
      return <BranchAssignmentsPage />;
    case 'SUPER_ADMIN':
      return <SuperAdminHome />;
    default:
      return <Navigate to="/login" replace />;
  }
}
