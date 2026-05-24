# Inbox2Table

Inbox2Table turns Gmail timetable emails into a clean, structured class schedule dashboard. It was built for the real-world messiness of university schedule emails: inconsistent HTML tables, wrapped lines, combined semester labels, cancelled classes, room/faculty mix-ups, and multiple users with different semester filters.

The project includes a Flask API, Gmail OAuth, Supabase persistence, a custom timetable parser, and a responsive React/TypeScript frontend.

## Why I Built This

University timetable emails are useful, but hard to consume. They arrive as dense Gmail messages, often with long tables and inconsistent formatting. I wanted a workflow where a student can sign in with Gmail, select the semesters they care about, and see the latest schedule in a dashboard instead of manually scanning emails.

Inbox2Table automates that flow end to end:

1. Authenticate with Gmail.
2. Search for the latest timetable email for the target day.
3. Parse the timetable into structured data.
4. Normalize semesters, courses, faculty, rooms, time, campus, and cancelled classes.
5. Cache the result per user in Supabase.
6. Display it in a responsive dashboard.

## What I Had To Build

- Google OAuth flow for both popup-based desktop login and redirect-based mobile login.
- Gmail API integration to search timetable emails and read HTML/plain-text message bodies.
- A custom parser that handles table-based emails, flattened text rows, line breaks inside cells, slash-separated semester labels, missing meridiems, cancelled classes, and malformed course codes.
- Multi-user backend state using Supabase tables for users, OAuth tokens, user settings, and timetable cache.
- Per-user semester management so each student can filter the same source emails differently.
- A Flask REST API for auth, config, scraping, cache, status, and health checks.
- React/TypeScript frontend with authentication context, API service, status handling, summary cards, mobile cards, desktop tables, light/dark themes, and semester management.
- Production deployment support for a hosted backend on Render and a static frontend on Vercel or similar platforms.
- A Render cold-start loading state so users understand when the backend is waking up after inactivity.
- Unit tests for the parser and backend behavior, especially around edge cases found in actual timetable emails.

## Core Features

- Gmail OAuth sign-in with secure token storage.
- One-click timetable refresh from the dashboard.
- Automatic Gmail query generation for today's or tomorrow's timetable based on local time.
- Semester filters that can be added, removed, saved, and reused per user.
- Normalized schedule display grouped by semester.
- Summary stats for total classes, unique courses, faculty members, and semester breakdown.
- Responsive UI: card-based mobile view and dense desktop table view.
- Light and dark theme support.
- Cached timetable loading so users can still see the latest saved data.
- Backend wake-up status for Render-hosted services.

## Tech Stack

| Area | Tools |
| --- | --- |
| Frontend | React 19, TypeScript, Tailwind CSS, Lucide React, Axios |
| Backend | Flask, Flask-CORS, Gunicorn |
| Auth and APIs | Google OAuth 2.0, Gmail API |
| Storage | Supabase |
| Parsing | BeautifulSoup, regex-based normalization, custom parser heuristics |
| Scheduling | APScheduler, python-dateutil |
| Testing | Pytest, React Testing Library |
| Deployment | Render-ready Flask backend, static React build for Vercel or similar hosts |

## Architecture

```text
Gmail
  -> Gmail API
  -> Flask backend
  -> custom parser and semester normalizer
  -> Supabase users/tokens/settings/cache
  -> React dashboard
```

The backend owns authentication, Gmail access, parsing, user-specific configuration, and cache persistence. The frontend owns the student workflow: sign in, configure semesters, run the parser, view status, and browse the resulting schedule.

## Backend API

| Endpoint | Method | Purpose |
| --- | --- | --- |
| `/api/health` | GET | Health check for deployment and startup checks |
| `/api/auth/gmail` | GET | Starts Gmail OAuth flow |
| `/api/auth/gmail/callback` | GET | Handles Google OAuth callback |
| `/api/auth/login` | POST | Email-based fallback login |
| `/api/config` | GET | Loads user-specific settings |
| `/api/config/semesters` | POST | Saves semester filters |
| `/api/scrape` | POST | Runs the Gmail scraper/parser for the current user |
| `/api/timetable` | GET | Returns the latest cached timetable |
| `/api/status` | GET | Returns cache/status metadata |
| `/api/cache/clear` | POST | Clears the current user's timetable cache |
| `/api/oauth-config` | GET | Debug endpoint for OAuth redirect configuration |

## Project Structure

```text
Inbox2table/
  backend/
    app.py                     Flask API and OAuth routes
    requirements.txt           Python dependencies
    Dockerfile                 Backend container definition
    database/
      supabase_client.py       Supabase user, token, settings, and cache operations
    scraper/
      config.py                Environment-driven scraper settings
      gmail_client.py          Gmail API helpers
      scheduler.py             One-shot and scheduled scraping
      timetable_parser.py      Custom timetable parser and normalization logic
    tests/                     Pytest coverage for parser/backend behavior
  frontend/
    src/
      App.tsx                  Main authenticated dashboard
      context/AuthContext.tsx  Login/session state
      services/api.ts          Axios API client and backend wake detector
      components/              Login, status, semester, stats, theme, and timetable UI
      utils/                   Semester and course correction helpers
      types/                   Shared TypeScript API types
  README.md
```

## Local Setup

### Prerequisites

- Python 3.8+
- Node.js 16+
- A Google Cloud OAuth client with Gmail API enabled
- A Supabase project with backend service key access

### Backend

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
python app.py
```

The backend runs on `http://localhost:5000` by default.

### Frontend

```bash
cd frontend
npm install
npm start
```

The frontend runs on `http://localhost:3000` by default.

## Environment Variables

### Backend

| Variable | Purpose |
| --- | --- |
| `FLASK_SECRET_KEY` | Flask session secret |
| `PUBLIC_BACKEND_URL` | Public backend URL used for OAuth callbacks |
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_SERVICE_KEY` | Supabase service key used by the backend |
| `CLIENT_SECRET_JSON` | Google OAuth client secret JSON for hosted environments |
| `AUTOMATION_SECRET` | Secret token used to protect the daily email automation endpoint |
| `RESEND_API_KEY` | Recommended email API key for Render deployments |
| `EMAIL_FROM` | Verified sender address for API-based email |
| `SMTP_HOST` | SMTP host for non-Render/paid deployments |
| `SMTP_PORT` | SMTP port for non-Render/paid deployments |
| `SMTP_USERNAME` | SMTP sender email address |
| `SMTP_PASSWORD` | SMTP password or app password |
| `SMTP_FROM_NAME` | Sender display name, for example `Inbox2Table` |
| `TZ` | Local timezone, defaults to `Asia/Karachi` |
| `GMAIL_QUERY_BASE` | Base Gmail query for timetable emails |
| `ALLOWED_SEMESTERS` | Default comma-separated semester filters |
| `CHECK_HOUR_LOCAL` | Scheduled scrape hour |
| `CHECK_MINUTE_LOCAL` | Scheduled scrape minute |
| `NEXT_DAY_AVAILABLE_HOUR` | Hour after which tomorrow's timetable is targeted |
| `NEWER_THAN_DAYS` | Gmail search window |

For local development, you can also place Google OAuth credentials at:

```text
backend/credentials/client_secret.json
```

### Frontend

| Variable | Purpose |
| --- | --- |
| `REACT_APP_API_URL` | Optional explicit backend URL. If omitted, the frontend tries local backend candidates. |

## Supabase Data Model

The backend expects these logical tables:

- `users`: stores one row per authenticated email.
- `tokens`: stores Gmail OAuth token payloads per user.
- `user_settings`: stores semester filters and user-level scraper settings.
- `timetable_cache`: stores the latest parsed timetable payloads.

## Testing

Backend tests:

```bash
cd backend
python -m pytest tests
```

Frontend build check:

```bash
cd frontend
npm run build
```

The parser tests cover cases like:

- flattened Gmail rows
- HTML-table rows
- slash-separated semester labels
- BS Psychology/Social Sciences normalization
- cancelled classes
- room/faculty boundary mistakes
- lab and meeting room names
- malformed course code/title combinations

## Deployment Notes

The backend is designed to run on Render or another Python web service using Gunicorn:

```bash
cd backend
gunicorn -w 4 -b 0.0.0.0:$PORT app:app
```

For hosted OAuth, set `PUBLIC_BACKEND_URL` to the deployed backend origin and add this callback URL in Google Cloud Console:

```text
https://your-backend.example.com/api/auth/gmail/callback
```

The frontend can be deployed as a static React build:

```bash
cd frontend
npm run build
```

Set `REACT_APP_API_URL` to the deployed backend URL when the frontend and backend are hosted separately.

## Daily Email Automation

Inbox2Table can send a formatted timetable email every day. The user enters a personal email in the dashboard's Quick Actions area, and the backend stores that recipient in the user's Supabase settings. A scheduled backend job then:

1. Finds every user with daily email enabled.
2. Runs the scraper using that user's Gmail OAuth token and semester filters.
3. Formats the timetable as an HTML email.
4. Sends it to the saved personal email address.

Recommended backend environment variables on Render:

```text
RESEND_API_KEY=your-resend-api-key
EMAIL_FROM=Inbox2Table <your-verified-sender@example.com>
SMTP_FROM_NAME=Inbox2Table
AUTOMATION_SECRET=choose-a-long-random-secret
```

SMTP can be used on hosts that allow outbound SMTP traffic:

```text
SMTP_HOST=smtp-mail.outlook.com
SMTP_PORT=587
SMTP_USERNAME=your-outlook-sender@example.com
SMTP_PASSWORD=your-outlook-password-or-app-password
SMTP_FROM_NAME=Inbox2Table
AUTOMATION_SECRET=choose-a-long-random-secret
```

Render free services block outbound traffic to SMTP ports `25`, `465`, and `587`, so API-based email over HTTPS is the reliable option there.

For Render, create a separate Cron Job from the same repo:

```text
Command: cd backend && python scripts/send_daily_timetables.py
Schedule: 0 15 * * *
```

Render cron schedules use UTC, so `0 15 * * *` runs at 8:00 PM in Pakistan Standard Time (`Asia/Karachi`).

You can also trigger the job through the protected web endpoint:

```bash
curl -X POST https://your-backend.example.com/api/automation/send-daily-timetables \
  -H "Authorization: Bearer YOUR_AUTOMATION_SECRET"
```

## Recruiter Notes

This project is more than a CRUD dashboard. The main engineering challenge was making unreliable email content reliable enough for a usable product. I had to combine API integration, OAuth, backend state management, custom parsing, caching, frontend state, responsive UI, deployment constraints, and real edge-case testing into one workflow.

The parts I am most proud of are:

- the custom parser, because it handles inconsistent real-world timetable emails instead of assuming perfect input;
- the multi-user Supabase design, because each user has their own Gmail tokens, settings, and cache;
- the user experience around slow hosted backends, because the app now explains Render cold starts instead of appearing broken;
- the responsive schedule UI, because it gives a compact table on desktop and readable class cards on mobile.

## Status

Inbox2Table is functional as a deployed full-stack application. The backend can authenticate with Gmail, parse timetable emails, store results in Supabase, and serve them to a React dashboard.
