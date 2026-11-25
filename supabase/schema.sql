create extension if not exists "pgcrypto";

do $$ begin
  create type app_role as enum (
    'Super Admin','Senior Pastor','Pastor','Church Administrator',
    'Sunday School Coordinator','Sunday School Teacher','Secretary',
    'Attendance Officer','Ministry Leader','Viewer'
  );
exception when duplicate_object then null;
end $$;

create table if not exists public.user_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  email text not null,
  role app_role not null default 'Viewer',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.invitation_codes (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  role app_role not null,
  created_by uuid references public.user_profiles(id),
  expires_at timestamptz,
  max_uses integer not null default 1,
  uses integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.students (
  id uuid primary key default gen_random_uuid(),
  registration_number text unique,
  full_name text not null,
  date_of_birth date,
  gender text,
  phone text,
  guardian_name text,
  guardian_phone text,
  contacts jsonb not null default '[]'::jsonb,
  ministry text not null default 'Sunday School',
  address text,
  active boolean not null default true,
  created_by uuid references public.user_profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.attendance_sessions (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  session_date date not null,
  session_type text not null,
  notes text,
  created_by uuid references public.user_profiles(id),
  created_at timestamptz not null default now()
);

create table if not exists public.attendance_records (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.attendance_sessions(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  status text not null check (status in ('present','absent','late','excused')),
  recorded_by uuid references public.user_profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(session_id, student_id)
);

alter table public.user_profiles enable row level security;
alter table public.invitation_codes enable row level security;
alter table public.students enable row level security;
alter table public.attendance_sessions enable row level security;
alter table public.attendance_records enable row level security;

create or replace function public.is_super_admin()
returns boolean language sql security definer set search_path = public as $$
  select exists (
    select 1 from public.user_profiles
    where id = auth.uid() and role = 'Super Admin' and active
  );
$$;

create or replace function public.has_management_role()
returns boolean language sql security definer set search_path = public as $$
  select exists (
    select 1 from public.user_profiles
    where id = auth.uid()
      and active
      and role in ('Super Admin','Senior Pastor','Pastor','Church Administrator','Sunday School Coordinator','Sunday School Teacher','Secretary','Attendance Officer','Ministry Leader')
  );
$$;

create policy "Users read own profile" on public.user_profiles
  for select using (id = auth.uid() or public.is_super_admin());
create policy "Super admins manage profiles" on public.user_profiles
  for all using (public.is_super_admin()) with check (public.is_super_admin());

create policy "Authorized users read invitations" on public.invitation_codes
  for select using (public.is_super_admin());
create policy "Super admins manage invitations" on public.invitation_codes
  for all using (public.is_super_admin()) with check (public.is_super_admin());

create policy "Authorized users read students" on public.students
  for select using (auth.uid() is not null);
create policy "Managers write students" on public.students
  for all using (public.has_management_role()) with check (public.has_management_role());

create policy "Authorized users read sessions" on public.attendance_sessions
  for select using (auth.uid() is not null);
create policy "Managers write sessions" on public.attendance_sessions
  for all using (public.has_management_role()) with check (public.has_management_role());

create policy "Authorized users read records" on public.attendance_records
  for select using (auth.uid() is not null);
create policy "Managers write records" on public.attendance_records
  for all using (public.has_management_role()) with check (public.has_management_role());

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.user_profiles (id, full_name, email, role)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name','New Member'), new.email, coalesce((new.raw_user_meta_data->>'role')::app_role, 'Viewer'));
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users for each row execute procedure public.handle_new_user();

create or replace function public.verify_invitation(p_code text)
returns table(valid boolean, role app_role)
language sql security definer set search_path = public as $$
  select true, i.role
  from public.invitation_codes i
  where i.code = upper(trim(p_code))
    and i.active
    and i.uses < i.max_uses
    and (i.expires_at is null or i.expires_at > now())
  limit 1;
$$;

revoke all on function public.verify_invitation(text) from public, anon, authenticated;
grant execute on function public.verify_invitation(text) to anon, authenticated, service_role;

create or replace function public.claim_invitation(p_code text, p_user_id uuid)
returns app_role
language plpgsql security definer set search_path = public as $$
declare
  found record;
begin
  if auth.uid() is not null and auth.uid() <> p_user_id then
    raise exception 'Identity mismatch';
  end if;

  select i.id, i.role into found
  from public.invitation_codes i
  where i.code = upper(trim(p_code))
    and i.active
    and i.uses < i.max_uses
    and (i.expires_at is null or i.expires_at > now())
  for update;

  if found.id is null then
    raise exception 'Invitation code is invalid or has expired';
  end if;

  update public.invitation_codes
  set uses = uses + 1
  where id = found.id;

  update public.user_profiles
  set role = found.role, updated_at = now()
  where id = p_user_id;

  return found.role;
end;
$$;

revoke all on function public.claim_invitation(text, uuid) from public, anon, authenticated;
grant execute on function public.claim_invitation(text, uuid) to service_role;
