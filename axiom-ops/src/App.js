import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './hooks/useAuth';
import Login from './pages/Login';
import DirectorDashboard from './pages/DirectorDashboard';
import CoordinatorReport from './pages/CoordinatorReport';

function ProtectedRoute({ children, requireRole }) {
  const { user, coordinator, loading } = useAuth();

  if (loading) return (
    <div style={{
      minHeight: '100vh', background: '#070B12',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      color: 'rgba(255,255,255,0.4)', fontFamily: 'DM Sans, sans-serif', fontSize: 14
    }}>Loading...</div>
  );

  if (!user) return <Navigate to="/login" replace />;
  if (requireRole && coordinator?.role !== requireRole) return <Navigate to="/" replace />;

  return children;
}

function AppRoutes() {
  const { coordinator, loading } = useAuth();

  if (loading) return null;

  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/" element={
        <ProtectedRoute>
          {coordinator?.role === 'director'
            ? <DirectorDashboard />
            : <CoordinatorReport />}
        </ProtectedRoute>
      } />
      <Route path="/dashboard" element={
        <ProtectedRoute requireRole="director">
          <DirectorDashboard />
        </ProtectedRoute>
      } />
      <Route path="/report" element={
        <ProtectedRoute>
          <CoordinatorReport />
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
