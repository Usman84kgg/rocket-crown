# Rocket Crown — Security Audit

Scope: full repository (static Telegram Mini App: `docs/`, `frontend/`, image generation scripts, markdown docs).
There is currently no backend service, no database and no dependency manifest for the app itself, so SQL injection,
CORS and third-party dependency findings are not applicable at this time.

## Findings

| # | Severity | Issue | Location | Status |
|---|----------|-------|----------|--------|
| 1 | Critical | Hardcoded admin password `admin2026` shipped in client bundle | `docs/script.js`, `docs/admin/script.js` | Fixed (removed; admin password is now set on first use and stored as a salted SHA-256 hash) |
| 2 | Critical | Stored XSS: user-controlled values (nickname, name, phone, email, avatar, wallet address, request data) interpolated into `innerHTML` | `docs/script.js` | Fixed (HTML escaping) |
| 3 | High | Passwords stored and compared in cleartext in `localStorage` | `docs/script.js` | Fixed (salted SHA-256, legacy records upgraded on next login) |
| 4 | High | Client-side-only trust boundary: balances, bets, payouts, bans and deposit/withdraw approvals live entirely in `localStorage` | `docs/script.js` | Not fixable client-side — needs a server (see below) |
| 5 | Medium | Unvalidated user input: stakes/deposits/withdrawals accepted `NaN`, withdrawal address unchecked, avatar URL allowed `javascript:` schemes, `personalId` editable via form payload | `docs/script.js` | Fixed |
| 6 | Medium | No Content-Security-Policy; page allowed arbitrary inline script and remote resources | `docs/*.html`, `docs/admin/index.html`, `frontend/index.html` | Fixed (CSP meta tag, inline `onclick` handlers removed) |
| 7 | Low | Registration "verification code" generated and displayed in the browser with `Math.random()`; IDs also from `Math.random()` | `docs/script.js` | Partially fixed (CSPRNG); real delivery/verification requires a server |
| 8 | Info | No hardcoded API keys, bot tokens, private keys or `.env` files found anywhere in the tree or in git history | — | — |
| 9 | Info | No exposed debug endpoints; `developer-sandbox/`, `developer-mode/`, `owner-panel/` etc. contain documentation only | — | — |

## Remaining risk (requires a backend)

Everything the app calls "authentication", "balance", "admin" and "withdrawal" is client state. Any user can open
devtools and edit `localStorage` to grant themselves an arbitrary balance, unban themselves, or mark withdrawals as
approved. Before handling real money the following must move server-side:

- account registration/login with server-issued sessions and Telegram `initData` signature verification;
- password hashing with a slow KDF (Argon2id / bcrypt) — the client-side SHA-256 here only avoids storing cleartext;
- bet placement, RNG and payout settlement (provably-fair seed commitment);
- balance ledger and deposit/withdrawal approval, with admin authorization checks;
- rate limiting and audit logging.

The owner admin panel (`docs/admin/`) has the same limitation: its password only gates the UI in one browser's
`localStorage`, so it must not be treated as an access control boundary until the panel talks to an authenticated API.
