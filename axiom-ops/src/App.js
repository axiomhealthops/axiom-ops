import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './hooks/useAuth';
import Login              from './pages/Login';
import Dashboard          from './pages/Dashboard';
import CoordinatorApp     from './pages/CoordinatorApp';
import MissionControlApp  from './pages/MissionControlApp';

function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return (
    <div style={{ minHeight:'100vh', background:'#0F1117', display:'flex', alignItems:'center',
      justifyContent:'center', color:'rgba(255,255,255,0.4)', fontFamily:'DM Sans,sans-serif', fontSize:14 }}>
      Loading AxiomHealth...
    </div>
  );
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

function AppRoutes() {
  const { profile, loading } = useAuth();
  if (loading) return null;

  const role = profile?.role || 'coordinator';

  const renderApp = () => {
    switch(role) {
      // Full platform dashboard
      case 'super_admin':
      case 'ceo':
      case 'director':
      case 'regional_mgr':
      case 'admin':
        return <Dashboard />;
      // Pod leader — full dashboard (same shell, filtered sidebar)
      case 'pod_leader':
        return <Dashboard />;
      // Mission Control team roles — stripped shell, scoped to their team
      case 'team_leader':
      case 'team_member':
        return <MissionControlApp />;
      // Legacy field coordinator
      case 'coordinator':
      default:
        return <CoordinatorApp />;
    }
  };

  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/*" element={<ProtectedRoute>{renderApp()}</ProtectedRoute>} />
    </Routes>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </AuthProvider>
  );
}
