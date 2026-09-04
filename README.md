# DEGENERATE — Bar & Gate

Party bar management and offline gate check-in for DEGENERATE.

## Stack

- Next.js 15 (App Router)
- Prisma + PostgreSQL (Neon / Vercel Postgres)
- JWT cookie auth

## Local setup

```bash
npm install
cp .env.example .env
# set DATABASE_URL (Postgres) and AUTH_SECRET
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

## Deploy

Connected to Vercel. Build command uses `vercel-build` (migrate/seed + Next build).
Set `DATABASE_URL` and `AUTH_SECRET` in the Vercel project env.
