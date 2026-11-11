# Rasd · رصد

A bilingual (Arabic / English) social listening platform built for non-technical teams. It monitors brands, hashtags, accounts and topics across X, Instagram, TikTok, YouTube, Facebook and LinkedIn. Claude classifies every post (sentiment, topics, risk), answers questions about the data in chat, and writes management reports.

## Features

| Area | What it does |
|---|---|
| **Monitors** | 4-step wizard. Types: brand/keyword, hashtag, account (own or competitor), and AI-filtered *topic* ("people complaining about slow trading apps"). You choose the platforms, languages, terms to exclude, how often to refresh, and whether it's a competitor. |
| **Overview** | Mentions, net sentiment, engagement and risk flags, each compared with the previous period. Also: sentiment over time, top topics with sentiment split, share of voice against competitors, platform mix, most influential voices, latest posts, and a one-click AI daily brief. |
| **Mentions** | Unified feed with search and filters (monitor, platform, sentiment, status, topic, risk, period). Team workflow (reviewed / flagged / archived). CSV export that opens correctly in Excel, Arabic included. |
| **Ask AI** | Chat that answers from live data through tools: stats, trends, topics, authors and full-text post search. Replies arrive as they're written, in the user's language, and conversations are saved. |
| **Alerts** | Negative-sentiment spike, volume spike, keyword, influencer (follower threshold) and AI-detected risk (fraud, impersonation, misleading claims, churn). Delivered in-app (bell) and optionally by email. Cooldowns stop repeat alerts. |
| **Reports** | AI-written executive report for any period/monitor, in Arabic or English: headline, summary, sections, recommendations and notable posts. Print / save as PDF. |
| **Settings** | Organization profile, plus a brand description that gives the AI context. Shows plan, usage and limits; Monid and Claude connection status (with Monid balance); team members with roles (Owner / Admin / Analyst / Viewer); and an activity log. |
| **Bilingual** | Full Arabic (RTL) and English UI with per-user language and IBM Plex Sans Arabic bundled in the app. Posts render with automatic text direction. |

## Architecture

```
Next.js 15 (App Router, server components + server actions)
  ├─ src/app/(app)/*        pages
  ├─ src/app/api/assistant  streaming chat endpoint
  ├─ src/app/api/export     CSV export
  └─ src/lib
      ├─ monid/             Monid HTTP client, platform→scraper mapping, normalizer
      ├─ ingest/            sync pipeline + demo data generator
      ├─ ai/                Claude: enrichment, assistant tools, reports
      ├─ analytics.ts       SQL aggregations (Postgres)
      ├─ alerts.ts          rule evaluation + notifications
      └─ auth.ts            DB sessions (httpOnly cookie, hashed tokens), roles, audit log
Worker (src/worker)         pg-boss jobs: scheduler → sync → enrich → alerts; reports
PostgreSQL                  data + job queue (no Redis needed)
```

Every query is scoped by `organizationId` (multi-tenant). The AI assistant's tools add that scope on the server, so the model can never ask for another tenant's data.

## Running locally

Requirements: Node 22+, PostgreSQL 14+.

```bash
cp .env.example .env          # set DATABASE_URL; keys are optional
npm install
npx prisma migrate deploy
npm run db:seed               # demo org + 30 days of sample data
npm run dev:all               # web on :3000 + worker
```

Sign in with `admin@rasd.local` / `rasd-demo-2026` (override with `SEED_EMAIL` / `SEED_PASSWORD`).

Or with Docker: `docker compose up -d --build`.

### Demo mode vs live data

- **No `MONID_API_KEY`** → monitors collect realistic sample posts. The brands (Nakhla Invest, Raya Trade, Dana Capital) are fictional. A "Demo data" badge is shown.
- **With `MONID_API_KEY`** → each monitor runs a Monid scraper per platform (`POST /v1/run`, polled until complete). Default scrapers are in `src/lib/monid/sources.ts`. To check or change them:

  ```bash
  npm run monid:discover                                  # list candidate endpoints per platform
  npm run monid:discover -- "tiktok hashtag" "apify#clockworks/tiktok-scraper"   # + inspect input schema
  ```
  Override any mapping without code changes: `MONID_ENDPOINT_<PLATFORM>_<TYPE>="provider#endpoint"`.

- **No `ANTHROPIC_API_KEY`** → posts get a basic keyword-based sentiment; the assistant, briefs and reports are turned off.

### AI cost

Classification runs in batches of 25 posts at low effort. By default every AI feature uses `claude-opus-5-5`. Classification is the high-volume part: set `AI_ENRICH_MODEL=claude-haiku-5-5` to cut its cost sharply, and spot-check quality on your own data first. Requests opt in to server-side refusal fallback on supported models.

## Production checklist

- Host Postgres + app in-Kingdom if the client requires PDPL data residency.
- Put the app behind HTTPS (cookies are `secure` in production) and set `APP_URL`.
- Run at least one `worker` process; it's safe to run more than one (pg-boss uses singleton keys).
- Back up Postgres; mentions are the main data growth (~1–2 KB/row).
- Billing is modelled (plan, status, limits, mention quota) but not wired to a payment provider. Connect Moyasar, Tap or Stripe webhooks to `Organization.subscriptionStatus`.

## Scripts

`dev`, `dev:all`, `build`, `start`, `worker`, `typecheck`, `lint`, `test`, `db:migrate`, `db:seed`, `monid:discover`.
