-- HR Grievance Redressal System — Initial Schema

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Roles enum
CREATE TYPE user_role AS ENUM ('employee', 'hrbp', 'px_lead', 'admin');

-- Ticket severity enum
CREATE TYPE ticket_severity AS ENUM ('low', 'medium', 'high', 'critical');

-- Ticket status enum
CREATE TYPE ticket_status AS ENUM (
  'open', 'in_progress', 'pending_employee', 'escalated', 'resolved', 'closed', 'reopened'
);

-- Escalation level enum
CREATE TYPE escalation_level AS ENUM ('ticket_owner', 'hrbp', 'px_lead', 'leadership');

-- ─── USERS ──────────────────────────────────────────────────────────────────
CREATE TABLE users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id   VARCHAR(50) UNIQUE NOT NULL,
  name          VARCHAR(200) NOT NULL,
  email         VARCHAR(255) UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role          user_role NOT NULL DEFAULT 'employee',
  department    VARCHAR(100),
  manager_id    UUID REFERENCES users(id),
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_users_employee_id ON users(employee_id);
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_manager_id ON users(manager_id);

-- ─── CATEGORIES ─────────────────────────────────────────────────────────────
CREATE TABLE categories (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name            VARCHAR(100) UNIQUE NOT NULL,
  slug            VARCHAR(100) UNIQUE NOT NULL,
  owner_role      user_role NOT NULL DEFAULT 'hrbp',
  sla_low_days    INT NOT NULL DEFAULT 5,
  sla_medium_days INT NOT NULL DEFAULT 3,
  sla_high_days   INT NOT NULL DEFAULT 1,
  sla_critical_hours INT NOT NULL DEFAULT 4,
  is_active       BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE sub_categories (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id UUID NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  name        VARCHAR(150) NOT NULL,
  slug        VARCHAR(150) NOT NULL,
  UNIQUE (category_id, slug)
);

-- Seed categories from PRD
INSERT INTO categories (name, slug, sla_low_days, sla_medium_days, sla_high_days, sla_critical_hours) VALUES
  ('Leave & Attendance',      'leave-attendance',        5, 3, 1, 4),
  ('Payroll & Compensation',  'payroll-compensation',    5, 3, 1, 4),
  ('HRMS / Documentation',    'hrms-documentation',      5, 3, 1, 4),
  ('Workplace / Manager',     'workplace-manager',       5, 3, 1, 4),
  ('Policy Clarification',    'policy-clarification',    5, 3, 1, 4),
  ('Performance / Growth',    'performance-growth',      5, 3, 1, 4),
  ('Exit / Separation',       'exit-separation',         5, 3, 1, 4),
  ('Sensitive / Confidential','sensitive-confidential',  3, 2, 1, 2);

INSERT INTO sub_categories (category_id, name, slug) VALUES
  ((SELECT id FROM categories WHERE slug='leave-attendance'), 'Leave balance', 'leave-balance'),
  ((SELECT id FROM categories WHERE slug='leave-attendance'), 'Apply for leave', 'apply-leave'),
  ((SELECT id FROM categories WHERE slug='leave-attendance'), 'Attendance correction', 'attendance-correction'),
  ((SELECT id FROM categories WHERE slug='leave-attendance'), 'Leave rejection clarification', 'leave-rejection'),
  ((SELECT id FROM categories WHERE slug='leave-attendance'), 'Shift/roster concerns', 'shift-roster'),
  ((SELECT id FROM categories WHERE slug='payroll-compensation'), 'Payslip explanation', 'payslip'),
  ((SELECT id FROM categories WHERE slug='payroll-compensation'), 'Salary breakup/CTC', 'salary-ctc'),
  ((SELECT id FROM categories WHERE slug='payroll-compensation'), 'Incentive queries', 'incentive'),
  ((SELECT id FROM categories WHERE slug='payroll-compensation'), 'Reimbursement status', 'reimbursement'),
  ((SELECT id FROM categories WHERE slug='payroll-compensation'), 'Salary discrepancies', 'salary-discrepancy'),
  ((SELECT id FROM categories WHERE slug='payroll-compensation'), 'FNF', 'fnf'),
  ((SELECT id FROM categories WHERE slug='hrms-documentation'), 'HR letters download', 'hr-letters'),
  ((SELECT id FROM categories WHERE slug='hrms-documentation'), 'Profile update', 'profile-update'),
  ((SELECT id FROM categories WHERE slug='hrms-documentation'), 'Bank details update', 'bank-details'),
  ((SELECT id FROM categories WHERE slug='hrms-documentation'), 'Employment verification', 'employment-verification'),
  ((SELECT id FROM categories WHERE slug='hrms-documentation'), 'HRMS login/access', 'hrms-access'),
  ((SELECT id FROM categories WHERE slug='workplace-manager'), 'Manager behavior', 'manager-behavior'),
  ((SELECT id FROM categories WHERE slug='workplace-manager'), 'Workload concerns', 'workload'),
  ((SELECT id FROM categories WHERE slug='workplace-manager'), 'Role clarity', 'role-clarity'),
  ((SELECT id FROM categories WHERE slug='workplace-manager'), 'Team conflicts', 'team-conflicts'),
  ((SELECT id FROM categories WHERE slug='workplace-manager'), 'Communication issues', 'communication'),
  ((SELECT id FROM categories WHERE slug='workplace-manager'), 'Unfair treatment', 'unfair-treatment'),
  ((SELECT id FROM categories WHERE slug='policy-clarification'), 'Working hours', 'working-hours'),
  ((SELECT id FROM categories WHERE slug='policy-clarification'), 'Leave policy', 'leave-policy'),
  ((SELECT id FROM categories WHERE slug='policy-clarification'), 'WFH/WFO', 'wfh-wfo'),
  ((SELECT id FROM categories WHERE slug='policy-clarification'), 'Incentive/appraisal policy', 'incentive-appraisal-policy'),
  ((SELECT id FROM categories WHERE slug='policy-clarification'), 'Code of conduct', 'code-of-conduct'),
  ((SELECT id FROM categories WHERE slug='performance-growth'), 'Feedback clarity', 'feedback-clarity'),
  ((SELECT id FROM categories WHERE slug='performance-growth'), 'Target clarity', 'target-clarity'),
  ((SELECT id FROM categories WHERE slug='performance-growth'), 'Appraisal concerns', 'appraisal'),
  ((SELECT id FROM categories WHERE slug='performance-growth'), 'Career growth', 'career-growth'),
  ((SELECT id FROM categories WHERE slug='exit-separation'), 'Notice period', 'notice-period'),
  ((SELECT id FROM categories WHERE slug='exit-separation'), 'Relieving process', 'relieving'),
  ((SELECT id FROM categories WHERE slug='exit-separation'), 'FNF exit', 'fnf-exit'),
  ((SELECT id FROM categories WHERE slug='exit-separation'), 'Exit formalities', 'exit-formalities'),
  ((SELECT id FROM categories WHERE slug='sensitive-confidential'), 'Harassment', 'harassment'),
  ((SELECT id FROM categories WHERE slug='sensitive-confidential'), 'Bias/discrimination', 'discrimination'),
  ((SELECT id FROM categories WHERE slug='sensitive-confidential'), 'Psychological safety', 'psychological-safety'),
  ((SELECT id FROM categories WHERE slug='sensitive-confidential'), 'Ethical concerns', 'ethical-concerns');

-- ─── KNOWLEDGE BASE ──────────────────────────────────────────────────────────
CREATE TABLE knowledge_base (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id     UUID REFERENCES categories(id),
  sub_category_id UUID REFERENCES sub_categories(id),
  title           VARCHAR(300) NOT NULL,
  content         TEXT NOT NULL,
  keywords        TEXT[] NOT NULL DEFAULT '{}',
  policy_url      VARCHAR(500),
  file_key        VARCHAR(500),      -- DigitalOcean Spaces object key
  uploaded_by     UUID REFERENCES users(id),
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_kb_category ON knowledge_base(category_id);
CREATE INDEX idx_kb_sub_category ON knowledge_base(sub_category_id);
CREATE INDEX idx_kb_keywords ON knowledge_base USING GIN(keywords);

-- ─── CHAT SESSIONS ──────────────────────────────────────────────────────────
CREATE TABLE chat_sessions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES users(id),
  category_id     UUID REFERENCES categories(id),
  sub_category_id UUID REFERENCES sub_categories(id),
  status          VARCHAR(30) NOT NULL DEFAULT 'active',  -- active | resolved | escalated
  resolved_via    VARCHAR(20),  -- 'kb' | 'ticket'
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_sessions_user ON chat_sessions(user_id);
CREATE INDEX idx_sessions_status ON chat_sessions(status);

-- ─── CHAT MESSAGES ──────────────────────────────────────────────────────────
CREATE TABLE chat_messages (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id  UUID NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
  role        VARCHAR(10) NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content     TEXT NOT NULL,
  metadata    JSONB,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_messages_session ON chat_messages(session_id);

-- ─── TICKETS ────────────────────────────────────────────────────────────────
CREATE TABLE tickets (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_number     SERIAL UNIQUE,
  session_id        UUID REFERENCES chat_sessions(id),
  employee_id       UUID NOT NULL REFERENCES users(id),
  category_id       UUID NOT NULL REFERENCES categories(id),
  sub_category_id   UUID REFERENCES sub_categories(id),
  description       TEXT NOT NULL,
  severity          ticket_severity NOT NULL DEFAULT 'medium',
  status            ticket_status NOT NULL DEFAULT 'open',
  is_confidential   BOOLEAN NOT NULL DEFAULT FALSE,
  department        VARCHAR(100),
  manager_name      VARCHAR(200),
  assigned_to       UUID REFERENCES users(id),
  keka_ticket_id    VARCHAR(100),
  due_at            TIMESTAMPTZ,
  resolved_at       TIMESTAMPTZ,
  closed_at         TIMESTAMPTZ,
  reminder_50_sent  BOOLEAN NOT NULL DEFAULT FALSE,
  reminder_100_sent BOOLEAN NOT NULL DEFAULT FALSE,
  -- Encrypted description for confidential tickets (pgcrypto)
  description_enc   BYTEA,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_tickets_employee ON tickets(employee_id);
CREATE INDEX idx_tickets_status ON tickets(status);
CREATE INDEX idx_tickets_assigned ON tickets(assigned_to);
CREATE INDEX idx_tickets_due ON tickets(due_at) WHERE status NOT IN ('closed', 'resolved');
CREATE INDEX idx_tickets_confidential ON tickets(is_confidential);

-- ─── TICKET ESCALATIONS ─────────────────────────────────────────────────────
CREATE TABLE ticket_escalations (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id     UUID NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  from_level    escalation_level NOT NULL,
  to_level      escalation_level NOT NULL,
  reason        TEXT NOT NULL,
  escalated_by  UUID REFERENCES users(id),  -- NULL = auto
  notified      BOOLEAN NOT NULL DEFAULT FALSE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_escalations_ticket ON ticket_escalations(ticket_id);

-- ─── TICKET AUDIT LOG ────────────────────────────────────────────────────────
CREATE TABLE ticket_audit_log (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id   UUID NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  actor_id    UUID REFERENCES users(id),  -- NULL = system
  action      VARCHAR(100) NOT NULL,
  old_value   JSONB,
  new_value   JSONB,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_audit_ticket ON ticket_audit_log(ticket_id);

-- ─── FEEDBACK ────────────────────────────────────────────────────────────────
CREATE TABLE feedback (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id   UUID REFERENCES tickets(id),
  session_id  UUID REFERENCES chat_sessions(id),
  user_id     UUID NOT NULL REFERENCES users(id),
  rating      SMALLINT CHECK (rating BETWEEN 1 AND 5),
  comment     TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── UPDATED_AT TRIGGER ──────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;

CREATE TRIGGER trg_users_updated         BEFORE UPDATE ON users         FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_categories_updated    BEFORE UPDATE ON categories    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_kb_updated            BEFORE UPDATE ON knowledge_base FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_sessions_updated      BEFORE UPDATE ON chat_sessions  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_tickets_updated       BEFORE UPDATE ON tickets        FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ─── DEFAULT ADMIN USER (change password immediately!) ──────────────────────
INSERT INTO users (employee_id, name, email, password_hash, role) VALUES
  ('ADMIN001', 'System Admin', 'admin@company.com',
   '$2a$12$RPNX1HfE1xSZcDUAzTNGSuxLZk0TeEN.Ue.CcLGRW8.BeE1O/pX8S',  -- password: Admin@1234
   'admin');
