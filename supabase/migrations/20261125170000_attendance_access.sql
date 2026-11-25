alter table public.user_profiles
  add column if not exists can_view_records boolean not null default false,
  add column if not exists can_edit_records boolean not null default false,
  add column if not exists can_add_records boolean not null default false;

alter table public.user_profiles
  alter column can_view_records set default false;

update public.user_profiles as profile
set role = 'Super Admin',
    can_view_records = true,
    can_edit_records = true,
    can_add_records = true,
    active = true,
    updated_at = now()
where profile.id = (
  select id
  from public.user_profiles
  order by created_at asc, id asc
  limit 1
)
and not exists (
  select 1
  from public.user_profiles
  where role = 'Super Admin'
);

update public.user_profiles
set can_view_records = true,
    can_edit_records = true,
    can_add_records = true
where role = 'Super Admin';

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.user_profiles (
    id, full_name, email, role,
    can_view_records, can_edit_records, can_add_records
  )
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', 'New Member'),
    new.email,
    'Viewer',
    false, false, false
  );
  return new;
end;
$$;

drop policy if exists "Super admins manage profiles" on public.user_profiles;
drop policy if exists "Super admins update profiles" on public.user_profiles;
create policy "Super admins update profiles" on public.user_profiles
  for update using (public.is_super_admin())
  with check (public.is_super_admin());

create or replace function public.can_view_attendance()
returns boolean language sql security definer set search_path = public as $$
  select exists (
    select 1 from public.user_profiles
    where id = auth.uid()
      and active
      and (role = 'Super Admin' or can_view_records)
  );
$$;

create or replace function public.can_edit_attendance()
returns boolean language sql security definer set search_path = public as $$
  select exists (
    select 1 from public.user_profiles
    where id = auth.uid()
      and active
      and (role = 'Super Admin' or (can_view_records and can_edit_records))
  );
$$;

create or replace function public.can_add_attendance()
returns boolean language sql security definer set search_path = public as $$
  select exists (
    select 1 from public.user_profiles
    where id = auth.uid()
      and active
      and (role = 'Super Admin' or (can_view_records and can_add_records))
  );
$$;

drop policy if exists "Authorized users read students" on public.students;
drop policy if exists "Managers write students" on public.students;
drop policy if exists "Students selectable by permission" on public.students;
drop policy if exists "Students insert by permission" on public.students;
drop policy if exists "Students update by permission" on public.students;
drop policy if exists "Super admins delete students" on public.students;

create policy "Students selectable by permission" on public.students
  for select using (public.can_view_attendance());
create policy "Students insert by permission" on public.students
  for insert with check (public.can_add_attendance());
create policy "Students update by permission" on public.students
  for update using (public.can_edit_attendance())
  with check (public.can_edit_attendance());
create policy "Super admins delete students" on public.students
  for delete using (public.is_super_admin());

drop policy if exists "Authorized users read sessions" on public.attendance_sessions;
drop policy if exists "Managers write sessions" on public.attendance_sessions;
drop policy if exists "Sessions selectable by permission" on public.attendance_sessions;
drop policy if exists "Sessions insert by permission" on public.attendance_sessions;
drop policy if exists "Sessions update by permission" on public.attendance_sessions;
drop policy if exists "Super admins delete sessions" on public.attendance_sessions;

create policy "Sessions selectable by permission" on public.attendance_sessions
  for select using (public.can_view_attendance());
create policy "Sessions insert by permission" on public.attendance_sessions
  for insert with check (public.can_add_attendance());
create policy "Sessions update by permission" on public.attendance_sessions
  for update using (public.can_edit_attendance())
  with check (public.can_edit_attendance());
create policy "Super admins delete sessions" on public.attendance_sessions
  for delete using (public.is_super_admin());

drop policy if exists "Authorized users read records" on public.attendance_records;
drop policy if exists "Managers write records" on public.attendance_records;
drop policy if exists "Records selectable by permission" on public.attendance_records;
drop policy if exists "Records insert by permission" on public.attendance_records;
drop policy if exists "Records update by permission" on public.attendance_records;
drop policy if exists "Super admins delete records" on public.attendance_records;

create policy "Records selectable by permission" on public.attendance_records
  for select using (public.can_view_attendance());
create policy "Records insert by permission" on public.attendance_records
  for insert with check (public.can_add_attendance());
create policy "Records update by permission" on public.attendance_records
  for update using (public.can_edit_attendance())
  with check (public.can_edit_attendance());
create policy "Super admins delete records" on public.attendance_records
  for delete using (public.is_super_admin());

alter table public.students
  drop constraint if exists students_created_by_fkey,
  add constraint students_created_by_fkey
    foreign key (created_by) references public.user_profiles(id) on delete set null;

alter table public.attendance_sessions
  drop constraint if exists attendance_sessions_created_by_fkey,
  add constraint attendance_sessions_created_by_fkey
    foreign key (created_by) references public.user_profiles(id) on delete set null;

alter table public.attendance_records
  drop constraint if exists attendance_records_recorded_by_fkey,
  add constraint attendance_records_recorded_by_fkey
    foreign key (recorded_by) references public.user_profiles(id) on delete set null;

alter table public.invitation_codes
  drop constraint if exists invitation_codes_created_by_fkey,
  add constraint invitation_codes_created_by_fkey
    foreign key (created_by) references public.user_profiles(id) on delete set null;
