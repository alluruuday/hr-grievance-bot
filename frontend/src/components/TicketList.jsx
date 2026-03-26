import { useState, useEffect } from 'react';
import { tickets as ticketsApi } from '../services/api';
import { useAuth } from '../hooks/useAuth';

const SEVERITY_COLORS = { low: '#22c55e', medium: '#f59e0b', high: '#f97316', critical: '#ef4444' };
const STATUS_COLORS   = { open: '#3d8bff', in_progress: '#8b5cf6', escalated: '#ef4444', resolved: '#22c55e', closed: '#6b7280', pending_employee: '#f59e0b', reopened: '#f97316' };

const S = {
  container: { padding: 24, maxWidth: 1100, margin: '0 auto' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 },
  title: { fontSize: 22, fontWeight: 700, color: '#1f2937' },
  filters: { display: 'flex', gap: 12, marginBottom: 20 },
  select: { border: '1.5px solid #e5e7eb', borderRadius: 8, padding: '8px 12px', fontSize: 13, outline: 'none' },
  table: { width: '100%', borderCollapse: 'collapse', background: '#fff', borderRadius: 12, overflow: 'hidden', boxShadow: '0 1px 8px rgba(0,0,0,0.07)' },
  th: { padding: '12px 16px', background: '#f9fafb', textAlign: 'left', fontSize: 13, fontWeight: 600, color: '#6b7280', borderBottom: '1px solid #f0f0f0' },
  td: { padding: '12px 16px', fontSize: 14, color: '#374151', borderBottom: '1px solid #f9fafb' },
  badge: (color) => ({ display: 'inline-block', background: color + '18', color, borderRadius: 20, padding: '3px 10px', fontSize: 12, fontWeight: 600, textTransform: 'capitalize' }),
};

export default function TicketList() {
  const { user }              = useAuth();
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus]   = useState('');
  const [page, setPage]       = useState(1);
  const [selected, setSelected] = useState(null);

  useEffect(() => { load(); }, [status, page]);

  async function load() {
    setLoading(true);
    try {
      const params = { page };
      if (status) params.status = status;
      const data = await ticketsApi.list(params);
      setTickets(data.tickets || []);
    } finally { setLoading(false); }
  }

  async function handleResolve(ticketId) {
    await ticketsApi.resolve(ticketId, '');
    load();
  }

  async function handleConfirm(ticketId, confirmed) {
    await ticketsApi.confirmResolution(ticketId, { confirmed, rating: confirmed ? 4 : undefined });
    load();
  }

  if (loading) return <div style={{ textAlign: 'center', padding: 60, color: '#9ca3af' }}>Loading tickets...</div>;

  return (
    <div style={S.container}>
      <div style={S.header}>
        <h1 style={S.title}>{['hrbp', 'px_lead', 'admin'].includes(user?.role) ? 'All Tickets' : 'My Tickets'}</h1>
      </div>

      <div style={S.filters}>
        <select style={S.select} value={status} onChange={e => { setStatus(e.target.value); setPage(1); }}>
          <option value="">All statuses</option>
          {['open','in_progress','escalated','pending_employee','resolved','closed'].map(s => (
            <option key={s} value={s}>{s.replace('_', ' ')}</option>
          ))}
        </select>
      </div>

      <table style={S.table}>
        <thead>
          <tr>
            <th style={S.th}>#</th>
            <th style={S.th}>Category</th>
            {['hrbp','px_lead','admin'].includes(user?.role) && <th style={S.th}>Employee</th>}
            <th style={S.th}>Severity</th>
            <th style={S.th}>Status</th>
            <th style={S.th}>Due</th>
            <th style={S.th}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {tickets.length === 0 && (
            <tr><td colSpan={7} style={{ ...S.td, textAlign: 'center', color: '#9ca3af' }}>No tickets found.</td></tr>
          )}
          {tickets.map(t => (
            <tr key={t.id}>
              <td style={S.td}><strong>#{t.ticket_number}</strong></td>
              <td style={S.td}>{t.category_name}</td>
              {['hrbp','px_lead','admin'].includes(user?.role) && <td style={S.td}>{t.employee_name}</td>}
              <td style={S.td}><span style={S.badge(SEVERITY_COLORS[t.severity] || '#6b7280')}>{t.severity}</span></td>
              <td style={S.td}><span style={S.badge(STATUS_COLORS[t.status] || '#6b7280')}>{t.status.replace('_',' ')}</span></td>
              <td style={S.td}>
                {t.due_at ? (
                  <span style={{ color: new Date(t.due_at) < new Date() ? '#ef4444' : '#374151' }}>
                    {new Date(t.due_at).toLocaleDateString()}
                  </span>
                ) : '—'}
              </td>
              <td style={S.td}>
                <div style={{ display: 'flex', gap: 6 }}>
                  {/* HRBP/Admin: can mark resolved */}
                  {['hrbp','px_lead','admin'].includes(user?.role) && t.status === 'in_progress' && (
                    <button style={{ background: '#22c55e', color: '#fff', border: 'none', borderRadius: 6, padding: '4px 12px', cursor: 'pointer', fontSize: 12 }}
                      onClick={() => handleResolve(t.id)}>Resolve</button>
                  )}
                  {/* Employee: confirm resolution */}
                  {user?.role === 'employee' && t.status === 'resolved' && (
                    <>
                      <button style={{ background: '#22c55e', color: '#fff', border: 'none', borderRadius: 6, padding: '4px 10px', cursor: 'pointer', fontSize: 12 }}
                        onClick={() => handleConfirm(t.id, true)}>Confirm ✓</button>
                      <button style={{ background: '#ef4444', color: '#fff', border: 'none', borderRadius: 6, padding: '4px 10px', cursor: 'pointer', fontSize: 12 }}
                        onClick={() => handleConfirm(t.id, false)}>Reopen</button>
                    </>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginTop: 20 }}>
        <button style={{ border: '1px solid #e5e7eb', borderRadius: 8, padding: '7px 16px', cursor: 'pointer', background: '#fff' }}
          onClick={() => setPage(p => Math.max(1, p-1))} disabled={page === 1}>← Prev</button>
        <span style={{ padding: '8px 12px', fontSize: 14 }}>Page {page}</span>
        <button style={{ border: '1px solid #e5e7eb', borderRadius: 8, padding: '7px 16px', cursor: 'pointer', background: '#fff' }}
          onClick={() => setPage(p => p+1)} disabled={tickets.length < 20}>Next →</button>
      </div>
    </div>
  );
}
