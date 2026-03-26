import { BrowserRouter, Routes, Route, NavLink, Navigate, useSearchParams, useNavigate } from 'react-router-dom';
import { useEffect } from 'react';
import { AuthProvider, useAuth } from './hooks/useAuth';
import Login from './components/Login';
import ChatWidget from './components/ChatWidget';
import TicketList from './components/TicketList';
import AdminPanel from './components/AdminPanel';
import AnalyticsDashboard from './components/Analytics';
import HRDashboard from './components/HRDashboard';
import UserManagement from './components/UserManagement';

const NAV_STYLES = {
  nav: { background: '#fff', borderBottom: '1px solid #f0f0f0', padding: '0 24px', display: 'flex', alignItems: 'center', height: 60, position: 'sticky', top: 0, zIndex: 100, boxShadow: '0 1px 8px rgba(0,0,0,0.04)' },
  logo: { fontWeight: 800, fontSize: 18, color: '#6c63ff', marginRight: 32, textDecoration: 'none' },
  links: { display: 'flex', gap: 4, flex: 1 },
  link: { padding: '6px 14px', borderRadius: 8, fontSize: 14, fontWeight: 500, textDecoration: 'none', color: '#6b7280', transition: 'all 0.15s' },
  activeLink: { background: '#f0eeff', color: '#6c63ff', fontWeight: 600 },
  user: { display: 'flex', alignItems: 'center', gap: 10, fontSize: 14 },
  avatar: { width: 32, height: 32, borderRadius: '50%', background: '#6c63ff', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 13 },
  logoutBtn: { background: 'none', border: '1px solid #e5e7eb', borderRadius: 8, padding: '5px 12px', cursor: 'pointer', fontSize: 13, color: '#6b7280' },
};

function NavBar() {
  const { user, logout } = useAuth();
  const isHR = ['hrbp', 'px_lead', 'admin'].includes(user?.role);

  return (
    <nav style={NAV_STYLES.nav}>
      <NavLink to="/" style={NAV_STYLES.logo}>🤖 HR Assistant</NavLink>
      <div style={NAV_STYLES.links}>
        <NavLink to="/chat" style={({ isActive }) => ({ ...NAV_STYLES.link, ...(isActive ? NAV_STYLES.activeLink : {}) })}>Chat</NavLink>
        <NavLink to="/tickets" style={({ isActive }) => ({ ...NAV_STYLES.link, ...(isActive ? NAV_STYLES.activeLink : {}) })}>My Tickets</NavLink>
        {isHR && <NavLink to="/dashboard" style={({ isActive }) => ({ ...NAV_STYLES.link, ...(isActive ? NAV_STYLES.activeLink : {}) })}>Dashboard</NavLink>}
        {isHR && <NavLink to="/knowledge" style={({ isActive }) => ({ ...NAV_STYLES.link, ...(isActive ? NAV_STYLES.activeLink : {}) })}>Knowledge Base</NavLink>}
        {isHR && <NavLink to="/analytics" style={({ isActive }) => ({ ...NAV_STYLES.link, ...(isActive ? NAV_STYLES.activeLink : {}) })}>Analytics</NavLink>}
        {user?.role === 'admin' && <NavLink to="/users" style={({ isActive }) => ({ ...NAV_STYLES.link, ...(isActive ? NAV_STYLES.activeLink : {}) })}>Users</NavLink>}
      </div>
      <div style={NAV_STYLES.user}>
        <div style={NAV_STYLES.avatar}>{user?.name?.[0]?.toUpperCase()}</div>
        <span style={{ color: '#374151' }}>{user?.name}</span>
        <span style={{ background: '#f0eeff', color: '#6c63ff', borderRadius: 6, padding: '2px 8px', fontSize: 11, fontWeight: 600 }}>{user?.role}</span>
        <button style={NAV_STYLES.logoutBtn} onClick={logout}>Sign out</button>
      </div>
    </nav>
  );
}

function ProtectedRoute({ children, minRole }) {
  const { user, loading } = useAuth();
  if (loading) return <div style={{ textAlign: 'center', padding: 60, color: '#9ca3af' }}>Loading...</div>;
  if (!user) return <Navigate to="/login" replace />;
  const HIERARCHY = { employee: 1, hrbp: 2, px_lead: 3, admin: 4 };
  if (minRole && (HIERARCHY[user.role] || 0) < (HIERARCHY[minRole] || 0)) {
    return <div style={{ padding: 40, textAlign: 'center', color: '#ef4444' }}>Access denied.</div>;
  }
  return children;
}

function AppLayout({ children }) {
  return (
    <div style={{ minHeight: '100vh', background: '#f5f6fa' }}>
      <NavBar />
      <main>{children}</main>
    </div>
  );
}

function ChatPage() {
  return (
    <div style={{ maxWidth: 700, margin: '40px auto', padding: '0 16px', height: 'calc(100vh - 140px)' }}>
      <ChatWidget />
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginGate />} />
          <Route path="/auth/callback" element={<AuthCallback />} />
          <Route path="/dashboard" element={
            <ProtectedRoute minRole="hrbp">
              <AppLayout><HRDashboard /></AppLayout>
            </ProtectedRoute>
          } />
          <Route path="/chat" element={
            <ProtectedRoute>
              <AppLayout><ChatPage /></AppLayout>
            </ProtectedRoute>
          } />
          <Route path="/tickets" element={
            <ProtectedRoute>
              <AppLayout><TicketList /></AppLayout>
            </ProtectedRoute>
          } />
          <Route path="/knowledge" element={
            <ProtectedRoute minRole="hrbp">
              <AppLayout><AdminPanel /></AppLayout>
            </ProtectedRoute>
          } />
          <Route path="/analytics" element={
            <ProtectedRoute minRole="hrbp">
              <AppLayout><AnalyticsDashboard /></AppLayout>
            </ProtectedRoute>
          } />
          <Route path="/users" element={
            <ProtectedRoute minRole="admin">
              <AppLayout><UserManagement /></AppLayout>
            </ProtectedRoute>
          } />
          <Route path="*" element={<DefaultRedirect />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

function LoginGate() {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (user) {
    const isHR = ['hrbp', 'px_lead', 'admin'].includes(user.role);
    return <Navigate to={isHR ? '/dashboard' : '/chat'} replace />;
  }
  return <Login />;
}

// Handles the redirect back from Google OAuth — extracts token and stores it
function AuthCallback() {
  const [searchParams] = useSearchParams();

  useEffect(() => {
    const token = searchParams.get('token');
    if (token) {
      localStorage.setItem('hr_token', token);
      // Decode role from JWT payload to pick the right landing page
      try {
        const payload = JSON.parse(atob(token.split('.')[1]));
        const isHR = ['hrbp', 'px_lead', 'admin'].includes(payload?.role);
        window.location.replace(isHR ? '/dashboard' : '/chat');
      } catch {
        window.location.replace('/chat');
      }
    } else {
      window.location.replace('/login?error=google_failed');
    }
  }, []);

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f5f6fa' }}>
      <div style={{ textAlign: 'center', color: '#6b7280' }}>
        <div style={{ fontSize: 32, marginBottom: 12 }}>🔄</div>
        <div>Signing you in...</div>
      </div>
    </div>
  );
}

function DefaultRedirect() {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (!user) return <Navigate to="/login" replace />;
  const isHR = ['hrbp', 'px_lead', 'admin'].includes(user.role);
  return <Navigate to={isHR ? '/dashboard' : '/chat'} replace />;
}
