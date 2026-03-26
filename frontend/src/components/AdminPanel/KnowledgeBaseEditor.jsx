import { useState, useEffect } from 'react';
import { knowledge as kbApi, auth as authApi } from '../../services/api';

const S = {
  container: { padding: 24, maxWidth: 800, margin: '0 auto' },
  card: { background: '#fff', borderRadius: 16, padding: 32, boxShadow: '0 1px 8px rgba(0,0,0,0.07)' },
  title: { fontSize: 20, fontWeight: 700, marginBottom: 24, color: '#1f2937' },
  field: { marginBottom: 20 },
  label: { display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 6 },
  input: { width: '100%', border: '1.5px solid #e5e7eb', borderRadius: 8, padding: '10px 12px', fontSize: 14, outline: 'none', fontFamily: 'inherit' },
  textarea: { width: '100%', border: '1.5px solid #e5e7eb', borderRadius: 8, padding: '10px 12px', fontSize: 14, outline: 'none', fontFamily: 'inherit', resize: 'vertical', minHeight: 100 },
  select: { width: '100%', border: '1.5px solid #e5e7eb', borderRadius: 8, padding: '10px 12px', fontSize: 14, outline: 'none', background: '#fff' },
  row: { display: 'flex', gap: 16 },
  col: { flex: 1 },
  actions: { display: 'flex', gap: 12, marginTop: 24 },
  btn: (v) => ({
    background: v === 'primary' ? '#6c63ff' : '#f3f4f6',
    color: v === 'primary' ? '#fff' : '#374151',
    border: 'none', borderRadius: 8, padding: '10px 24px', cursor: 'pointer', fontSize: 14, fontWeight: 600,
  }),
  fileLabel: { display: 'inline-block', background: '#f3f4f6', border: '1.5px dashed #d1d5db', borderRadius: 8, padding: '12px 20px', cursor: 'pointer', fontSize: 14, color: '#6b7280', width: '100%', textAlign: 'center' },
  hint: { fontSize: 12, color: '#9ca3af', marginTop: 4 },
  error: { color: '#ef4444', fontSize: 13, marginTop: 8 },
};

export default function KnowledgeBaseEditor({ entry, onSave, onCancel }) {
  const [categories, setCategories]     = useState([]);
  const [subCategories, setSubCategories] = useState([]);
  const [form, setForm] = useState({
    title: entry?.title || '',
    content: entry?.content || '',
    categoryId: entry?.category_id || '',
    subCategoryId: entry?.sub_category_id || '',
    keywords: (entry?.keywords || []).join(', '),
    policyUrl: entry?.policy_url || '',
  });
  const [file, setFile]     = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState('');

  useEffect(() => {
    fetch('/api/chat/categories', {
      headers: { Authorization: `Bearer ${localStorage.getItem('hr_token')}` },
    }).then(r => r.json()).then(d => setCategories(d.categories || []));
  }, []);

  useEffect(() => {
    if (form.categoryId) {
      const cat = categories.find(c => c.id === form.categoryId);
      setSubCategories(cat?.sub_categories?.filter(Boolean) || []);
    } else {
      setSubCategories([]);
    }
  }, [form.categoryId, categories]);

  function set(field) {
    return e => setForm(prev => ({ ...prev, [field]: e.target.value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.title || !form.content || !form.categoryId) {
      setError('Title, content, and category are required.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const fd = new FormData();
      fd.append('title', form.title);
      fd.append('content', form.content);
      fd.append('categoryId', form.categoryId);
      if (form.subCategoryId) fd.append('subCategoryId', form.subCategoryId);
      fd.append('keywords', form.keywords);
      if (form.policyUrl) fd.append('policyUrl', form.policyUrl);
      if (file) fd.append('file', file);

      if (entry) {
        await kbApi.update(entry.id, fd);
      } else {
        await kbApi.create(fd);
      }
      onSave();
    } catch (err) {
      setError(err.message || 'Failed to save entry.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={S.container}>
      <div style={S.card}>
        <h2 style={S.title}>{entry ? 'Edit KB Entry' : 'Add KB Entry'}</h2>
        <form onSubmit={handleSubmit}>
          <div style={S.field}>
            <label style={S.label}>Title *</label>
            <input style={S.input} value={form.title} onChange={set('title')} placeholder="e.g. Leave Balance Policy" />
          </div>

          <div style={S.field}>
            <label style={S.label}>Content *</label>
            <textarea style={S.textarea} value={form.content} onChange={set('content')}
              placeholder="Paste the policy text, FAQ answer, or process steps..." />
          </div>

          <div style={{ ...S.row }}>
            <div style={S.col}>
              <div style={S.field}>
                <label style={S.label}>Category *</label>
                <select style={S.select} value={form.categoryId} onChange={set('categoryId')}>
                  <option value="">Select category...</option>
                  {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
            </div>
            <div style={S.col}>
              <div style={S.field}>
                <label style={S.label}>Sub-Category</label>
                <select style={S.select} value={form.subCategoryId} onChange={set('subCategoryId')} disabled={!subCategories.length}>
                  <option value="">All sub-categories</option>
                  {subCategories.map(sc => sc && <option key={sc.id} value={sc.id}>{sc.name}</option>)}
                </select>
              </div>
            </div>
          </div>

          <div style={S.field}>
            <label style={S.label}>Keywords (comma-separated)</label>
            <input style={S.input} value={form.keywords} onChange={set('keywords')}
              placeholder="e.g. leave balance, annual leave, sick leave" />
            <div style={S.hint}>Used for keyword matching in the chatbot search</div>
          </div>

          <div style={S.field}>
            <label style={S.label}>Policy URL (deep-link)</label>
            <input style={S.input} value={form.policyUrl} onChange={set('policyUrl')}
              placeholder="https://..." type="url" />
          </div>

          <div style={S.field}>
            <label style={S.label}>Attach Document (PDF, DOCX, up to 20MB)</label>
            <label style={S.fileLabel}>
              {file ? `📄 ${file.name}` : entry?.file_key ? '📄 File already attached (upload new to replace)' : '📁 Click to upload file'}
              <input type="file" accept=".pdf,.doc,.docx,.txt" style={{ display: 'none' }}
                onChange={e => setFile(e.target.files[0])} />
            </label>
          </div>

          {error && <div style={S.error}>{error}</div>}

          <div style={S.actions}>
            <button type="submit" style={S.btn('primary')} disabled={saving}>
              {saving ? 'Saving...' : (entry ? 'Update Entry' : 'Create Entry')}
            </button>
            <button type="button" style={S.btn('secondary')} onClick={onCancel}>Cancel</button>
          </div>
        </form>
      </div>
    </div>
  );
}
