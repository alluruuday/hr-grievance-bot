import { useState, useEffect } from 'react';
import { knowledge as kbApi } from '../../services/api';
import KnowledgeBaseEditor from './KnowledgeBaseEditor';

const S = {
  container: { padding: 24, maxWidth: 1100, margin: '0 auto' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 },
  title: { fontSize: 22, fontWeight: 700, color: '#1f2937' },
  btn: (variant = 'primary') => ({
    background: variant === 'primary' ? '#6c63ff' : variant === 'danger' ? '#ef4444' : '#f3f4f6',
    color: variant === 'secondary' ? '#374151' : '#fff',
    border: 'none', borderRadius: 8, padding: '8px 18px',
    cursor: 'pointer', fontSize: 14, fontWeight: 600,
  }),
  table: { width: '100%', borderCollapse: 'collapse', background: '#fff', borderRadius: 12, overflow: 'hidden', boxShadow: '0 1px 8px rgba(0,0,0,0.07)' },
  th: { padding: '12px 16px', background: '#f9fafb', textAlign: 'left', fontSize: 13, fontWeight: 600, color: '#6b7280', borderBottom: '1px solid #f0f0f0' },
  td: { padding: '12px 16px', fontSize: 14, color: '#374151', borderBottom: '1px solid #f9fafb' },
  badge: (color) => ({ background: color + '20', color, borderRadius: 6, padding: '2px 10px', fontSize: 12, fontWeight: 600 }),
};

export default function AdminPanel() {
  const [entries, setEntries]   = useState([]);
  const [loading, setLoading]   = useState(true);
  const [editing, setEditing]   = useState(null);  // null | 'new' | { entry }
  const [page, setPage]         = useState(1);

  useEffect(() => { load(); }, [page]);

  async function load() {
    setLoading(true);
    try {
      const data = await kbApi.list({ page });
      setEntries(data.entries || []);
    } finally { setLoading(false); }
  }

  async function handleDelete(id) {
    if (!confirm('Remove this entry from the knowledge base?')) return;
    await kbApi.remove(id);
    load();
  }

  if (editing !== null) {
    return (
      <KnowledgeBaseEditor
        entry={editing === 'new' ? null : editing}
        onSave={() => { setEditing(null); load(); }}
        onCancel={() => setEditing(null)}
      />
    );
  }

  return (
    <div style={S.container}>
      <div style={S.header}>
        <h1 style={S.title}>Knowledge Base Management</h1>
        <button style={S.btn('primary')} onClick={() => setEditing('new')}>+ Add Entry</button>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 40, color: '#9ca3af' }}>Loading...</div>
      ) : (
        <table style={S.table}>
          <thead>
            <tr>
              <th style={S.th}>Title</th>
              <th style={S.th}>Category</th>
              <th style={S.th}>Sub-Category</th>
              <th style={S.th}>Keywords</th>
              <th style={S.th}>File</th>
              <th style={S.th}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {entries.length === 0 && (
              <tr><td colSpan={6} style={{ ...S.td, textAlign: 'center', color: '#9ca3af' }}>No entries yet. Add your first KB entry.</td></tr>
            )}
            {entries.map(e => (
              <tr key={e.id}>
                <td style={S.td}>
                  <div style={{ fontWeight: 600 }}>{e.title}</div>
                  <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 2 }}>{e.content.substring(0, 60)}...</div>
                </td>
                <td style={S.td}><span style={S.badge('#6c63ff')}>{e.category_name || '—'}</span></td>
                <td style={S.td}>{e.sub_category_name || '—'}</td>
                <td style={S.td}>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                    {(e.keywords || []).slice(0, 3).map(k => (
                      <span key={k} style={{ background: '#f3f4f6', borderRadius: 4, padding: '2px 6px', fontSize: 11 }}>{k}</span>
                    ))}
                  </div>
                </td>
                <td style={S.td}>{e.file_key ? '📄 Yes' : '—'}</td>
                <td style={S.td}>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button style={S.btn('secondary')} onClick={() => setEditing(e)}>Edit</button>
                    <button style={S.btn('danger')} onClick={() => handleDelete(e.id)}>Remove</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginTop: 20 }}>
        <button style={S.btn('secondary')} onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>← Prev</button>
        <span style={{ padding: '8px 12px', fontSize: 14 }}>Page {page}</span>
        <button style={S.btn('secondary')} onClick={() => setPage(p => p + 1)} disabled={entries.length < 20}>Next →</button>
      </div>
    </div>
  );
}
