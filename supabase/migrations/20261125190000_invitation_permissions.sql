alter table public.user_profiles
  add column if not exists can_view_records boolean not null default false,
  add column if not exists can_edit_records boolean not null default false,
  add column if not exists can_add_records boolean not null default false;

alter table public.invitation_codes
  add column if not exists can_view_records boolean not null default true,
  add column if not exists can_edit_records boolean not null default false,
  add column if not exists can_add_records boolean not null default false;

drop function if exists public.verify_invitation(text);

create function public.verify_invitation(p_code text)
returns table(
  valid boolean,
  role app_role,
  can_view_records boolean,
  can_edit_records boolean,
  can_add_records boolean
)
language sql security definer set search_path = public as $$
  select true, i.role, i.can_view_records, i.can_edit_records, i.can_add_records
  from public.invitation_codes i
  where i.code = upper(trim(p_code))
    and i.active
    and i.uses < i.max_uses
    and (i.expires_at is null or i.expires_at > now())
    and i.role <> 'Super Admin'
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

  select i.id, i.role, i.can_view_records, i.can_edit_records, i.can_add_records into found
  from public.invitation_codes i
  where i.code = upper(trim(p_code))
    and i.active
    and i.uses < i.max_uses
    and (i.expires_at is null or i.expires_at > now())
    and i.role <> 'Super Admin'
  for update;

  if found.id is null then
    raise exception 'Invitation code is invalid or has expired';
  end if;

  update public.invitation_codes
  set uses = uses + 1
  where id = found.id;

  update public.user_profiles
  set role = found.role,
      can_view_records = found.can_view_records,
      can_edit_records = found.can_edit_records,
      can_add_records = found.can_add_records,
      updated_at = now()
  where id = p_user_id;

  return found.role;
end;
$$;

revoke all on function public.claim_invitation(text, uuid) from public, anon, authenticated;
grant execute on function public.claim_invitation(text, uuid) to service_role;

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

notify pgrst, 'reload schema';
