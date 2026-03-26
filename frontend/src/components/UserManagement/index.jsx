import { useState, useEffect, useCallback } from 'react';
import { users as usersApi } from '../../services/api';

const ROLES = ['employee', 'hrbp', 'px_lead', 'admin'];
const ROLE_COLORS = {
  employee: '#6b7280',
  hrbp:     '#6c63ff',
  px_lead:  '#f59e0b',
  admin:    '#ef4444',
};

const S = {
  container: { padding: 24, maxWidth: 1100, margin: '0 auto' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 },
  title: { fontSize: 22, fontWeight: 700, color: '#1f2937' },
  searchRow: { display: 'flex', gap: 12, marginBottom: 20 },
  input: { flex: 1, border: '1px solid #e5e7eb', borderRadius: 8, padding: '8px 14px', fontSize: 14, outline: 'none' },
  select: { border: '1px solid #e5e7eb', borderRadius: 8, padding: '8px 12px', fontSize: 14, background: '#fff', cursor: 'pointer' },
  table: { width: '100%', borderCollapse: 'collapse', background: '#fff', borderRadius: 12, overflow: 'hidden', boxShadow: '0 1px 8px rgba(0,0,0,0.07)' },
  th: { padding: '12px 16px', background: '#f9fafb', textAlign: 'left', fontSize: 13, fontWeight: 600, color: '#6b7280', borderBottom: '1px solid #f0f0f0' },
  td: { padding: '12px 16px', fontSize: 14, color: '#374151', borderBottom: '1px solid #f9fafb', verticalAlign: 'middle' },
  badge: (color) => ({ background: color + '18', color, borderRadius: 6, padding: '3px 10px', fontSize: 12, fontWeight: 600, display: 'inline-block' }),
  avatar: (active) => ({
    width: 34, height: 34, borderRadius: '50%',
    background: active ? '#6c63ff' : '#d1d5db',
    color: '#fff', display: 'inline-flex', alignItems: 'center',
    justifyContent: 'center', fontWeight: 700, fontSize: 13, marginRight: 10,
  }),
  nameCell: { display: 'flex', alignItems: 'center' },
  roleSelect: { border: '1px solid #e5e7eb', borderRadius: 6, padding: '4px 8px', fontSize: 13, background: '#fff', cursor: 'pointer' },
  deactivateBtn: (active) => ({
    border: `1px solid ${active ? '#fca5a5' : '#d1d5db'}`,
    background: active ? '#fff1f1' : '#f9fafb',
    color: active ? '#ef4444' : '#9ca3af',
    borderRadius: 6, padding: '4px 12px', cursor: 'pointer',
    fontSize: 13, fontWeight: 500,
  }),
  reactivateBtn: {
    border: '1px solid #bbf7d0', background: '#f0fdf4', color: '#16a34a',
    borderRadius: 6, padding: '4px 12px', cursor: 'pointer', fontSize: 13, fontWeight: 500,
  },
  inactiveBadge: { background: '#f3f4f6', color: '#9ca3af', borderRadius: 6, padding: '3px 10px', fontSize: 12, fontWeight: 500 },
  total: { fontSize: 13, color: '#6b7280', marginBottom: 12 },
  empty: { textAlign: 'center', padding: '48px 0', color: '#9ca3af' },
};

export default function UserManagement() {
  const [userList, setUserList]   = useState([]);
  const [total, setTotal]         = useState(0);
  const [loading, setLoading]     = useState(true);
  const [search, setSearch]       = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [saving, setSaving]       = useState({});
  const [error, setError]         = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = { limit: 100 };
      if (search)     params.search = search;
      if (roleFilter) params.role   = roleFilter;
      const data = await usersApi.list(params);
      setUserList(data.users || []);
      setTotal(data.total || 0);
    } catch (e) {
      setError(e.message || 'Failed to load users');
    } finally {
      setLoading(false);
    }
  }, [search, roleFilter]);

  useEffect(() => {
    const t = setTimeout(load, search ? 300 : 0);
    return () => clearTimeout(t);
  }, [load]);

  async function handleRoleChange(userId, role) {
    setSaving(s => ({ ...s, [userId]: true }));
    try {
      const updated = await usersApi.update(userId, { role });
      setUserList(list => list.map(u => u.id === userId ? { ...u, role: updated.user.role } : u));
    } catch (e) {
      alert(e.message || 'Failed to update role');
    } finally {
      setSaving(s => ({ ...s, [userId]: false }));
    }
  }

  async function handleToggleActive(user) {
    const action = user.is_active ? 'deactivate' : 're-activate';
    if (!confirm(`${action.charAt(0).toUpperCase() + action.slice(1)} ${user.name}?`)) return;
    setSaving(s => ({ ...s, [user.id]: true }));
    try {
      if (user.is_active) {
        await usersApi.deactivate(user.id);
        setUserList(list => list.map(u => u.id === user.id ? { ...u, is_active: false } : u));
      } else {
        const updated = await usersApi.update(user.id, { is_active: true });
        setUserList(list => list.map(u => u.id === user.id ? { ...u, is_active: updated.user.is_active } : u));
      }
    } catch (e) {
      alert(e.message || 'Failed to update user');
    } finally {
      setSaving(s => ({ ...s, [user.id]: false }));
    }
  }

  const counts = ROLES.reduce((acc, r) => {
    acc[r] = userList.filter(u => u.role === r).length;
    return acc;
  }, {});

  return (
    <div style={S.container}>
      <div style={S.header}>
        <div>
          <div style={S.title}>User Management</div>
          <div style={{ fontSize: 13, color: '#6b7280', marginTop: 2 }}>
            Manage roles and access for all users
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {ROLES.map(r => (
            <span key={r} style={{ ...S.badge(ROLE_COLORS[r]), fontSize: 12 }}>
              {r}: {counts[r] || 0}
            </span>
          ))}
        </div>
      </div>

      <div style={S.searchRow}>
        <input
          style={S.input}
          placeholder="Search by name, email or employee ID..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <select style={S.select} value={roleFilter} onChange={e => setRoleFilter(e.target.value)}>
          <option value="">All roles</option>
          {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
        </select>
      </div>

      {error && <div style={{ color: '#ef4444', marginBottom: 12, fontSize: 14 }}>{error}</div>}
      {!loading && <div style={S.total}>{total} user{total !== 1 ? 's' : ''} total</div>}

      <table style={S.table}>
        <thead>
          <tr>
            <th style={S.th}>User</th>
            <th style={S.th}>Employee ID</th>
            <th style={S.th}>Department</th>
            <th style={S.th}>Role</th>
            <th style={S.th}>Tickets</th>
            <th style={S.th}>Status</th>
            <th style={S.th}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr><td colSpan={7} style={{ ...S.td, textAlign: 'center', color: '#9ca3af' }}>Loading...</td></tr>
          ) : userList.length === 0 ? (
            <tr><td colSpan={7} style={S.empty}>No users found</td></tr>
          ) : userList.map(user => (
            <tr key={user.id} style={{ opacity: user.is_active ? 1 : 0.55 }}>
              <td style={S.td}>
                <div style={S.nameCell}>
                  {user.avatar_url
                    ? <img src={user.avatar_url} alt="" style={{ ...S.avatar(user.is_active), objectFit: 'cover' }} />
                    : <div style={S.avatar(user.is_active)}>{user.name?.[0]?.toUpperCase()}</div>
                  }
                  <div>
                    <div style={{ fontWeight: 600 }}>{user.name}</div>
                    <div style={{ fontSize: 12, color: '#6b7280' }}>{user.email}</div>
                  </div>
                </div>
              </td>
              <td style={S.td}>{user.employee_id || '—'}</td>
              <td style={S.td}>{user.department || '—'}</td>
              <td style={S.td}>
                <select
                  style={{ ...S.roleSelect, color: ROLE_COLORS[user.role], borderColor: ROLE_COLORS[user.role] + '60' }}
                  value={user.role}
                  disabled={saving[user.id]}
                  onChange={e => handleRoleChange(user.id, e.target.value)}
                >
                  {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
              </td>
              <td style={S.td}>{user.ticket_count || 0}</td>
              <td style={S.td}>
                {user.is_active
                  ? <span style={S.badge('#16a34a')}>Active</span>
                  : <span style={S.inactiveBadge}>Inactive</span>
                }
                {user.has_google && (
                  <span style={{ marginLeft: 6, fontSize: 11, color: '#6b7280' }}>· Google</span>
                )}
              </td>
              <td style={S.td}>
                <button
                  style={user.is_active ? S.deactivateBtn(true) : S.reactivateBtn}
                  disabled={saving[user.id]}
                  onClick={() => handleToggleActive(user)}
                >
                  {saving[user.id] ? '...' : user.is_active ? 'Deactivate' : 'Reactivate'}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
