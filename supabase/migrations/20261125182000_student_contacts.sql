alter table public.students
  add column if not exists contacts jsonb not null default '[]'::jsonb;

do $$
begin
  alter table public.students
    add constraint students_contacts_is_array
    check (jsonb_typeof(contacts) = 'array');
exception
  when duplicate_object then null;
end
$$;
