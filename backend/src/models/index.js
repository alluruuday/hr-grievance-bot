/**
 * Thin model layer — plain SQL queries via the pg pool.
 * Each exported object contains typed query helpers for its table.
 */
const db = require('../config/database');

// ─── USERS ───────────────────────────────────────────────────────────────────
const User = {
  async findById(id) {
    const { rows } = await db.query(
      `SELECT id, employee_id, name, email, role, department, manager_id, is_active, created_at
       FROM users WHERE id = $1`, [id]);
    return rows[0] || null;
  },

  async findByEmail(email) {
    const { rows } = await db.query(
      `SELECT * FROM users WHERE email = $1 AND is_active = TRUE`, [email]);
    return rows[0] || null;
  },

  async findByGoogleId(googleId) {
    const { rows } = await db.query(
      `SELECT id, employee_id, name, email, role, department, manager_id, avatar_url, is_active
       FROM users WHERE google_id = $1`, [googleId]);
    return rows[0] || null;
  },

  async upsertGoogleUser({ googleId, name, email, avatarUrl }) {
    // Find existing user by google_id or email, then link / create
    const { rows } = await db.query(
      `INSERT INTO users (employee_id, name, email, google_id, avatar_url, role)
       VALUES ($1, $2, $3, $4, $5, 'employee')
       ON CONFLICT (email) DO UPDATE
         SET google_id  = EXCLUDED.google_id,
             avatar_url = EXCLUDED.avatar_url,
             name       = COALESCE(users.name, EXCLUDED.name)
       RETURNING id, employee_id, name, email, role, avatar_url`,
      [`GOOGLE-${googleId.slice(-8)}`, name, email, googleId, avatarUrl || null]);
    return rows[0];
  },

  async findByEmployeeId(employeeId) {
    const { rows } = await db.query(
      `SELECT id, employee_id, name, email, role, department, manager_id, is_active
       FROM users WHERE employee_id = $1`, [employeeId]);
    return rows[0] || null;
  },

  async create({ employeeId, name, email, passwordHash, role, department, managerId }) {
    const { rows } = await db.query(
      `INSERT INTO users (employee_id, name, email, password_hash, role, department, manager_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id, employee_id, name, email, role`,
      [employeeId, name, email, passwordHash || null, role || 'employee', department || null, managerId || null]);
    return rows[0];
  },

  async listByRole(role) {
    const { rows } = await db.query(
      `SELECT id, employee_id, name, email, role, department FROM users WHERE role = $1 AND is_active = TRUE`,
      [role]);
    return rows;
  },
};

// ─── CATEGORIES ──────────────────────────────────────────────────────────────
const Category = {
  async list() {
    const { rows } = await db.query(
      `SELECT c.*, json_agg(json_build_object('id', sc.id, 'name', sc.name, 'slug', sc.slug)
         ORDER BY sc.name) AS sub_categories
       FROM categories c
       LEFT JOIN sub_categories sc ON sc.category_id = c.id
       WHERE c.is_active = TRUE
       GROUP BY c.id ORDER BY c.name`);
    return rows;
  },

  async findById(id) {
    const { rows } = await db.query(`SELECT * FROM categories WHERE id = $1`, [id]);
    return rows[0] || null;
  },

  async findBySlug(slug) {
    const { rows } = await db.query(`SELECT * FROM categories WHERE slug = $1`, [slug]);
    return rows[0] || null;
  },
};

// ─── KNOWLEDGE BASE ──────────────────────────────────────────────────────────
const KnowledgeBase = {
  async search({ categoryId, subCategoryId, keywords }) {
    // Keyword search (no pgvector — can upgrade later)
    const conditions = [`kb.is_active = TRUE`];
    const params = [];
    let idx = 1;

    if (categoryId) { conditions.push(`kb.category_id = $${idx++}`); params.push(categoryId); }
    if (subCategoryId) { conditions.push(`kb.sub_category_id = $${idx++}`); params.push(subCategoryId); }

    if (keywords && keywords.length > 0) {
      // Simple keyword overlap using GIN index on keywords array
      conditions.push(`kb.keywords && $${idx++}`);
      params.push(keywords);
    }

    const { rows } = await db.query(
      `SELECT kb.*, c.name AS category_name, sc.name AS sub_category_name
       FROM knowledge_base kb
       LEFT JOIN categories c ON c.id = kb.category_id
       LEFT JOIN sub_categories sc ON sc.id = kb.sub_category_id
       WHERE ${conditions.join(' AND ')}
       ORDER BY (kb.category_id = $1) DESC, kb.updated_at DESC
       LIMIT 5`,
      params.length ? params : [null]);
    return rows;
  },

  async findByCategoryAndSubCategory(categoryId, subCategoryId) {
    const { rows } = await db.query(
      `SELECT * FROM knowledge_base
       WHERE category_id = $1 AND (sub_category_id = $2 OR sub_category_id IS NULL)
         AND is_active = TRUE
       ORDER BY sub_category_id DESC NULLS LAST
       LIMIT 5`,
      [categoryId, subCategoryId]);
    return rows;
  },

  async create({ categoryId, subCategoryId, title, content, keywords, policyUrl, fileKey, uploadedBy }) {
    const { rows } = await db.query(
      `INSERT INTO knowledge_base (category_id, sub_category_id, title, content, keywords, policy_url, file_key, uploaded_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [categoryId, subCategoryId, title, content, keywords || [], policyUrl || null, fileKey || null, uploadedBy]);
    return rows[0];
  },

  async update(id, fields) {
    const sets = [];
    const vals = [];
    let idx = 1;
    for (const [k, v] of Object.entries(fields)) {
      const col = k.replace(/([A-Z])/g, '_$1').toLowerCase();
      sets.push(`${col} = $${idx++}`);
      vals.push(v);
    }
    vals.push(id);
    const { rows } = await db.query(
      `UPDATE knowledge_base SET ${sets.join(', ')} WHERE id = $${idx} RETURNING *`, vals);
    return rows[0];
  },

  async list({ categoryId, page = 1, limit = 20 } = {}) {
    const offset = (page - 1) * limit;
    const params = [limit, offset];
    let where = 'WHERE kb.is_active = TRUE';
    if (categoryId) { where += ' AND kb.category_id = $3'; params.push(categoryId); }
    const { rows } = await db.query(
      `SELECT kb.*, c.name AS category_name, sc.name AS sub_category_name
       FROM knowledge_base kb
       LEFT JOIN categories c ON c.id = kb.category_id
       LEFT JOIN sub_categories sc ON sc.id = kb.sub_category_id
       ${where} ORDER BY kb.updated_at DESC LIMIT $1 OFFSET $2`,
      params);
    return rows;
  },
};

// ─── CHAT SESSIONS ───────────────────────────────────────────────────────────
const ChatSession = {
  async create({ userId, categoryId, subCategoryId }) {
    const { rows } = await db.query(
      `INSERT INTO chat_sessions (user_id, category_id, sub_category_id)
       VALUES ($1,$2,$3) RETURNING *`,
      [userId, categoryId || null, subCategoryId || null]);
    return rows[0];
  },

  async update(id, fields) {
    const sets = [];
    const vals = [];
    let idx = 1;
    for (const [k, v] of Object.entries(fields)) {
      const col = k.replace(/([A-Z])/g, '_$1').toLowerCase();
      sets.push(`${col} = $${idx++}`);
      vals.push(v);
    }
    vals.push(id);
    const { rows } = await db.query(
      `UPDATE chat_sessions SET ${sets.join(', ')} WHERE id = $${idx} RETURNING *`, vals);
    return rows[0];
  },

  async findById(id) {
    const { rows } = await db.query(`SELECT * FROM chat_sessions WHERE id = $1`, [id]);
    return rows[0] || null;
  },
};

// ─── CHAT MESSAGES ───────────────────────────────────────────────────────────
const ChatMessage = {
  async create({ sessionId, role, content, metadata }) {
    const { rows } = await db.query(
      `INSERT INTO chat_messages (session_id, role, content, metadata)
       VALUES ($1,$2,$3,$4) RETURNING *`,
      [sessionId, role, content, metadata ? JSON.stringify(metadata) : null]);
    return rows[0];
  },

  async listBySession(sessionId) {
    const { rows } = await db.query(
      `SELECT * FROM chat_messages WHERE session_id = $1 ORDER BY created_at ASC`,
      [sessionId]);
    return rows;
  },
};

// ─── TICKETS ─────────────────────────────────────────────────────────────────
const Ticket = {
  async create({ sessionId, employeeId, categoryId, subCategoryId, description, severity,
                 isConfidential, department, managerName, assignedTo, dueAt }) {
    const { rows } = await db.query(
      `INSERT INTO tickets
         (session_id, employee_id, category_id, sub_category_id, description, severity,
          is_confidential, department, manager_name, assigned_to, due_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
      [sessionId || null, employeeId, categoryId, subCategoryId || null, description,
       severity || 'medium', isConfidential || false, department || null,
       managerName || null, assignedTo || null, dueAt || null]);
    return rows[0];
  },

  async findById(id) {
    const { rows } = await db.query(
      `SELECT t.*, c.name AS category_name, sc.name AS sub_category_name,
              u.name AS employee_name, u.employee_id AS emp_id, u.email AS employee_email,
              a.name AS assignee_name, a.email AS assignee_email
       FROM tickets t
       JOIN categories c ON c.id = t.category_id
       LEFT JOIN sub_categories sc ON sc.id = t.sub_category_id
       JOIN users u ON u.id = t.employee_id
       LEFT JOIN users a ON a.id = t.assigned_to
       WHERE t.id = $1`, [id]);
    return rows[0] || null;
  },

  async findByNumber(ticketNumber) {
    const { rows } = await db.query(
      `SELECT * FROM tickets WHERE ticket_number = $1`, [ticketNumber]);
    return rows[0] || null;
  },

  async update(id, fields) {
    const sets = [];
    const vals = [];
    let idx = 1;
    for (const [k, v] of Object.entries(fields)) {
      const col = k.replace(/([A-Z])/g, '_$1').toLowerCase();
      sets.push(`${col} = $${idx++}`);
      vals.push(v);
    }
    vals.push(id);
    const { rows } = await db.query(
      `UPDATE tickets SET ${sets.join(', ')} WHERE id = $${idx} RETURNING *`, vals);
    return rows[0];
  },

  async listForEmployee(employeeId, { status, page = 1, limit = 20 } = {}) {
    const offset = (page - 1) * limit;
    const params = [employeeId, limit, offset];
    let where = `WHERE t.employee_id = $1`;
    if (status) { where += ` AND t.status = $4`; params.push(status); }
    const { rows } = await db.query(
      `SELECT t.*, c.name AS category_name FROM tickets t
       JOIN categories c ON c.id = t.category_id
       ${where} ORDER BY t.created_at DESC LIMIT $2 OFFSET $3`, params);
    return rows;
  },

  async listForAssignee(assignedTo, { status, page = 1, limit = 20 } = {}) {
    const offset = (page - 1) * limit;
    const params = [assignedTo, limit, offset];
    let where = `WHERE t.assigned_to = $1`;
    if (status) { where += ` AND t.status = $4`; params.push(status); }
    const { rows } = await db.query(
      `SELECT t.*, c.name AS category_name, u.name AS employee_name
       FROM tickets t JOIN categories c ON c.id = t.category_id
       JOIN users u ON u.id = t.employee_id
       ${where} ORDER BY t.due_at ASC NULLS LAST LIMIT $2 OFFSET $3`, params);
    return rows;
  },

  async listAll({ status, categoryId, page = 1, limit = 20 } = {}) {
    const offset = (page - 1) * limit;
    const params = [limit, offset];
    const conditions = [];
    let idx = 3;
    if (status) { conditions.push(`t.status = $${idx++}`); params.push(status); }
    if (categoryId) { conditions.push(`t.category_id = $${idx++}`); params.push(categoryId); }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const { rows } = await db.query(
      `SELECT t.*, c.name AS category_name, u.name AS employee_name
       FROM tickets t JOIN categories c ON c.id = t.category_id
       JOIN users u ON u.id = t.employee_id
       ${where} ORDER BY t.created_at DESC LIMIT $1 OFFSET $2`, params);
    return rows;
  },

  // Find tickets approaching or past SLA for cron job
  async findDue({ hoursAhead = 2 } = {}) {
    const { rows } = await db.query(
      `SELECT t.*, c.name AS category_name,
              u.name AS employee_name, u.email AS employee_email,
              a.email AS assignee_email
       FROM tickets t
       JOIN categories c ON c.id = t.category_id
       JOIN users u ON u.id = t.employee_id
       LEFT JOIN users a ON a.id = t.assigned_to
       WHERE t.status NOT IN ('closed','resolved')
         AND t.due_at IS NOT NULL
         AND t.due_at <= NOW() + ($1 || ' hours')::INTERVAL`,
      [hoursAhead]);
    return rows;
  },

  async findForRepeatCheck(employeeId, categoryId) {
    const { rows } = await db.query(
      `SELECT COUNT(*) AS cnt FROM tickets
       WHERE employee_id = $1 AND category_id = $2
         AND created_at > NOW() - INTERVAL '90 days'
         AND status NOT IN ('closed')`,
      [employeeId, categoryId]);
    return parseInt(rows[0].cnt, 10);
  },
};

// ─── TICKET ESCALATIONS ──────────────────────────────────────────────────────
const TicketEscalation = {
  async create({ ticketId, fromLevel, toLevel, reason, escalatedBy }) {
    const { rows } = await db.query(
      `INSERT INTO ticket_escalations (ticket_id, from_level, to_level, reason, escalated_by)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [ticketId, fromLevel, toLevel, reason, escalatedBy || null]);
    return rows[0];
  },

  async listByTicket(ticketId) {
    const { rows } = await db.query(
      `SELECT e.*, u.name AS escalated_by_name
       FROM ticket_escalations e LEFT JOIN users u ON u.id = e.escalated_by
       WHERE e.ticket_id = $1 ORDER BY e.created_at ASC`, [ticketId]);
    return rows;
  },
};

// ─── AUDIT LOG ───────────────────────────────────────────────────────────────
const AuditLog = {
  async create({ ticketId, actorId, action, oldValue, newValue }) {
    await db.query(
      `INSERT INTO ticket_audit_log (ticket_id, actor_id, action, old_value, new_value)
       VALUES ($1,$2,$3,$4,$5)`,
      [ticketId, actorId || null, action,
       oldValue ? JSON.stringify(oldValue) : null,
       newValue ? JSON.stringify(newValue) : null]);
  },
};

// ─── FEEDBACK ────────────────────────────────────────────────────────────────
const Feedback = {
  async create({ ticketId, sessionId, userId, rating, comment }) {
    const { rows } = await db.query(
      `INSERT INTO feedback (ticket_id, session_id, user_id, rating, comment)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [ticketId || null, sessionId || null, userId, rating, comment || null]);
    return rows[0];
  },
};

// ─── ANALYTICS ───────────────────────────────────────────────────────────────
const Analytics = {
  async summary({ from, to } = {}) {
    const { rows: overview } = await db.query(
      `SELECT
         COUNT(*) FILTER (WHERE TRUE) AS total,
         COUNT(*) FILTER (WHERE status IN ('closed','resolved')) AS resolved,
         COUNT(*) FILTER (WHERE status = 'escalated') AS escalated,
         COUNT(*) FILTER (WHERE status NOT IN ('closed','resolved','escalated')) AS open,
         ROUND(AVG(EXTRACT(EPOCH FROM (COALESCE(resolved_at, NOW()) - created_at)) / 3600)::NUMERIC, 2) AS avg_resolution_hours
       FROM tickets
       WHERE ($1::TIMESTAMPTZ IS NULL OR created_at >= $1)
         AND ($2::TIMESTAMPTZ IS NULL OR created_at <= $2)`,
      [from || null, to || null]);

    const { rows: by_category } = await db.query(
      `SELECT c.name AS category, COUNT(*) AS total,
              COUNT(*) FILTER (WHERE t.status IN ('closed','resolved')) AS resolved,
              ROUND(AVG(EXTRACT(EPOCH FROM (COALESCE(t.resolved_at, NOW()) - t.created_at)) / 3600)::NUMERIC, 2) AS avg_hours
       FROM tickets t JOIN categories c ON c.id = t.category_id
       WHERE ($1::TIMESTAMPTZ IS NULL OR t.created_at >= $1)
         AND ($2::TIMESTAMPTZ IS NULL OR t.created_at <= $2)
       GROUP BY c.name ORDER BY total DESC`,
      [from || null, to || null]);

    const { rows: feedback_stats } = await db.query(
      `SELECT ROUND(AVG(rating)::NUMERIC, 2) AS avg_rating,
              COUNT(*) AS total_feedback
       FROM feedback
       WHERE ($1::TIMESTAMPTZ IS NULL OR created_at >= $1)
         AND ($2::TIMESTAMPTZ IS NULL OR created_at <= $2)`,
      [from || null, to || null]);

    const { rows: escalation_freq } = await db.query(
      `SELECT COUNT(DISTINCT ticket_id) AS escalated_tickets,
              ROUND(COUNT(DISTINCT ticket_id)::NUMERIC /
                NULLIF((SELECT COUNT(*) FROM tickets WHERE ($1::TIMESTAMPTZ IS NULL OR created_at >= $1)),0) * 100, 1) AS escalation_rate
       FROM ticket_escalations
       WHERE ($1::TIMESTAMPTZ IS NULL OR created_at >= $1)`,
      [from || null]);

    return {
      overview: overview[0],
      by_category,
      feedback: feedback_stats[0],
      escalations: escalation_freq[0],
    };
  },
};

module.exports = { User, Category, KnowledgeBase, ChatSession, ChatMessage, Ticket, TicketEscalation, AuditLog, Feedback, Analytics };
