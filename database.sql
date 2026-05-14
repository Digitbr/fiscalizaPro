-- FiscalizaPro - modelagem PostgreSQL de producao
-- Requer extensoes:
--   CREATE EXTENSION IF NOT EXISTS pgcrypto;
--   CREATE EXTENSION IF NOT EXISTS citext;

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS citext;

CREATE TYPE user_status AS ENUM ('ACTIVE', 'INACTIVE', 'LOCKED');
CREATE TYPE employee_status AS ENUM ('ACTIVE', 'INACTIVE');
CREATE TYPE route_status AS ENUM ('SCHEDULED', 'IN_PROGRESS', 'COMPLETED', 'COMPLETED_WITH_OCCURRENCE', 'DELAYED', 'CANCELED', 'PENDING_VALIDATION');
CREATE TYPE occurrence_status AS ENUM ('OPEN', 'UNDER_REVIEW', 'IN_TREATMENT', 'RESOLVED', 'CANCELED', 'CRITICAL', 'REOPENED');
CREATE TYPE task_status AS ENUM ('OPEN', 'IN_PROGRESS', 'WAITING_VALIDATION', 'RESOLVED', 'CANCELED', 'DELAYED');
CREATE TYPE priority_level AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

CREATE TABLE roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  description text NOT NULL
);

CREATE TABLE role_permissions (
  role_id uuid NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  permission_id uuid NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
  PRIMARY KEY (role_id, permission_id)
);

CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  role_id uuid NOT NULL REFERENCES roles(id),
  name text NOT NULL,
  email citext NOT NULL UNIQUE,
  enrollment citext NOT NULL UNIQUE,
  area text,
  status user_status NOT NULL DEFAULT 'ACTIVE',
  password_hash text NOT NULL,
  password_salt text NOT NULL,
  failed_login_count integer NOT NULL DEFAULT 0,
  locked_until timestamptz,
  last_login_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE TABLE service_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'ACTIVE',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE employees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  enrollment citext NOT NULL,
  full_name text NOT NULL,
  cpf text NOT NULL,
  position text NOT NULL,
  service_type_id uuid REFERENCES service_types(id),
  service_type_name text NOT NULL,
  unit text NOT NULL,
  work_post text,
  shift_scale text,
  work_hours text,
  admission_date date,
  termination_date date,
  status employee_status NOT NULL DEFAULT 'ACTIVE',
  supervisor_id uuid REFERENCES users(id),
  supervisor_name text,
  company text,
  contract_code text,
  contract_end_date date,
  phone text,
  email citext,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  CONSTRAINT employees_cpf_digits CHECK (cpf ~ '^[0-9]{11}$')
);

CREATE UNIQUE INDEX employees_active_cpf_uidx ON employees (cpf) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX employees_active_enrollment_uidx ON employees (enrollment) WHERE deleted_at IS NULL;
CREATE INDEX employees_status_idx ON employees (status);
CREATE INDEX employees_unit_idx ON employees (unit);
CREATE INDEX employees_service_idx ON employees (service_type_name);
CREATE INDEX employees_supervisor_idx ON employees (supervisor_id);
CREATE INDEX employees_contract_end_idx ON employees (contract_end_date) WHERE status = 'ACTIVE';

CREATE TABLE employee_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES employees(id),
  movement_type text NOT NULL,
  movement_date date NOT NULL,
  registered_by uuid NOT NULL REFERENCES users(id),
  reason text NOT NULL,
  previous_unit text,
  new_unit text,
  previous_post text,
  new_post text,
  previous_scale text,
  new_scale text,
  previous_supervisor_id uuid REFERENCES users(id),
  new_supervisor_id uuid REFERENCES users(id),
  notes text,
  status text NOT NULL DEFAULT 'CONFIRMED',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX employee_movements_employee_idx ON employee_movements (employee_id, movement_date DESC);
CREATE INDEX employee_movements_type_idx ON employee_movements (movement_type);

CREATE TABLE routes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  fiscal_id uuid NOT NULL REFERENCES users(id),
  supervisor_id uuid REFERENCES users(id),
  unit text NOT NULL,
  client text,
  scheduled_time time,
  frequency text,
  week_days text[] NOT NULL DEFAULT '{}',
  services text[] NOT NULL DEFAULT '{}',
  status route_status NOT NULL DEFAULT 'SCHEDULED',
  requires_photo boolean NOT NULL DEFAULT false,
  requires_geolocation boolean NOT NULL DEFAULT false,
  deadline_hours integer NOT NULL DEFAULT 4,
  observations text,
  created_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE INDEX routes_fiscal_idx ON routes (fiscal_id, status);
CREATE INDEX routes_supervisor_idx ON routes (supervisor_id, status);
CREATE INDEX routes_unit_idx ON routes (unit);

CREATE TABLE route_points (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  route_id uuid NOT NULL REFERENCES routes(id) ON DELETE CASCADE,
  point_order integer NOT NULL,
  name text NOT NULL,
  expected_time time,
  requires_photo boolean,
  requires_geolocation boolean,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (route_id, point_order)
);

CREATE TABLE route_checklist_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  route_point_id uuid NOT NULL REFERENCES route_points(id) ON DELETE CASCADE,
  item_order integer NOT NULL,
  question text NOT NULL,
  answer_type text NOT NULL DEFAULT 'YES_NO',
  required boolean NOT NULL DEFAULT true,
  UNIQUE (route_point_id, item_order)
);

CREATE TABLE inspections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  route_id uuid NOT NULL REFERENCES routes(id),
  fiscal_id uuid NOT NULL REFERENCES users(id),
  supervisor_id uuid REFERENCES users(id),
  unit text NOT NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  status route_status NOT NULL DEFAULT 'IN_PROGRESS',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX inspections_route_idx ON inspections (route_id, started_at DESC);
CREATE INDEX inspections_fiscal_idx ON inspections (fiscal_id, started_at DESC);
CREATE INDEX inspections_status_idx ON inspections (status);

CREATE TABLE inspection_points (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  inspection_id uuid NOT NULL REFERENCES inspections(id) ON DELETE CASCADE,
  route_point_id uuid NOT NULL REFERENCES route_points(id),
  visited_at timestamptz NOT NULL DEFAULT now(),
  location_text text,
  latitude numeric(10, 7),
  longitude numeric(10, 7),
  evidence_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (inspection_id, route_point_id)
);

CREATE TABLE inspection_checklist_answers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  inspection_point_id uuid NOT NULL REFERENCES inspection_points(id) ON DELETE CASCADE,
  checklist_item_id uuid REFERENCES route_checklist_items(id),
  question_snapshot text NOT NULL,
  answer text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE occurrences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  protocol text NOT NULL UNIQUE,
  occurrence_type text NOT NULL,
  description text NOT NULL,
  service_related text NOT NULL,
  unit text NOT NULL,
  work_post text,
  employee_id uuid REFERENCES employees(id),
  fiscal_id uuid NOT NULL REFERENCES users(id),
  supervisor_id uuid REFERENCES users(id),
  route_id uuid REFERENCES routes(id),
  inspection_id uuid REFERENCES inspections(id),
  occurred_at timestamptz NOT NULL DEFAULT now(),
  priority priority_level NOT NULL DEFAULT 'MEDIUM',
  status occurrence_status NOT NULL DEFAULT 'OPEN',
  location_text text,
  latitude numeric(10, 7),
  longitude numeric(10, 7),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE INDEX occurrences_protocol_idx ON occurrences (protocol);
CREATE INDEX occurrences_status_idx ON occurrences (status);
CREATE INDEX occurrences_priority_idx ON occurrences (priority);
CREATE INDEX occurrences_unit_idx ON occurrences (unit);
CREATE INDEX occurrences_fiscal_idx ON occurrences (fiscal_id, occurred_at DESC);
CREATE INDEX occurrences_supervisor_idx ON occurrences (supervisor_id, occurred_at DESC);
CREATE INDEX occurrences_employee_idx ON occurrences (employee_id);

CREATE TABLE occurrence_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  occurrence_id uuid NOT NULL REFERENCES occurrences(id) ON DELETE CASCADE,
  actor_id uuid REFERENCES users(id),
  action text NOT NULL,
  details text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE service_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text,
  category text NOT NULL,
  priority priority_level NOT NULL DEFAULT 'MEDIUM',
  responsible_id uuid NOT NULL REFERENCES users(id),
  due_date date NOT NULL,
  status task_status NOT NULL DEFAULT 'OPEN',
  employee_id uuid REFERENCES employees(id),
  unit text NOT NULL,
  route_id uuid REFERENCES routes(id),
  occurrence_id uuid REFERENCES occurrences(id),
  created_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE INDEX service_tasks_responsible_idx ON service_tasks (responsible_id, status);
CREATE INDEX service_tasks_due_date_idx ON service_tasks (due_date) WHERE status NOT IN ('RESOLVED', 'CANCELED');
CREATE INDEX service_tasks_unit_idx ON service_tasks (unit);

CREATE TABLE service_task_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service_task_id uuid NOT NULL REFERENCES service_tasks(id) ON DELETE CASCADE,
  actor_id uuid NOT NULL REFERENCES users(id),
  comment text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE notices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  category text NOT NULL,
  body text NOT NULL,
  author_id uuid REFERENCES users(id),
  priority priority_level NOT NULL DEFAULT 'MEDIUM',
  target_roles text[] NOT NULL DEFAULT '{}',
  requires_read_confirmation boolean NOT NULL DEFAULT false,
  published_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  deleted_at timestamptz
);

CREATE INDEX notices_category_idx ON notices (category, published_at DESC);
CREATE INDEX notices_target_roles_idx ON notices USING gin (target_roles);

CREATE TABLE notice_reads (
  notice_id uuid NOT NULL REFERENCES notices(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  read_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (notice_id, user_id)
);

CREATE TABLE import_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  file_name text NOT NULL,
  imported_by uuid NOT NULL REFERENCES users(id),
  status text NOT NULL,
  total_rows integer NOT NULL DEFAULT 0,
  inserted_count integer NOT NULL DEFAULT 0,
  updated_count integer NOT NULL DEFAULT 0,
  ignored_count integer NOT NULL DEFAULT 0,
  error_count integer NOT NULL DEFAULT 0,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz
);

CREATE INDEX import_batches_imported_by_idx ON import_batches (imported_by, started_at DESC);

CREATE TABLE import_errors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  import_batch_id uuid NOT NULL REFERENCES import_batches(id) ON DELETE CASCADE,
  row_number integer NOT NULL,
  errors jsonb NOT NULL,
  raw_payload jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_type text NOT NULL,
  owner_id uuid NOT NULL,
  file_name text NOT NULL,
  mime_type text NOT NULL,
  storage_key text NOT NULL,
  size_bytes bigint NOT NULL,
  uploaded_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE INDEX attachments_owner_idx ON attachments (owner_type, owner_id);

CREATE TABLE audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid REFERENCES users(id),
  actor_name text,
  action text NOT NULL,
  entity text NOT NULL,
  entity_id text,
  details text,
  ip inet,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX audit_logs_actor_idx ON audit_logs (actor_id, created_at DESC);
CREATE INDEX audit_logs_entity_idx ON audit_logs (entity, entity_id);
CREATE INDEX audit_logs_action_idx ON audit_logs (action, created_at DESC);

CREATE TABLE dashboard_metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  metric_key text NOT NULL,
  metric_label text NOT NULL,
  scope_key text,
  metric_value numeric NOT NULL,
  calculated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX dashboard_metrics_scope_uidx ON dashboard_metrics (metric_key, COALESCE(scope_key, ''), calculated_at);

-- Views sugeridas para dashboards
CREATE VIEW vw_active_employees_by_service AS
SELECT service_type_name, count(*) AS total
FROM employees
WHERE status = 'ACTIVE' AND deleted_at IS NULL
GROUP BY service_type_name;

CREATE VIEW vw_open_occurrences_by_unit AS
SELECT unit, count(*) AS total
FROM occurrences
WHERE status NOT IN ('RESOLVED', 'CANCELED') AND deleted_at IS NULL
GROUP BY unit;
