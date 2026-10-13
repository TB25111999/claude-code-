-- Erweiterung für Push-Benachrichtigungen.
-- Im Supabase-Dashboard unter "SQL Editor" komplett einfügen und "Run" drücken.
-- Das Skript kann gefahrlos mehrfach ausgeführt werden.

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
