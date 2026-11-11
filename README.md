# angle /social

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

### Dialect-native suite

Generic AI tools misread Gulf Arabic. angle social's classifier follows a regional language guide (`src/lib/ai/dialect.ts`) and an editable per-client glossary.

| Area | What it does |
|---|---|
| **Dialect & intent on every post** | Each post is tagged with its dialect (Saudi, Gulf, Egyptian, Levantine, Iraqi, Maghrebi, Standard Arabic, Arabizi, English) and its intent (complaint, question, praise, wants to sign up, **may leave us**, suggestion). Sarcasm detection catches lines like «ما شاء الله عليكم 🙂 … مبدعين», which generic tools count as praise. Slang is pulled out with English glosses. |
| **Translate & explain** | One click shows an English translation plus what a native reader hears (tone, slang, religious or cultural expressions), for colleagues or HQ who don't read Arabic. Cached per post. |
| **Engagement inbox** | Queue of posts that need a reply. Priority: people threatening to leave and risk posts first, then reach, then recency. AI drafts 3 replies in the commenter's own dialect (Saudi white dialect, light Egyptian…) that follow the brand voice and compliance rules (never asks for an OTP in public, never promises returns). It also flags posts that need a specialist. Copy & open post, mark as replied, and track median response time. |
| **Dialect insights page** | Dialect mix, net sentiment per dialect, sarcasm caught, why people post (intent), trending slang with meanings, and the **glossary editor**, where you teach the AI product nicknames and local slang. The glossary is used in every classification, translation, reply and script. |
| **Compliance rules** | Per-organization rules (e.g. CMA marketing rules), applied to every AI reply and script. |
| **Measured quality** | `evals/dialect-set.json` holds 30 hand-labelled regional posts. `npm run eval:dialect` scores dialect, sentiment, intent and sarcasm accuracy against the live model. Add your customers' real posts to it. |

### Content Studio (Trend-to-Post)

| Area | What it does |
|---|---|
| **Niches** | Each niche has hashtags, keywords and creators to watch. It's scanned daily at 05:00 Riyadh time (and on demand) through Monid for top TikTok, Instagram Reels, YouTube Shorts and X video posts. |
| **Virality scoring** | Posts are ranked by how far they outperformed the creator's usual reach (views ÷ followers), blended with engagement rate and velocity, not by raw views. That surfaces *formats* that work, not famous accounts (`src/lib/trends/score.ts`). |
| **Trending formats** | AI groups viral posts into reusable formats such as "salary day vs. end of month" or "3 mistakes countdown". Each format gets a hook pattern, why it works, a beat structure (Arabic & English), example posts, a score and momentum (new / rising / peaking / fading). The team is notified when formats start rising. |
| **Brand voice** | Learned from 5–20 sample posts or from your own account monitor, or written by hand: summary, dialect, traits, always/never rules, banned words, CTA and emoji style, examples. |
| **Drafts** | Pick a format, a brief, a goal, a platform, a dialect and a length, and AI writes: 3 hook options, a beat-by-beat script (spoken lines in dialect, on-screen text, visuals), a shot list for the crew, an edit plan (music, pacing, transitions, captions, SFX), caption, hashtags and CTA. It adds a **compliance check** (pass / needs review / must fix) and a **brand-voice match score**. Everything can be edited inline. You can also refine with one click ("punchier hook", "more Saudi dialect", "shorter") and keep a version history. Workflow: draft → review → approved (admin) → published. |
| **Rough cut** | In-browser editor: drop clips or photos on each shot to preview the timeline in 9:16 with on-screen text and voice-over subtitles. You can export a **.webm video** with the clips' audio. Captions export as **.srt**, the shot list as **.csv**. Files never leave the browser. |

### Built for in-house teams

| Area | What it does |
|---|---|
| **Getting started** | New organizations see a 5-step checklist on the Overview (company context, first monitor, an alert, the team, brand voice). Each step links straight to where it's done. |
| **One place to look first** | The Overview leads with the AI brief, KPIs with trend lines, and "Needs your attention": the most urgent posts (people threatening to leave, risks, influencers) to answer now. |
| **Quick views** | Mentions open with one-click views (Needs a reply · Negative · Risks · Sarcastic · Assigned to me). Detailed filters sit behind *More filters*. Press `/` anywhere to search. |
| **Assignment** | Assign any post to a teammate from the inbox. They get a personal notification, and *Mine* shows their queue. |
| **Slack & Teams** | Any alert can post to a Slack or Microsoft Teams channel through an incoming-webhook link. Only known webhook hosts are accepted; add more with `WEBHOOK_ALLOWED_HOSTS`. |
| **Weekly report email** | Admins pick recipients, a day and a language. Every week management gets the AI headline, summary and recommendations, with a link to the full report. |
| **Feedback** | Every action confirms itself with a toast. Destructive actions use an in-app confirmation dialog. |

### Reliability

- **Timezone-correct:** dates and daily/hourly buckets use the organization's timezone (default `Asia/Riyadh`), computed in Postgres.
- **Worker heartbeat:** admins see a banner if background processing stops, and Settings → Data & AI connections shows worker, email and API status.
- **Sign-in throttling** is stored in the database (8 failures per email or 40 per IP per 15 minutes), so it holds across restarts and multiple instances. Changing your password signs out your other sessions.
- **Friendly error and 404 screens:** an error never shows raw stack traces.
- **Nightly housekeeping** removes old sign-in attempts, expired sessions and old read notifications.

## Design

Calm and editorial rather than template SaaS. The canvas is warm paper; primary actions are near-black ink; a deep palm green marks data and the current page; sand is a quiet highlight. Colour is reserved for meaning (sentiment, risk, intent). Type is IBM Plex Sans Arabic throughout, bundled with the app, with tabular figures for numbers. Platform logos are real; authors get initial avatars. Layouts mirror correctly in Arabic, and charts keep time reading left to right. Tokens live in `src/app/globals.css`.

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
      ├─ trends/            virality scoring, trend scans, demo trends
Worker (src/worker)         pg-boss jobs: scheduler → sync → enrich → alerts; reports;
                            daily trend scans; studio draft writing
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
  Override any mapping without code changes: `MONID_ENDPOINT_<PLATFORM>_<TYPE>="provider#endpoint"`. Trend scans use `MONID_ENDPOINT_<PLATFORM>_TREND`.

- **No `ANTHROPIC_API_KEY`** → posts get keyword-based sentiment and dialect detection only. The assistant, briefs, reports, reply drafting, translation, voice learning, format detection and script writing are turned off. The demo seed includes pre-written formats, a brand voice and a full sample script, so the Studio can still be shown.

### AI cost

Classification runs in batches of 25 posts at low effort. By default every AI feature uses `claude-opus-5-5`. Classification is the high-volume part: set `AI_ENRICH_MODEL=claude-haiku-5-5` to cut its cost sharply, and spot-check quality on your own data first. Requests opt in to server-side refusal fallback on supported models.

## Production checklist

- Set `APP_URL`, `SMTP_URL` and `EMAIL_FROM` so alert emails and weekly reports go out.

- Host Postgres + app in-Kingdom if the client requires PDPL data residency.
- Put the app behind HTTPS (cookies are `secure` in production) and set `APP_URL`.
- Run at least one `worker` process; it's safe to run more than one (pg-boss uses singleton keys).
- Back up Postgres; mentions are the main data growth (~1–2 KB/row).
- Billing is modelled (plan, status, limits, mention quota) but not wired to a payment provider. Connect Moyasar, Tap or Stripe webhooks to `Organization.subscriptionStatus`.

## Scripts

`dev`, `dev:all`, `build`, `start`, `worker`, `typecheck`, `lint`, `test`, `db:migrate`, `db:seed`, `monid:discover`, `eval:dialect`.
