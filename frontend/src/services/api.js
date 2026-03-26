const BASE = import.meta.env.VITE_API_URL || '/api';

function getToken() {
  return localStorage.getItem('hr_token');
}

async function request(path, options = {}) {
  const token = getToken();
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });

  if (res.status === 401) {
    localStorage.removeItem('hr_token');
    window.location.href = '/login';
    return;
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error || 'Request failed'), { status: res.status, data });
  return data;
}

// ─── Auth ─────────────────────────────────────────────────────────────────────
export const auth = {
  login:    (email, password) => request('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),
  register: (body)            => request('/auth/register', { method: 'POST', body: JSON.stringify(body) }),
  me:       ()                => request('/auth/me'),
};

// ─── Chat ─────────────────────────────────────────────────────────────────────
export const chat = {
  categories:    ()            => request('/chat/categories'),
  startSession:  ()            => request('/chat/session', { method: 'POST' }),
  getSession:    (id)          => request(`/chat/session/${id}`),
  sendMessage:   (id, content) => request(`/chat/session/${id}/message`, { method: 'POST', body: JSON.stringify({ content }) }),
  resolve:       (id, body)    => request(`/chat/session/${id}/resolve`, { method: 'POST', body: JSON.stringify(body) }),
  createTicket:  (id, body)    => request(`/chat/session/${id}/ticket`, { method: 'POST', body: JSON.stringify(body) }),
};

// ─── Tickets ─────────────────────────────────────────────────────────────────
export const tickets = {
  list:              (params = {}) => request(`/tickets?${new URLSearchParams(params)}`),
  get:               (id)          => request(`/tickets/${id}`),
  update:            (id, body)    => request(`/tickets/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  resolve:           (id, notes)   => request(`/tickets/${id}/resolve`, { method: 'POST', body: JSON.stringify({ notes }) }),
  confirmResolution: (id, body)    => request(`/tickets/${id}/confirm-resolution`, { method: 'POST', body: JSON.stringify(body) }),
  escalate:          (id, reason)  => request(`/tickets/${id}/escalate`, { method: 'POST', body: JSON.stringify({ reason }) }),
  feedback:          (id, body)    => request(`/tickets/${id}/feedback`, { method: 'POST', body: JSON.stringify(body) }),
};

// ─── Knowledge Base ───────────────────────────────────────────────────────────
export const knowledge = {
  list:     (params = {}) => request(`/knowledge?${new URLSearchParams(params)}`),
  get:      (id)          => request(`/knowledge/${id}`),
  download: (id)          => request(`/knowledge/${id}/download`),
  create:   (formData)    => {
    const token = getToken();
    return fetch(`${BASE}/knowledge`, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: formData,
    }).then(r => r.json());
  },
  update:   (id, formData) => {
    const token = getToken();
    return fetch(`${BASE}/knowledge/${id}`, {
      method: 'PATCH',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: formData,
    }).then(r => r.json());
  },
  remove:   (id) => request(`/knowledge/${id}`, { method: 'DELETE' }),
};

// ─── Analytics ───────────────────────────────────────────────────────────────
export const analytics = {
  summary:    (params = {}) => request(`/analytics/summary?${new URLSearchParams(params)}`),
  timeSeries: (params = {}) => request(`/analytics/tickets?${new URLSearchParams(params)}`),
};

// ─── Users (admin) ────────────────────────────────────────────────────────────
export const users = {
  list:       (params = {}) => request(`/users?${new URLSearchParams(params)}`),
  update:     (id, body)    => request(`/users/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  deactivate: (id)          => request(`/users/${id}`, { method: 'DELETE' }),
};
