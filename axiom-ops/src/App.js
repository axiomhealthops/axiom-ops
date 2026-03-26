import { BrowserRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { useEffect } from 'react';
import { AuthProvider, useAuth } from './hooks/useAuth';
import Login             from './pages/Login';
import Dashboard         from './pages/Dashboard';
import CoordinatorApp    from './pages/CoordinatorApp';
import MissionControlApp from './pages/MissionControlApp';

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

function LoginRoute() {
  const { user, profile, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && user && profile) {
      navigate('/', { replace: true });
    }
  }, [user, profile, loading, navigate]);

  if (loading) return (
    <div style={{ minHeight:'100vh', background:'#F6F0EE', display:'flex', alignItems:'center',
      justifyContent:'center', color:'#999', fontFamily:'DM Sans,sans-serif', fontSize:14 }}>
      Loading...
    </div>
  );

  return <Login />;
}

function AppRoutes() {
  const { profile, loading } = useAuth();
  if (loading) return (
    <div style={{ minHeight:'100vh', background:'#0F1117', display:'flex', alignItems:'center',
      justifyContent:'center', color:'rgba(255,255,255,0.4)', fontFamily:'DM Sans,sans-serif', fontSize:14 }}>
      Loading AxiomHealth...
    </div>
  );

  const role = profile?.role || 'coordinator';

  const renderApp = () => {
    switch(role) {
      case 'super_admin':
      case 'ceo':
      case 'director':
      case 'regional_mgr':
      case 'admin':
      case 'pod_leader':
        return <Dashboard />;
      case 'team_leader':
      case 'team_member':
        return <MissionControlApp />;
      case 'coordinator':
      default:
        return <CoordinatorApp />;
    }
  };

  return (
    <Routes>
      <Route path="/login" element={<LoginRoute />} />
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
