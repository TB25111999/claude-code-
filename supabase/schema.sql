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

-- ---------------------------------------------------------------
-- Push-Benachrichtigungen (identisch mit supabase/benachrichtigungen.sql)
-- ---------------------------------------------------------------

-- Erinnerung mit Uhrzeit pro Aufgabe
alter table public.todos add column if not exists remind_at   timestamptz;
alter table public.todos add column if not exists reminded_at timestamptz;

-- Geräte, die Benachrichtigungen empfangen (ein Eintrag pro iPhone/iPad)
create table if not exists public.push_subscriptions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  endpoint    text not null unique,
  p256dh      text not null,
  auth        text not null,
  user_agent  text,
  created_at  timestamptz not null default now()
);
create index if not exists push_subscriptions_user_id_idx on public.push_subscriptions (user_id);

-- Einstellungen: Tagesüberblick, "Startet heute", Uhrzeit, Zeitzone
create table if not exists public.notification_settings (
  user_id           uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  digest_enabled    boolean not null default false,
  start_enabled     boolean not null default false,
  notify_time       text not null default '07:00' check (notify_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  timezone          text not null default 'Europe/Berlin',
  last_morning_date date,
  updated_at        timestamptz not null default now()
);

-- Schlüssel für den Versand; nur der Server darf sie lesen (keine Policies = kein Zugriff aus der App)
create table if not exists public.push_config (
  id            int primary key default 1 check (id = 1),
  vapid_public  text not null,
  vapid_private text not null,
  created_at    timestamptz not null default now()
);

alter table public.push_subscriptions enable row level security;
alter table public.notification_settings enable row level security;
alter table public.push_config enable row level security;

drop policy if exists "push: eigene Geräte" on public.push_subscriptions;
create policy "push: eigene Geräte" on public.push_subscriptions
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "benachrichtigungen: eigene Einstellungen" on public.notification_settings;
create policy "benachrichtigungen: eigene Einstellungen" on public.notification_settings
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
