import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import api from '../../services/api';

const S = {
  page: { padding: '32px 40px', maxWidth: 1100, margin: '0 auto' },
  greeting: { marginBottom: 32 },
  greetingName: { fontSize: 26, fontWeight: 800, color: '#1f2937', marginBottom: 4 },
  greetingRole: { fontSize: 14, color: '#6b7280' },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 32 },
  card: { background: '#fff', borderRadius: 14, padding: '20px 24px', boxShadow: '0 1px 6px rgba(0,0,0,0.06)' },
  statNum: { fontSize: 32, fontWeight: 800, color: '#1f2937', lineHeight: 1 },
  statLabel: { fontSize: 13, color: '#6b7280', marginTop: 6 },
  statDot: { width: 8, height: 8, borderRadius: '50%', display: 'inline-block', marginRight: 6 },
  row: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 32 },
  sectionTitle: { fontSize: 15, fontWeight: 700, color: '#374151', marginBottom: 16 },
  ticketRow: { display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: '1px solid #f3f4f6', cursor: 'pointer' },
  ticketId: { fontSize: 12, color: '#9ca3af', width: 70, flexShrink: 0 },
  ticketTitle: { flex: 1, fontSize: 13, color: '#374151', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  badge: (c) => ({ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 6, background: c.bg, color: c.text, flexShrink: 0 }),
  quickGrid: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 },
  quickBtn: { background: '#f9fafb', border: '1.5px solid #e5e7eb', borderRadius: 12, padding: '18px 20px', cursor: 'pointer', textAlign: 'left', transition: 'all 0.15s' },
  quickIcon: { fontSize: 22, marginBottom: 8 },
  quickLabel: { fontSize: 13, fontWeight: 700, color: '#1f2937', marginBottom: 2 },
  quickSub: { fontSize: 12, color: '#9ca3af' },
  escalBadge: { background: '#fef2f2', color: '#ef4444', borderRadius: 6, padding: '2px 8px', fontSize: 11, fontWeight: 700 },
  emptyState: { textAlign: 'center', padding: '32px 16px', color: '#9ca3af', fontSize: 13 },
};

const STATUS_COLORS = {
  open:        { bg: '#eff6ff', text: '#2563eb' },
  in_progress: { bg: '#fef9c3', text: '#ca8a04' },
  escalated:   { bg: '#fef2f2', text: '#ef4444' },
  resolved:    { bg: '#f0fdf4', text: '#16a34a' },
  closed:      { bg: '#f3f4f6', text: '#6b7280' },
};

function StatCard({ num, label, dotColor }) {
  return (
    <div style={S.card}>
      <div style={S.statNum}>{num ?? '—'}</div>
      <div style={S.statLabel}>
        {dotColor && <span style={{ ...S.statDot, background: dotColor }} />}
        {label}
      </div>
    </div>
  );
}

export default function HRDashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [summary, setSummary] = useState(null);
  const [recentTickets, setRecentTickets] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.get('/analytics/summary'),
      api.get('/tickets?limit=8&sort=created_at&order=desc'),
    ])
      .then(([s, t]) => {
        setSummary(s.data);
        setRecentTickets(t.data?.tickets || t.data || []);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const ov = summary?.overview;
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

  return (
    <div style={S.page}>
      {/* Greeting */}
      <div style={S.greeting}>
        <div style={S.greetingName}>{greeting}, {user?.name?.split(' ')[0]} 👋</div>
        <div style={S.greetingRole}>HR Dashboard · {new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })}</div>
      </div>

      {/* Stat cards */}
      <div style={S.grid}>
        <StatCard num={ov?.total_tickets} label="Total Tickets" dotColor="#6c63ff" />
        <StatCard num={ov?.open_tickets} label="Open" dotColor="#2563eb" />
        <StatCard num={ov?.escalated_tickets} label="Escalated" dotColor="#ef4444" />
        <StatCard num={ov?.avg_resolution_days != null ? `${parseFloat(ov.avg_resolution_days).toFixed(1)}d` : null} label="Avg Resolution" dotColor="#16a34a" />
      </div>

      {/* Recent tickets + top categories */}
      <div style={S.row}>
        {/* Recent tickets */}
        <div style={S.card}>
          <div style={S.sectionTitle}>Recent Tickets</div>
          {loading ? (
            <div style={S.emptyState}>Loading...</div>
          ) : recentTickets.length === 0 ? (
            <div style={S.emptyState}>No tickets yet</div>
          ) : recentTickets.slice(0, 8).map((t) => (
            <div key={t.id} style={S.ticketRow} onClick={() => navigate('/tickets')}>
              <span style={S.ticketId}>#{t.ticket_number}</span>
              <span style={S.ticketTitle}>{t.description?.slice(0, 60) || 'Untitled'}</span>
              <span style={S.badge(STATUS_COLORS[t.status] || STATUS_COLORS.open)}>{t.status?.replace('_', ' ')}</span>
            </div>
          ))}
          <div style={{ marginTop: 12, textAlign: 'right' }}>
            <button onClick={() => navigate('/tickets')} style={{ background: 'none', border: 'none', color: '#6c63ff', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
              View all tickets →
            </button>
          </div>
        </div>

        {/* Top categories */}
        <div style={S.card}>
          <div style={S.sectionTitle}>Tickets by Category</div>
          {loading ? (
            <div style={S.emptyState}>Loading...</div>
          ) : !summary?.by_category?.length ? (
            <div style={S.emptyState}>No data yet</div>
          ) : summary.by_category.slice(0, 7).map((c) => {
            const total = summary.by_category.reduce((s, x) => s + parseInt(x.count), 0) || 1;
            const pct = Math.round((parseInt(c.count) / total) * 100);
            return (
              <div key={c.category} style={{ marginBottom: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 4 }}>
                  <span style={{ color: '#374151', fontWeight: 500 }}>{c.category}</span>
                  <span style={{ color: '#9ca3af' }}>{c.count}</span>
                </div>
                <div style={{ background: '#f3f4f6', borderRadius: 4, height: 6 }}>
                  <div style={{ background: '#6c63ff', width: `${pct}%`, height: '100%', borderRadius: 4, transition: 'width 0.5s' }} />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Quick actions */}
      <div style={S.card}>
        <div style={S.sectionTitle}>Quick Actions</div>
        <div style={S.quickGrid}>
          {[
            { icon: '🎫', label: 'All Tickets', sub: 'Review and manage employee tickets', path: '/tickets' },
            { icon: '📚', label: 'Knowledge Base', sub: 'Update FAQs, policies, HR docs', path: '/knowledge' },
            { icon: '📊', label: 'Analytics', sub: 'Deep-dive into ticket trends', path: '/analytics' },
            { icon: '💬', label: 'Chat as Employee', sub: 'Test the HR assistant yourself', path: '/chat' },
            { icon: '⚡', label: 'Escalated Tickets', sub: `${ov?.escalated_tickets || 0} tickets need attention`, path: '/tickets?status=escalated' },
            { icon: '✅', label: 'Pending Closure', sub: 'Tickets resolved but not closed', path: '/tickets?status=resolved' },
          ].map((q) => (
            <button
              key={q.label}
              style={S.quickBtn}
              onClick={() => navigate(q.path)}
              onMouseEnter={e => { e.currentTarget.style.borderColor = '#6c63ff'; e.currentTarget.style.background = '#faf9ff'; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = '#e5e7eb'; e.currentTarget.style.background = '#f9fafb'; }}
            >
              <div style={S.quickIcon}>{q.icon}</div>
              <div style={S.quickLabel}>{q.label}</div>
              <div style={S.quickSub}>{q.sub}</div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
