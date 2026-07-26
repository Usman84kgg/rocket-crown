-- Rocket Crown — shared backend schema for Supabase (Postgres).
-- Run this once in the Supabase dashboard: SQL Editor -> New query -> paste -> Run.
-- It is safe to re-run: every object is created with "if not exists" / "or replace".

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------- tables

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  nickname text not null,
  email text,
  phone text,
  personal_id text not null default upper(substr(encode(gen_random_bytes(4), 'hex'), 1, 6)),
  balance numeric(14, 2) not null default 0 check (balance >= 0),
  banned boolean not null default false,
  is_admin boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.payment_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null check (kind in ('deposit', 'withdraw')),
  amount numeric(14, 2) not null check (amount > 0),
  method text,
  address text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create index if not exists payment_requests_pending_idx
  on public.payment_requests (status, created_at desc);

create table if not exists public.bets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  game text not null,
  amount numeric(14, 2) not null,
  choice text,
  won boolean not null,
  multiplier numeric(8, 2) not null default 0,
  payout numeric(14, 2) not null default 0,
  message text,
  created_at timestamptz not null default now()
);

create index if not exists bets_recent_idx on public.bets (created_at desc);

create table if not exists public.casino_settings (
  id boolean primary key default true check (id),
  deposits_enabled boolean not null default true,
  games jsonb not null default
    '{"mines":true,"crash":true,"dice":true,"roulette":true,"coinflip":true,"plinko":true}'::jsonb
);

insert into public.casino_settings (id) values (true) on conflict (id) do nothing;

-- ---------------------------------------------------------------- helpers

create or replace function public.is_admin()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select coalesce((select p.is_admin from public.profiles p where p.id = auth.uid()), false);
$$;

-- Privileged columns may only change through the SECURITY DEFINER functions
-- below, which set app.trusted_write for the duration of their transaction.
create or replace function public.guard_profile_columns()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if coalesce(current_setting('app.trusted_write', true), '') = 'on'
    or current_user in ('postgres', 'supabase_admin', 'service_role')
  then
    return new;
  end if;
  if new.balance is distinct from old.balance
    or new.banned is distinct from old.banned
    or new.is_admin is distinct from old.is_admin
    or new.personal_id is distinct from old.personal_id
  then
    raise exception 'Protected profile fields can only be changed by the casino owner';
  end if;
  return new;
end;
$$;

drop trigger if exists guard_profile_columns on public.profiles;
create trigger guard_profile_columns
  before update on public.profiles
  for each row execute function public.guard_profile_columns();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, nickname, email, phone)
  values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data ->> 'nickname', ''), split_part(coalesce(new.email, 'player'), '@', 1)),
    new.email,
    new.raw_user_meta_data ->> 'phone'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------- betting

-- Rounds are resolved here, on the server, so a player cannot award
-- themselves a balance by editing the page.
create or replace function public.place_bet(p_game text, p_amount numeric, p_choice text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user public.profiles%rowtype;
  v_settings public.casino_settings%rowtype;
  v_multiplier numeric(8, 2) := 0;
  v_won boolean := false;
  v_payout numeric(14, 2) := 0;
  v_message text;
  v_roll int;
  v_colour text;
  v_crash numeric(8, 2);
begin
  select * into v_user from public.profiles where id = auth.uid() for update;
  if not found then
    raise exception 'Sign in before placing a bet';
  end if;
  if v_user.banned then
    raise exception 'Your account is banned';
  end if;

  select * into v_settings from public.casino_settings where id;
  if coalesce((v_settings.games ->> p_game)::boolean, false) is not true then
    raise exception 'This game is under maintenance';
  end if;

  p_amount := round(p_amount, 2);
  if p_amount is null or p_amount <= 0 then
    raise exception 'Invalid stake';
  end if;
  if p_amount > v_user.balance then
    raise exception 'Insufficient balance';
  end if;

  case p_game
    when 'mines' then
      v_won := random() < 0.5;
      v_multiplier := 1.9;
      v_message := case when v_won then 'Safe step. You won.' else 'Mine exploded. You lost.' end;
    when 'plinko' then
      v_won := random() < 0.5;
      v_multiplier := 2;
      v_message := case when v_won then 'Plinko dropped into a win pocket.' else 'Plinko dropped into a losing pocket.' end;
    when 'coinflip' then
      v_colour := case when random() < 0.5 then 'heads' else 'tails' end;
      v_won := v_colour = p_choice;
      v_multiplier := 1.95;
      v_message := format('Coin landed %s. %s', v_colour, case when v_won then 'You won.' else 'You lost.' end);
    when 'dice' then
      v_roll := 1 + floor(random() * 6)::int;
      v_won := case when p_choice = 'high' then v_roll >= 4 else v_roll <= 3 end;
      v_multiplier := 1.85;
      v_message := format('Dice rolled %s. %s', v_roll, case when v_won then 'You won.' else 'You lost.' end);
    when 'roulette' then
      v_colour := (array['red', 'black', 'green'])[1 + floor(random() * 3)::int];
      v_won := v_colour = p_choice;
      v_multiplier := case when p_choice = 'green' then 8 else 1.9 end;
      v_message := format('Roulette landed on %s. %s', v_colour, case when v_won then 'You won.' else 'You lost.' end);
    when 'crash' then
      v_crash := round(1 + (1 + floor(random() * 30)::int) / 10.0, 1);
      v_won := v_crash >= coalesce(p_choice::numeric, 0);
      v_multiplier := v_crash;
      v_message := format('Crash multiplier %sx. %s', v_crash, case when v_won then 'You won.' else 'You lost.' end);
    else
      raise exception 'Unknown game %', p_game;
  end case;

  if v_won then
    v_payout := round(p_amount * v_multiplier, 2);
  else
    v_multiplier := 0;
    v_payout := 0;
  end if;

  perform set_config('app.trusted_write', 'on', true);
  update public.profiles
    set balance = balance - p_amount + v_payout
    where id = v_user.id
    returning balance into v_user.balance;

  insert into public.bets (user_id, game, amount, choice, won, multiplier, payout, message)
  values (v_user.id, p_game, p_amount, p_choice, v_won, v_multiplier, v_payout, v_message);

  return jsonb_build_object(
    'won', v_won,
    'multiplier', v_multiplier,
    'payout', v_payout,
    'message', v_message,
    'balance', v_user.balance
  );
end;
$$;

-- ---------------------------------------------------------------- payments

-- A withdrawal holds the funds immediately so the same money cannot be
-- wagered while the owner is paying it out by hand.
create or replace function public.hold_withdraw_funds()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.status := 'pending';
  new.resolved_at := null;
  if new.kind = 'withdraw' then
    perform set_config('app.trusted_write', 'on', true);
    update public.profiles
      set balance = balance - new.amount
      where id = new.user_id and balance >= new.amount;
    if not found then
      raise exception 'Insufficient balance';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists hold_withdraw_funds on public.payment_requests;
create trigger hold_withdraw_funds
  before insert on public.payment_requests
  for each row execute function public.hold_withdraw_funds();

create or replace function public.resolve_payment_request(p_id uuid, p_approve boolean)
returns public.payment_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request public.payment_requests%rowtype;
begin
  if not public.is_admin() then
    raise exception 'Only the casino owner can resolve payment requests';
  end if;

  select * into v_request from public.payment_requests where id = p_id for update;
  if not found then
    raise exception 'Request not found';
  end if;
  if v_request.status <> 'pending' then
    raise exception 'Request is already %', v_request.status;
  end if;

  perform set_config('app.trusted_write', 'on', true);
  if p_approve and v_request.kind = 'deposit' then
    update public.profiles set balance = balance + v_request.amount where id = v_request.user_id;
  elsif not p_approve and v_request.kind = 'withdraw' then
    update public.profiles set balance = balance + v_request.amount where id = v_request.user_id;
  end if;

  update public.payment_requests
    set status = case when p_approve then 'approved' else 'rejected' end,
        resolved_at = now()
    where id = p_id
    returning * into v_request;

  return v_request;
end;
$$;

create or replace function public.admin_adjust_balance(p_user_id uuid, p_amount numeric)
returns numeric
language plpgsql
security definer
set search_path = public
as $$
declare
  v_balance numeric(14, 2);
begin
  if not public.is_admin() then
    raise exception 'Only the casino owner can adjust balances';
  end if;
  perform set_config('app.trusted_write', 'on', true);
  update public.profiles set balance = balance + round(p_amount, 2)
    where id = p_user_id
    returning balance into v_balance;
  if not found then
    raise exception 'Player not found';
  end if;
  return v_balance;
end;
$$;

create or replace function public.admin_set_banned(p_user_id uuid, p_banned boolean)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Only the casino owner can ban players';
  end if;
  perform set_config('app.trusted_write', 'on', true);
  update public.profiles set banned = p_banned where id = p_user_id;
  if not found then
    raise exception 'Player not found';
  end if;
  return p_banned;
end;
$$;

-- ---------------------------------------------------------------- live feed

-- Runs with the owner's rights so the home screen can show other players'
-- wins (nickname, game and payout only) without exposing their balances.
create or replace view public.live_wins as
  select b.id, p.nickname as player, b.game, b.payout as amount, b.created_at
  from public.bets b
  join public.profiles p on p.id = b.user_id
  where b.won
  order by b.created_at desc
  limit 20;

grant select on public.live_wins to anon, authenticated;

-- ---------------------------------------------------------------- policies

alter table public.profiles enable row level security;
alter table public.payment_requests enable row level security;
alter table public.bets enable row level security;
alter table public.casino_settings enable row level security;

drop policy if exists "read own profile" on public.profiles;
create policy "read own profile" on public.profiles
  for select using (id = auth.uid() or public.is_admin());

drop policy if exists "edit own profile" on public.profiles;
create policy "edit own profile" on public.profiles
  for update using (id = auth.uid() or public.is_admin())
  with check (id = auth.uid() or public.is_admin());

drop policy if exists "read own requests" on public.payment_requests;
create policy "read own requests" on public.payment_requests
  for select using (user_id = auth.uid() or public.is_admin());

drop policy if exists "create own requests" on public.payment_requests;
create policy "create own requests" on public.payment_requests
  for insert with check (user_id = auth.uid());

drop policy if exists "read own bets" on public.bets;
create policy "read own bets" on public.bets
  for select using (user_id = auth.uid() or public.is_admin());

drop policy if exists "read settings" on public.casino_settings;
create policy "read settings" on public.casino_settings
  for select using (true);

drop policy if exists "owner edits settings" on public.casino_settings;
create policy "owner edits settings" on public.casino_settings
  for update using (public.is_admin()) with check (public.is_admin());

-- Balances and request statuses move only through the functions above.
revoke insert, update, delete on public.bets from anon, authenticated;
revoke update, delete on public.payment_requests from anon, authenticated;
revoke insert, delete on public.profiles from anon, authenticated;

-- ---------------------------------------------------------------- realtime
-- Lets a player's page update the moment the owner approves their payment.

do $$
begin
  alter publication supabase_realtime add table public.profiles;
exception when duplicate_object then null; end $$;

do $$
begin
  alter publication supabase_realtime add table public.payment_requests;
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------- owner setup
-- Register in the app first, then run this once with your own email:
--   update public.profiles set is_admin = true
--   where email = 'you@example.com';
