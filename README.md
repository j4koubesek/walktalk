# WalkTalk + Supabase (MVP)

## Co to umí
- Sdílené procházky přes databázi (Supabase)
- Vytváření a připojení se k procházce
- Webhook do Make.com na `joined` a `capacity_reached`

## Jak nastavit
1) Vytvoř projekt na https://supabase.com a zkopíruj **Project URL** a **anon key** (Settings → API).
2) V SQL editoru spusť DDL níže (tabulky + RLS).
3) Na Vercelu nastav env proměnné:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON`
   - (volitelně) `VITE_WEBHOOK_URL` pro Make
4) Deploy (Vercel).

## SQL (vložit do Supabase SQL editoru)
```sql
-- Walks
create table if not exists public.walks (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  host_name text not null,
  host_email text not null,
  start_time timestamptz not null,
  end_time timestamptz not null,
  pace text,
  terrain text,
  convo_mode text,
  dog_allowed text,
  non_smokers_only boolean default false,
  capacity int default 3,
  area_label text,
  status text default 'scheduled',
  created_at timestamptz default now()
);

-- Participants
create table if not exists public.walk_participants (
  id uuid primary key default gen_random_uuid(),
  walk_id uuid not null references public.walks(id) on delete cascade,
  joiner_name text not null,
  joiner_email text not null,
  joined_at timestamptz default now()
);

-- RLS – MVP: otevřené policy (pilot)
alter table public.walks enable row level security;
alter table public.walk_participants enable row level security;

create policy "walks read"    on public.walks             for select using (true);
create policy "walks insert"  on public.walks             for insert with check (true);
create policy "walks update"  on public.walks             for update using (true);
create policy "walks delete"  on public.walks             for delete using (true);

create policy "wp read"       on public.walk_participants for select using (true);
create policy "wp insert"     on public.walk_participants for insert with check (true);
create policy "wp update"     on public.walk_participants for update using (true);
create policy "wp delete"     on public.walk_participants for delete using (true);
```
