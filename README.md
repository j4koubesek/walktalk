# WalkTalk + Supabase (MVP v2)

Opraveno:
- Tlačítka „Najít / Vytvořit / Můj profil“ přepínají záložky (ne scroll) – funguje i v iframe.
- „Publikovat“ po úspěchu přepne na „Najít“.
- Připojení k Supabase, realtime refresh, webhooky `joined` a `capacity_reached`.

## Nastavení

### 1) Supabase – projekt + SQL
V Supabase (Settings → API) zkopíruj `Project URL` a `anon key`.
V **SQL Editoru** spusť:

```sql
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

create table if not exists public.walk_participants (
  id uuid primary key default gen_random_uuid(),
  walk_id uuid not null references public.walks(id) on delete cascade,
  joiner_name text not null,
  joiner_email text not null,
  joined_at timestamptz default now()
);

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

Volitelné (doporučeno pro živý refresh): **Database → Replication → Realtime** → povolit pro `walks` a `walk_participants`.

### 2) Vercel – proměnné prostředí
V projektu nastav a redeploy:
- `VITE_SUPABASE_URL` = (Project URL)
- `VITE_SUPABASE_ANON` = (anon key)
- `VITE_WEBHOOK_URL` = (URL z Make – Custom Webhook)

### 3) Make – e-maily (SMTP)
Router se dvěma větvemi:
- `event = joined` → SMTP Email (To: `data → host → email` [+ CC joiner])
- `event = capacity_reached` → SMTP Email (To: host)

Hotovo.
