import { useState, useEffect } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, LineChart, Line, PieChart, Pie, Cell, Legend } from 'recharts';
import { analytics as analyticsApi } from '../../services/api';

const COLORS = ['#6c63ff', '#3d8bff', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899'];

const S = {
  container: { padding: 24, maxWidth: 1200, margin: '0 auto' },
  title: { fontSize: 22, fontWeight: 700, color: '#1f2937', marginBottom: 24 },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 16, marginBottom: 32 },
  card: { background: '#fff', borderRadius: 14, padding: 20, boxShadow: '0 1px 8px rgba(0,0,0,0.07)' },
  cardTitle: { fontSize: 13, color: '#6b7280', fontWeight: 500, marginBottom: 6 },
  cardValue: { fontSize: 28, fontWeight: 800, color: '#1f2937' },
  cardSub: { fontSize: 12, color: '#9ca3af', marginTop: 4 },
  chartCard: { background: '#fff', borderRadius: 14, padding: 24, boxShadow: '0 1px 8px rgba(0,0,0,0.07)', marginBottom: 24 },
  chartTitle: { fontSize: 16, fontWeight: 700, color: '#1f2937', marginBottom: 20 },
  chartsRow: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 24 },
  filterRow: { display: 'flex', gap: 12, marginBottom: 24, alignItems: 'center' },
  select: { border: '1.5px solid #e5e7eb', borderRadius: 8, padding: '8px 12px', fontSize: 14, outline: 'none' },
  badge: (color) => ({ display: 'inline-block', background: color + '20', color, borderRadius: 20, padding: '2px 10px', fontSize: 12, fontWeight: 600 }),
};

function StatCard({ title, value, sub, color = '#6c63ff' }) {
  return (
    <div style={S.card}>
      <div style={S.cardTitle}>{title}</div>
      <div style={{ ...S.cardValue, color }}>{value ?? '—'}</div>
      {sub && <div style={S.cardSub}>{sub}</div>}
    </div>
  );
}

export default function AnalyticsDashboard() {
  const [summary, setSummary]       = useState(null);
  const [timeSeries, setTimeSeries] = useState([]);
  const [groupBy, setGroupBy]       = useState('week');
  const [loading, setLoading]       = useState(true);

  useEffect(() => { load(); }, [groupBy]);

  async function load() {
    setLoading(true);
    try {
      const [sum, ts] = await Promise.all([
        analyticsApi.summary(),
        analyticsApi.timeSeries({ groupBy }),
      ]);
      setSummary(sum);
      setTimeSeries((ts.timeSeries || []).map(row => ({
        ...row,
        period: new Date(row.period).toLocaleDateString('en-US', { month: 'short', day: '2-digit' }),
        total: parseInt(row.total),
        resolved: parseInt(row.resolved),
        escalated: parseInt(row.escalated),
      })));
    } finally { setLoading(false); }
  }

  if (loading) return <div style={{ textAlign: 'center', padding: 60, color: '#9ca3af' }}>Loading analytics...</div>;
  if (!summary) return null;

  const { overview, by_category, feedback, escalations } = summary;

  const resolutionRate = overview?.total > 0
    ? Math.round((overview.resolved / overview.total) * 100) + '%'
    : '—';

  const pieData = (by_category || []).slice(0, 8).map((row, i) => ({
    name: row.category, value: parseInt(row.total), color: COLORS[i % COLORS.length],
  }));

  return (
    <div style={S.container}>
      <h1 style={S.title}>Analytics & Reporting</h1>

      {/* Overview KPIs */}
      <div style={S.grid}>
        <StatCard title="Total Tickets" value={overview?.total} sub="All time" />
        <StatCard title="Resolution Rate" value={resolutionRate} color="#22c55e" sub={`${overview?.resolved} resolved`} />
        <StatCard title="Avg Resolution Time" value={overview?.avg_resolution_hours ? `${overview.avg_resolution_hours}h` : '—'} color="#3d8bff" />
        <StatCard title="Open Tickets" value={overview?.open} color="#f59e0b" />
        <StatCard title="Escalated" value={overview?.escalated} color="#ef4444" sub={escalations?.escalation_rate ? `${escalations.escalation_rate}% rate` : ''} />
        <StatCard title="Avg Feedback Rating" value={feedback?.avg_rating ? `${feedback.avg_rating}⭐` : '—'} color="#8b5cf6" sub={`${feedback?.total_feedback || 0} responses`} />
      </div>

      {/* Filter */}
      <div style={S.filterRow}>
        <span style={{ fontSize: 14, fontWeight: 600, color: '#374151' }}>Group by:</span>
        <select style={S.select} value={groupBy} onChange={e => setGroupBy(e.target.value)}>
          <option value="week">Week</option>
          <option value="month">Month</option>
        </select>
      </div>

      {/* Time series */}
      <div style={S.chartCard}>
        <div style={S.chartTitle}>Ticket Volume Over Time</div>
        <ResponsiveContainer width="100%" height={250}>
          <BarChart data={timeSeries}>
            <XAxis dataKey="period" tick={{ fontSize: 12 }} />
            <YAxis tick={{ fontSize: 12 }} />
            <Tooltip />
            <Legend />
            <Bar dataKey="total" name="Total" fill="#6c63ff" radius={[4,4,0,0]} />
            <Bar dataKey="resolved" name="Resolved" fill="#22c55e" radius={[4,4,0,0]} />
            <Bar dataKey="escalated" name="Escalated" fill="#ef4444" radius={[4,4,0,0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div style={S.chartsRow}>
        {/* By category pie */}
        <div style={S.chartCard}>
          <div style={S.chartTitle}>Tickets by Category</div>
          <ResponsiveContainer width="100%" height={250}>
            <PieChart>
              <Pie data={pieData} cx="50%" cy="50%" outerRadius={90} dataKey="value" label={({ name, value }) => `${value}`}>
                {pieData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
              </Pie>
              <Legend formatter={(v, e) => <span style={{ fontSize: 12 }}>{e.payload.name}</span>} />
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </div>

        {/* Average TAT by category */}
        <div style={S.chartCard}>
          <div style={S.chartTitle}>Avg Resolution Time by Category (hours)</div>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={(by_category || []).map(r => ({ name: r.category.split('/')[0].trim(), hours: parseFloat(r.avg_hours) || 0 }))} layout="vertical">
              <XAxis type="number" tick={{ fontSize: 11 }} />
              <YAxis dataKey="name" type="category" tick={{ fontSize: 11 }} width={120} />
              <Tooltip />
              <Bar dataKey="hours" name="Avg Hours" fill="#3d8bff" radius={[0,4,4,0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* By category table */}
      <div style={S.chartCard}>
        <div style={S.chartTitle}>Resolution Rate by Category</div>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              {['Category','Total','Resolved','Resolution Rate','Avg Hours'].map(h => (
                <th key={h} style={{ padding: '10px 12px', textAlign: 'left', fontSize: 13, fontWeight: 600, color: '#6b7280', borderBottom: '2px solid #f0f0f0' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {(by_category || []).map((row, i) => {
              const rate = row.total > 0 ? Math.round((row.resolved / row.total) * 100) : 0;
              return (
                <tr key={i}>
                  <td style={{ padding: '10px 12px', fontSize: 14 }}>{row.category}</td>
                  <td style={{ padding: '10px 12px', fontSize: 14 }}>{row.total}</td>
                  <td style={{ padding: '10px 12px', fontSize: 14 }}>{row.resolved}</td>
                  <td style={{ padding: '10px 12px', fontSize: 14 }}>
                    <span style={S.badge(rate >= 80 ? '#22c55e' : rate >= 50 ? '#f59e0b' : '#ef4444')}>
                      {rate}%
                    </span>
                  </td>
                  <td style={{ padding: '10px 12px', fontSize: 14 }}>{row.avg_hours}h</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
