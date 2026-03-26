-- Migration 003: Pre-create HR head and admin accounts
-- When these users sign in with Google, their existing rows (with correct roles)
-- will be updated via ON CONFLICT (email) DO UPDATE in the upsert logic — roles preserved.
-- google_id / avatar_url are filled on first Google login.

-- Rajesh Rajan — HR Head (hrbp role)
INSERT INTO users (employee_id, name, email, password_hash, role)
VALUES (
  'HR001',
  'Rajesh Rajan',
  'rajesh.rajan@expinfi.com',
  NULL,
  'hrbp'
)
ON CONFLICT (email) DO UPDATE
  SET role = EXCLUDED.role,
      name = EXCLUDED.name;

-- Uday Kiran — Admin
INSERT INTO users (employee_id, name, email, password_hash, role)
VALUES (
  'ADMIN001',
  'Uday Kiran',
  'uday@expinfi.com',
  NULL,
  'admin'
)
ON CONFLICT (email) DO UPDATE
  SET role = EXCLUDED.role,
      name = EXCLUDED.name;
