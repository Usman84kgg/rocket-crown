-- Run this in Supabase SQL Editor to add Sweet Bonanza 1000x support.
-- Replace the entire place_bet function.

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
  v_reel int;
begin
  select * into v_user from public.profiles where id = auth.uid() for update;
  if not found then raise exception 'Sign in before placing a bet'; end if;
  if v_user.banned then raise exception 'Your account is banned'; end if;

  select * into v_settings from public.casino_settings where id;
  if coalesce((v_settings.games ->> p_game)::boolean, false) is not true then
    raise exception 'This game is under maintenance';
  end if;

  p_amount := round(p_amount, 2);
  if p_amount is null or p_amount <= 0 then raise exception 'Invalid stake'; end if;
  if p_amount > v_user.balance then raise exception 'Insufficient balance'; end if;

  case p_game
    when 'mines' then
      v_won := random() < 0.5;
      v_multiplier := 1.9;
      v_message := case when v_won then 'Safe step — You won! 💎' else 'Mine exploded! 💥 You lost.' end;

    when 'plinko' then
      v_won := random() < 0.5;
      v_multiplier := 2;
      v_message := case when v_won then 'Ball landed in win pocket! 🎉' else 'Ball missed the pocket.' end;

    when 'coinflip' then
      v_colour := case when random() < 0.5 then 'heads' else 'tails' end;
      v_won := v_colour = p_choice;
      v_multiplier := 1.95;
      v_message := format('Coin landed on %s. %s', v_colour, case when v_won then 'You won! 🪙' else 'You lost.' end);

    when 'crash' then
      v_crash := round(1 + (1 + floor(random() * 30)::int) / 10.0, 1);
      v_won := v_crash >= coalesce(p_choice::numeric, 0);
      v_multiplier := v_crash;
      v_message := format('Crashed at %sx. %s', v_crash, case when v_won then 'You won! 🚀' else 'Crashed before your target.' end);

    when 'sweet_bonanza' then
      -- Tumble mechanic: rare big multipliers
      v_reel := floor(random() * 100)::int;
      if v_reel < 5 then
        -- Jackpot: 1000x (0.5% chance after house edge)
        v_won := true;
        v_multiplier := 100 + floor(random() * 900)::int;
        v_message := format('🍭 MEGA WIN! %sx multiplier! INCREDIBLE!', v_multiplier);
      elsif v_reel < 15 then
        -- Big win: 10–50x
        v_won := true;
        v_multiplier := 10 + floor(random() * 40)::int;
        v_message := format('🍬 BIG WIN! %sx multiplier!', v_multiplier);
      elsif v_reel < 45 then
        -- Small win: 1.5–8x
        v_won := true;
        v_multiplier := round(1.5 + (floor(random() * 65)::numeric / 10), 1);
        v_message := format('🍭 Tumble win! %sx — nice spin!', v_multiplier);
      else
        -- No win
        v_won := false;
        v_multiplier := 0;
        v_message := '💔 No match this time. Spin again!';
      end if;

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

-- Enable sweet_bonanza in casino settings
update public.casino_settings
set games = games || '{"sweet_bonanza": true}'::jsonb
where id = true;
