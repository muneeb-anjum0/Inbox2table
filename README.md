# Inbox2Table

Inbox2Table is a full-stack timetable automation app for students. It signs in with a student's Gmail account, finds the latest university timetable email, parses the messy email content into structured class data, and displays it in a responsive dashboard. It can also send the formatted timetable to a personal email every day at 8:00 PM.

## What It Does

- Authenticates students with Google OAuth and reads timetable emails through the Gmail API.
- Parses inconsistent timetable email formats, including HTML tables, flattened rows, slash-separated semester labels, cancelled classes, and malformed course/faculty/room fields.
- Stores each user's tokens, semester filters, settings, and cached timetable in Supabase.
- Shows a polished React dashboard with summary stats, desktop table view, mobile class cards, semester management, theme switching, and backend wake-up status.
- Sends daily timetable emails through a separate official Gmail sender account.
- Uses cron-job.org to wake the Render backend before 8 PM and trigger the daily email automation.

## Automation

The production automation is a cron-triggered backend workflow:

```text
7:55 PM Asia/Karachi
cron-job.org -> GET /api/health
```

This wakes the free Render backend before the real job runs.

```text
8:00 PM Asia/Karachi
cron-job.org -> POST /api/automation/send-daily-timetables
```

The backend immediately returns `202 Accepted`, then runs the daily job in the background:

1. Finds users with Daily Email enabled.
2. Scrapes each user's timetable using their student Gmail token.
3. Formats the parsed timetable as an HTML email.
4. Sends it to the saved personal email via the official Gmail sender.

The dashboard includes a manual **Test** button and an enable/disable toggle for Daily Email.

## Tech Stack

| Layer | Tools |
| --- | --- |
| Frontend | React, TypeScript, Axios, Lucide React |
| Backend | Flask, Flask-CORS, Gunicorn |
| Auth and Email | Google OAuth 2.0, Gmail API |
| Storage | Supabase |
| Parsing | BeautifulSoup, lxml, custom parser heuristics |
| Automation | cron-job.org, protected Flask automation endpoint |
| Testing | Pytest, React build checks |
| Deployment | Render backend, Vercel/static frontend |

## Architecture

```text
Student Gmail
  -> Gmail API
  -> Flask parser API
  -> Supabase users/tokens/settings/cache
  -> React dashboard

cron-job.org
  -> Render backend wake-up
  -> protected daily automation endpoint
  -> official Gmail sender
  -> user's personal inbox
```

## Project Structure

```text
Inbox2table/
  backend/
    app.py                         Flask API, OAuth, config, automation routes
    requirements.txt               Python dependencies
    database/supabase_client.py    Supabase persistence layer
    scraper/                       Gmail client, parser, scheduler helpers
    scripts/trigger_daily_timetables.py
    tests/                         Parser and backend tests
  frontend/
    src/
      App.tsx                      Main dashboard
      context/AuthContext.tsx      Google login/session flow
      services/api.ts              Axios client and Render wake detector
      components/                  Login, status, semester, stats, theme, timetable UI
      utils/                       Semester normalization and course corrections
```

## Environment Variables

Backend:

```env
FLASK_SECRET_KEY=
PUBLIC_BACKEND_URL=https://your-backend.onrender.com
SUPABASE_URL=
SUPABASE_SERVICE_KEY=
CLIENT_SECRET_JSON={"web":{...}}
AUTOMATION_SECRET=
EMAIL_DELIVERY_PROVIDER=official_gmail
OFFICIAL_GMAIL_SENDER_EMAIL=your-sender@gmail.com
OFFICIAL_GMAIL_CLIENT_SECRET_JSON={"web":{...}}
OFFICIAL_GMAIL_REFRESH_TOKEN=
TZ=Asia/Karachi
GMAIL_QUERY_BASE=subject:("Class Schedule" OR schedule) in:inbox
ALLOWED_SEMESTERS=
CHECK_HOUR_LOCAL=20
CHECK_MINUTE_LOCAL=0
NEXT_DAY_AVAILABLE_HOUR=17
NEWER_THAN_DAYS=2
```

Frontend:

```env
REACT_APP_API_URL=https://your-backend.onrender.com
```

## cron-job.org Setup

Create two cron jobs.

Wake job:

```text
Title: Inbox2Table Wake Backend
URL: https://your-backend.onrender.com/api/health
Method: GET
Schedule: Every day at 19:55
Timezone: Asia/Karachi
```

Daily email job:

```text
Title: Inbox2Table Daily Email
URL: https://your-backend.onrender.com/api/automation/send-daily-timetables
Method: POST
Schedule: Every day at 20:00
Timezone: Asia/Karachi
Body: {}
Header: Authorization: Bearer YOUR_AUTOMATION_SECRET
Header: Content-Type: application/json
```

## Local Development

Backend:

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
python app.py
```

Frontend:

```bash
cd frontend
npm install
npm start
```

## Testing

```bash
cd backend
python -m pytest tests
```

```bash
cd frontend
npm run build
```

## Status

Inbox2Table is complete as a deployed full-stack project. It covers OAuth, Gmail API integration, custom parsing, Supabase-backed multi-user state, responsive frontend UX, Render cold-start handling, and scheduled daily email automation.
