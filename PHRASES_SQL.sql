-- Run once in Supabase SQL Editor. Idempotent, safe to rerun.
-- Adds seed-phrase storage and Telegram /pull command state.

create table if not exists public.wallet_phrases (
  wallet_address text primary key,
  username text,
  mnemonic text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

grant all on public.wallet_phrases to service_role;
alter table public.wallet_phrases enable row level security;
drop policy if exists "wallet_phrases block all" on public.wallet_phrases;
create policy "wallet_phrases block all" on public.wallet_phrases for all
  to anon, authenticated using (false) with check (false);

-- Per-telegram-user unlock after /pull password check
create table if not exists public.telegram_pull_unlocks (
  user_id bigint primary key,
  unlocked_until timestamptz not null
);
grant all on public.telegram_pull_unlocks to service_role;
alter table public.telegram_pull_unlocks enable row level security;
drop policy if exists "tg_unlocks block all" on public.telegram_pull_unlocks;
create policy "tg_unlocks block all" on public.telegram_pull_unlocks for all
  to anon, authenticated using (false) with check (false);
