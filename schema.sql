-- Личный трекер целей: схема для Supabase.
-- Вставьте целиком в Supabase → SQL Editor → New query и нажмите Run.

-- Все данные трекера: одна строка = один документ (задача, сфера, день, экзамен…)
create table if not exists public.docs (
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  collection text not null,
  id         text not null,
  data       jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (user_id, collection, id)
);

alter table public.docs enable row level security;

drop policy if exists "docs: read own"   on public.docs;
drop policy if exists "docs: insert own" on public.docs;
drop policy if exists "docs: update own" on public.docs;
drop policy if exists "docs: delete own" on public.docs;
create policy "docs: read own"   on public.docs for select using (auth.uid() = user_id);
create policy "docs: insert own" on public.docs for insert with check (auth.uid() = user_id);
create policy "docs: update own" on public.docs for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "docs: delete own" on public.docs for delete using (auth.uid() = user_id);

-- Живое обновление между телефоном и ноутбуком
do $$ begin
  alter publication supabase_realtime add table public.docs;
exception when duplicate_object then null;
end $$;

-- Секретный код, по которому виджет читает ваши данные (без пароля)
create table if not exists public.widget_tokens (
  user_id    uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  token      text not null unique,
  created_at timestamptz not null default now()
);

alter table public.widget_tokens enable row level security;

drop policy if exists "tokens: read own"   on public.widget_tokens;
drop policy if exists "tokens: insert own" on public.widget_tokens;
drop policy if exists "tokens: update own" on public.widget_tokens;
drop policy if exists "tokens: delete own" on public.widget_tokens;
create policy "tokens: read own"   on public.widget_tokens for select using (auth.uid() = user_id);
create policy "tokens: insert own" on public.widget_tokens for insert with check (auth.uid() = user_id);
create policy "tokens: update own" on public.widget_tokens for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "tokens: delete own" on public.widget_tokens for delete using (auth.uid() = user_id);

-- Только чтение для виджета: задачи, сферы, экзамены, IELTS, настройки и последние 3 дня
create or replace function public.widget_data(p_token text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(jsonb_build_object('c', d.collection, 'id', d.id, 'data', d.data)), '[]'::jsonb)
  from public.docs d
  join public.widget_tokens w on w.user_id = d.user_id
  where length(p_token) >= 24
    and w.token = p_token
    and (d.collection <> 'days' or d.id >= to_char(now() - interval '3 days', 'YYYY-MM-DD'));
$$;

revoke all on function public.widget_data(text) from public;
grant execute on function public.widget_data(text) to anon, authenticated;
