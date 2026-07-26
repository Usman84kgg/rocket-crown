# Rocket Crown

Premium Crypto Casino — Telegram Mini App / Web App.

## Stack

- **Frontend**: Vanilla HTML/CSS/JS (`docs/` folder) — полностью рабочее приложение
- **Database / Auth / Realtime**: Supabase (Postgres, RLS, stored procedures)
- **Server**: Node.js + Express (static file server, `server.js`)

## How to run

```
npm install
node server.js        # или npm start
```

Приложение открывается на порту **5000**. Workflow `Start application` запускает его автоматически.

## Project structure

```
docs/               ← основное приложение (игрок)
  index.html        ← главная страница (Home, Casino, Wallet, Profile)
  script.js         ← логика: авторизация, игры, кошелёк, live wins
  style.css         ← стили (dark theme)
  supabase-client.js← Supabase клиент (URL + anon key)
  admin/            ← админ-панель (управление игроками, платежами)
  games/            ← страница со списком игр
  wallet/           ← страница кошелька (черновик)
  profile/          ← страница профиля (черновик)
  referral/         ← реферальная страница (черновик)

supabase/
  schema.sql        ← полная схема БД: profiles, bets, payment_requests, casino_settings
                       + stored procedures: place_bet, resolve_payment_request, admin_adjust_balance
  schema_test.sql   ← тестовая схема
  local_auth_stub.sql

frontend/           ← старый скелет (не используется активно)
assets/             ← изображения и арты игр
docs/               — основная кодовая база
```

## Supabase setup

Supabase URL и anon key уже вписаны в `docs/supabase-client.js`.  
Чтобы применить схему — запусти `supabase/schema.sql` в Supabase SQL Editor.  
Чтобы назначить себя администратором:
```sql
update public.profiles set is_admin = true where email = 'you@example.com';
```

## Features already built

- ✅ Регистрация / вход (email + password через Supabase Auth)
- ✅ Игры: Mines, Crash, Dice, Roulette, Coinflip, Plinko (результаты считаются на сервере через `place_bet`)
- ✅ Кошелёк: запросы на депозит и вывод
- ✅ Realtime: баланс и статус платежей обновляются мгновенно
- ✅ Live Wins лента
- ✅ Админ-панель: управление игроками, балансами, заявками на выплату, настройками игр

## User preferences

- Общение на русском языке
