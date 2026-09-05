# DEGENERATE — Bar & Gate

Party bar management and offline gate check-in for DEGENERATE.

## Stack

- Next.js 15 (App Router)
- Prisma + Supabase Postgres
- JWT cookie auth

## Local setup

```bash
npm install
cp .env.example .env
# set DATABASE_URL (Supabase Session pooler) and AUTH_SECRET
npx prisma db push
npx prisma db seed
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Default logins (change after first login)

| Role | Username | Password |
| --- | --- | --- |
| Admin | `admin` | `admin6969` |
| Bar | `bar1`–`bar4` | `bar456` |
| Gate | `gate1` / `gate2` | `gate456` |
| Food | `food1` / `food2` / `food3` | `food456` |

## Deploy (Vercel)

1. Import the GitHub repo
2. Build command: `npm run vercel-build`
3. Env vars:
   - `DATABASE_URL` — Supabase **Transaction** pooler (`…pooler.supabase.com:6543/…?pgbouncer=true&connection_limit=1`)
   - `DIRECT_URL` — Supabase **Session** pooler (`…pooler.supabase.com:5432/…`) for `db push`
   - `AUTH_SECRET` — long random string

Do not use Session mode (5432) as `DATABASE_URL` on Vercel — it exhausts Supabase’s session pool.
