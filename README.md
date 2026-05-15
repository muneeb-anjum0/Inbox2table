# Inbox2Table

An automated timetable parser that extracts schedule information from Gmail emails and displays it in a clean, interactive dashboard. Supports Gmail OAuth authentication, automated scheduling, and multi-user management.

## Features

- **Gmail Integration**: OAuth 2.0 authentication for secure Gmail access
- **Intelligent Parsing**: Advanced HTML parsing to extract timetable data with semester filtering
- **Automated Scheduling**: Scheduled scraping with configurable timezones
- **Real-time Updates**: Fresh data fetching with status tracking
- **Multi-user Support**: Manage multiple users with individual settings and tokens
- **Cloud Storage**: Supabase integration for secure data persistence
- **Responsive UI**: Modern React frontend with light/dark theme support
- **Session Management**: Browser-based authentication with secure token storage

## Tech Stack

### Backend
- **Framework**: Flask
- **Authentication**: OAuth 2.0 (Google)
- **Database**: Supabase
- **Scheduling**: APScheduler
- **Email**: Gmail API
- **Data Processing**: Pandas

### Frontend
- **Framework**: React 19
- **Language**: TypeScript
- **Styling**: Tailwind CSS
- **Animation**: Framer Motion
- **Icons**: Lucide React

## Prerequisites

- Python 3.8+
- Node.js 16+
- Gmail API credentials (OAuth 2.0 client ID)
- Supabase project and API keys
- Modern web browser

## Installation

### Backend Setup

1. Navigate to the backend directory:
```bash
cd backend
```

2. Create a virtual environment:
```bash
python -m venv .venv
source .venv/bin/activate  # On Windows: .venv\Scripts\activate
```

3. Install dependencies:
```bash
pip install -r requirements.txt
```

4. Set up environment variables:
```bash
cp .env.example .env
# Edit .env with your Gmail API credentials and Supabase keys
```

5. Place your Gmail credentials:
```bash
# Save your client_secret.json in the credentials/ directory
mkdir -p credentials
cp /path/to/client_secret.json credentials/
```

### Frontend Setup

1. Navigate to the frontend directory:
```bash
cd frontend
```

2. Install dependencies:
```bash
npm install
```

3. Create environment configuration (if needed):
```bash
cp .env.example .env.local
```

## Usage

### Development

#### Start the backend:
```bash
cd backend
python app.py
# Backend runs on http://localhost:5000
```

#### Start the frontend (in a new terminal):
```bash
cd frontend
npm start
# Frontend runs on http://localhost:3000
```

### Production Build

#### Backend:
```bash
cd backend
gunicorn -w 4 -b 0.0.0.0:5000 app:app
```

#### Frontend:
```bash
cd frontend
npm run build
# Output in build/ directory
```

## Configuration

### Backend Environment Variables

- `FLASK_SECRET_KEY`: Flask session secret key
- `PUBLIC_BACKEND_URL`: External backend URL (for OAuth redirects)
- `SUPABASE_URL`: Supabase project URL
- `SUPABASE_KEY`: Supabase API key
- `CLIENT_SECRET_JSON`: Gmail OAuth credentials (JSON string)

### Frontend Configuration

The frontend automatically detects the backend URL. You can override it by setting:
- `REACT_APP_BACKEND_URL`: Custom backend URL

## API Endpoints

### Authentication
- `GET /api/auth/gmail` - Initiate Gmail OAuth flow
- `GET /api/auth/gmail/callback` - OAuth callback handler

### Data
- `GET /api/health` - Health check
- `POST /api/scrape` - Trigger manual scrape
- `GET /api/status` - Get current scraper status
- `POST /api/semesters` - Update semester filters

### Configuration
- `GET /api/config` - Get current configuration
- `POST /api/config` - Update configuration

## File Structure

```
├── backend/
│   ├── app.py              # Flask application
│   ├── requirements.txt     # Python dependencies
│   ├── credentials/        # Gmail OAuth credentials
│   ├── database/          # Supabase client
│   ├── scraper/           # Scraping logic and scheduler
│   ├── utils/             # Helper utilities
│   └── tests/             # Unit tests
├── frontend/
│   ├── src/
│   │   ├── App.tsx        # Main application component
│   │   ├── components/    # React components
│   │   ├── context/       # Auth and state management
│   │   ├── services/      # API service
│   │   └── types/         # TypeScript types
│   ├── package.json       # Node.js dependencies
│   └── public/            # Static assets
└── README.md             # This file
```

## Development

### Running Tests

#### Backend:
```bash
cd backend
python -m pytest tests/
```

#### Frontend:
```bash
cd frontend
npm test
```

### Linting and Formatting

#### Backend:
```bash
cd backend
pylint scraper/ database/ utils/
black scraper/ database/ utils/
```

#### Frontend:
```bash
cd frontend
npm run lint
npm run format
```

## Deployment

### Docker

Build and run with Docker:

```bash
docker build -f backend/Dockerfile -t inbox2table-backend .
docker run -p 5000:5000 -e SUPABASE_URL=... inbox2table-backend
```

### Cloud Platforms

#### Render/Heroku
1. Connect your GitHub repository
2. Set environment variables
3. Deploy backend and frontend separately
4. Update OAuth redirect URIs

#### Vercel (Frontend)
```bash
vercel deploy
```

## Troubleshooting

### OAuth Issues
- Verify `PUBLIC_BACKEND_URL` matches OAuth configuration
- Check that `client_secret.json` is in the correct location
- Ensure redirect URIs are registered in Google Cloud Console

### Email Parsing Issues
- Check that emails contain expected table structures
- Verify semester filters are correctly configured
- Review scraper logs for parsing errors

### Database Connection
- Verify Supabase credentials are correct
- Check network connectivity to Supabase
- Ensure database tables are initialized

## Performance

- Parser uses Pandas for efficient data extraction
- Scheduler runs in background threads
- OAuth tokens are cached with secure expiry handling
- Frontend implements lazy loading and memoization

## Security

- All credentials stored in environment variables
- HTTPS-only cookies in production
- CORS restrictions on backend
- Secure OAuth 2.0 flow with PKCE
- User tokens encrypted in Supabase

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/improvement`)
3. Commit changes (`git commit -am 'Add improvement'`)
4. Push to branch (`git push origin feature/improvement`)
5. Open a Pull Request

## License

This project is open source and available under the MIT License.

## Support

For issues, questions, or suggestions, please open an issue on GitHub or contact the development team.

## Acknowledgments

- Built with Flask, React, and modern web technologies
- Data persistence powered by Supabase
- Gmail integration via Google APIs
- UI components from Lucide React and Tailwind CSS
