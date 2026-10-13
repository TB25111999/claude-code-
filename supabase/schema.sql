-- Datenbank für die To-do-App.
-- Im Supabase-Dashboard unter "SQL Editor" komplett einfügen und "Run" drücken.
-- Das Skript kann gefahrlos mehrfach ausgeführt werden.

create table if not exists public.todos (
  id          uuid primary key,
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  text        text not null check (char_length(text) between 1 and 200),
  done        boolean not null default false,
  done_at     timestamptz,
  category    text not null default 'privat',
  priority    text not null default 'mittel' check (priority in ('hoch', 'mittel', 'niedrig')),
  start_date  date,
  end_date    date,
  note        text not null default '' check (char_length(note) <= 2000),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists todos_user_id_idx on public.todos (user_id);

create table if not exists public.user_settings (
  user_id     uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  custom_cats jsonb not null default '[]'::jsonb,
  updated_at  timestamptz not null default now()
);

-- Jede Person sieht und ändert nur ihre eigenen Zeilen.
alter table public.todos enable row level security;
alter table public.user_settings enable row level security;

drop policy if exists "todos: eigene Zeilen" on public.todos;
create policy "todos: eigene Zeilen" on public.todos
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "settings: eigene Zeile" on public.user_settings;
create policy "settings: eigene Zeile" on public.user_settings
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Live-Abgleich zwischen iPhone und iPad.
do $$
begin
  alter publication supabase_realtime add table public.todos;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.user_settings;
exception when duplicate_object then null;
end $$;
