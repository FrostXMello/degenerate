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
| Gate | `gate1` | `gate456` |
| Gate+ | `gate2` | `gate456` |

## Deploy (Vercel)

1. Import the GitHub repo
2. Build command: `npm run vercel-build`
3. Env vars:
   - `DATABASE_URL` — Supabase **Session pooler** connection string (`…pooler.supabase.com:5432/…`)
   - `AUTH_SECRET` — long random string

Use the Session pooler URL (port **5432**), not the direct `db.*.supabase.co` host — that host is IPv6-only and fails on many networks / Vercel setups.
