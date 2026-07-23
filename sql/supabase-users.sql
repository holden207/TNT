-- TNT user accounts (run once in the Supabase SQL editor)
-- Server uses the service role key; keep RLS on and do not expose this table to anon clients.

create table if not exists public.users (
  id text primary key,
  username text not null unique,
  display_name text not null,
  role text not null check (role in ('viewer', 'analyst', 'admin')),
  status text not null check (status in ('pending', 'active', 'disabled')),
  password_hash text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  failed_attempts integer not null default 0,
  locked_until timestamptz,
  last_login_at timestamptz,
  approved_at timestamptz,
  approved_by text,
  disabled_at timestamptz,
  disabled_by text,
  auth_version integer not null default 1,
  must_change_password boolean not null default false,
  password_changed_at timestamptz
);

create index if not exists users_status_idx on public.users (status);
create index if not exists users_role_idx on public.users (role);

alter table public.users enable row level security;

-- No policies for anon/authenticated: only the service role (bypasses RLS) may access this table.
