import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './hooks/useAuth';
import Login          from './pages/Login';
import Dashboard      from './pages/Dashboard';
import CoordinatorApp from './pages/CoordinatorApp';

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
      case 'super_admin':
      case 'director':
      case 'regional_mgr':
      case 'admin':
        return <Dashboard />;
      case 'ceo':
        return <Dashboard />;
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
