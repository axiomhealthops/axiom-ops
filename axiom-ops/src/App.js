import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './hooks/useAuth';
import Login         from './pages/Login';
import Dashboard     from './pages/Dashboard';
import CoordinatorApp from './pages/CoordinatorApp';

function ProtectedRoute({ children, allowed }) {
  const { user, profile, loading } = useAuth();
  if (loading) return (
    <div style={{ minHeight:'100vh', background:'#0F1117', display:'flex', alignItems:'center',
      justifyContent:'center', color:'rgba(255,255,255,0.4)', fontFamily:'DM Sans,sans-serif', fontSize:14 }}>
      Loading AxiomHealth...
    </div>
  );
  if (!user) return <Navigate to="/login" replace />;
  if (allowed && profile && !allowed.includes(profile.role)) return <Navigate to="/" replace />;
  return children;
}

function AppRoutes() {
  const { profile, loading } = useAuth();
  if (loading) return null;

  const role = profile?.role || 'coordinator';
  const isDashboardUser = ['super_admin','ceo','director','regional_mgr','admin'].includes(role);

  return (
    <Routes>
      <Route path="/login" element={<Login />} />

      {/* Main app â€” role determines what they see */}
      <Route path="/*" element={
        <ProtectedRoute>
          {isDashboardUser ? <Dashboard /> : <CoordinatorApp />}
        </ProtectedRoute>
      } />

      <Route path="*" element={<Navigate to="/" replace />} />
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
