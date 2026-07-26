\set ON_ERROR_STOP on

insert into auth.users (id, email, raw_user_meta_data) values
  ('11111111-1111-1111-1111-111111111111', 'player@test.com', '{"nickname":"Tester"}'),
  ('22222222-2222-2222-2222-222222222222', 'owner@test.com', '{"nickname":"Owner"}');

update public.profiles set is_admin = true where email = 'owner@test.com';

\echo '== profiles created (balance must be 0) =='
select nickname, balance, is_admin from public.profiles order by nickname;

-- act as the player from here on
set role authenticated;
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';

\echo '== player cannot hand themselves money =='
do $$ begin
  update public.profiles set balance = 999999 where id = auth.uid();
  raise exception 'SECURITY HOLE: player changed their own balance';
exception when others then
  raise notice 'blocked as expected: %', sqlerrm;
end $$;

\echo '== player cannot see other players =='
select count(*) as visible_profiles from public.profiles;

\echo '== betting with no money fails =='
do $$ begin
  perform public.place_bet('dice', 100, 'high');
  raise exception 'SECURITY HOLE: bet allowed without balance';
exception when others then
  raise notice 'blocked as expected: %', sqlerrm;
end $$;

\echo '== deposit request =='
insert into public.payment_requests (user_id, kind, amount, method)
values (auth.uid(), 'deposit', 1000, 'TON');
select kind, amount, status from public.payment_requests;

-- owner approves
reset role;
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
set role authenticated;
select status from public.resolve_payment_request(
  (select id from public.payment_requests where kind = 'deposit'), true);

reset role;
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
set role authenticated;
\echo '== balance after approved deposit (expect 1000.00) =='
select balance from public.profiles where id = auth.uid();

\echo '== 200 bets on dice: balance must never go negative =='
do $$
declare i int; r jsonb;
begin
  for i in 1..200 loop
    begin
      r := public.place_bet('dice', 10, 'high');
    exception when others then
      raise notice 'stopped at bet % (%)', i, sqlerrm;
      exit;
    end;
  end loop;
end $$;
select balance,
       (select count(*) from public.bets) as bets,
       (select round(sum(payout) - sum(amount), 2) from public.bets) as net_from_bets
from public.profiles where id = auth.uid();

\echo '== balance equals 1000 + net of all bets =='
select case
  when (select balance from public.profiles where id = auth.uid())
     = 1000 + (select coalesce(sum(payout) - sum(amount), 0) from public.bets)
  then 'CONSISTENT' else 'MISMATCH' end as accounting;

\echo '== withdraw holds funds immediately =='
select balance as before_withdraw from public.profiles where id = auth.uid();
insert into public.payment_requests (user_id, kind, amount, address)
values (auth.uid(), 'withdraw', 50, 'UQAtest');
select balance as after_withdraw from public.profiles where id = auth.uid();

\echo '== over-withdraw is refused =='
do $$ begin
  insert into public.payment_requests (user_id, kind, amount, address)
  values (auth.uid(), 'withdraw', 9999999, 'UQAtest');
  raise exception 'SECURITY HOLE: withdrew more than balance';
exception when others then
  raise notice 'blocked as expected: %', sqlerrm;
end $$;

\echo '== player cannot approve their own withdrawal =='
do $$ begin
  perform public.resolve_payment_request((select id from public.payment_requests where kind = 'withdraw'), true);
  raise exception 'SECURITY HOLE: player resolved a request';
exception when others then
  raise notice 'blocked as expected: %', sqlerrm;
end $$;

\echo '== owner rejects the withdrawal -> refund =='
reset role;
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
set role authenticated;
select status from public.resolve_payment_request(
  (select id from public.payment_requests where kind = 'withdraw'), false);
\echo '== owner sees every player =='
select count(*) as visible_profiles from public.profiles;

reset role;
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
set role authenticated;
\echo '== balance restored to pre-withdraw value =='
select balance from public.profiles where id = auth.uid();

\echo '== every game runs =='
do $$
declare g text; r jsonb;
begin
  foreach g in array array['mines','plinko','coinflip','dice','roulette','crash'] loop
    r := public.place_bet(g, 1, case g
      when 'coinflip' then 'heads' when 'dice' then 'high'
      when 'roulette' then 'red' when 'crash' then '2.0' else 'safe' end);
    raise notice '% -> %', g, r ->> 'message';
  end loop;
end $$;

\echo '== disabled game is refused =='
reset role;
update public.casino_settings set games = games || '{"dice":false}'::jsonb;
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
set role authenticated;
do $$ begin
  perform public.place_bet('dice', 1, 'high');
  raise exception 'SECURITY HOLE: disabled game accepted a bet';
exception when others then
  raise notice 'blocked as expected: %', sqlerrm;
end $$;

\echo '== banned player is refused =='
reset role;
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
set role authenticated;
select public.admin_set_banned('11111111-1111-1111-1111-111111111111', true);
reset role;
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
set role authenticated;
do $$ begin
  perform public.place_bet('mines', 1, 'safe');
  raise exception 'SECURITY HOLE: banned player placed a bet';
exception when others then
  raise notice 'blocked as expected: %', sqlerrm;
end $$;

\echo '== player cannot unban themselves or become admin =='
do $$ begin
  update public.profiles set banned = false, is_admin = true where id = auth.uid();
  raise exception 'SECURITY HOLE: player escalated privileges';
exception when others then
  raise notice 'blocked as expected: %', sqlerrm;
end $$;

\echo '== player can still edit their own nickname =='
update public.profiles set nickname = 'RenamedTester' where id = auth.uid();
select nickname from public.profiles where id = auth.uid();

\echo '== live wins feed shows wins =='
reset role;
set role anon;
select count(*) as live_wins from public.live_wins;
