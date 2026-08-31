import { Navigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { HomeworkFeedPage } from './student/HomeworkFeedPage';
import { TeacherDashboardPage } from './teacher/TeacherDashboardPage';
import { BranchAssignmentsPage } from './branch/BranchAssignmentsPage';

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
      return <Navigate to="/setup" replace />;
    default:
      return <Navigate to="/login" replace />;
  }
}
