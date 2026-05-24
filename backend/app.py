"""
Flask backend for TimeTable Scraper with Multi-User Support
Provides RESTful API endpoints for the React frontend
"""
import os
import sys
import json
import logging
import socket
import re
from datetime import datetime
from flask import Flask, jsonify, request, session, redirect
from flask_cors import CORS

# Backend imports are now local since all backend code is in this directory

app = Flask(__name__)
# Simple dev secret key so Flask session can store PKCE state/code_verifier
app.secret_key = os.environ.get('FLASK_SECRET_KEY', 'dev-secret-change-me')
# Cross-site session cookies are required because the frontend talks to ngrok over XHR.
app.config.update(
    SESSION_COOKIE_SAMESITE='None',
    SESSION_COOKIE_SECURE=True,
)

# CORS configuration for local dev + ngrok
allowed_origin_patterns = [
    r"^http://localhost:\d+$",
    r"^http://127\.0\.0\.1:\d+$",
    r"^http://192\.168\.\d+\.\d+:\d+$",
    r"^https://.*\.ngrok-free\.dev$",
    r"^https://.*\.ngrok-free\.app$",
    r"^https://.*\.ngrok\.io$",
    r"^https://.*\.vercel\.app$",
    r"^https://.*\.vercel\.com$",
]

CORS(
    app,
    resources={r"/api/.*": {"origins": allowed_origin_patterns}},
    supports_credentials=True,
    allow_headers=['Content-Type', 'Authorization', 'X-User-Email'],
    methods=['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS']
)

# Enhanced logging setup
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.StreamHandler()
    ]
)
logger = logging.getLogger(__name__)

# Reduce noise from external libraries during startup
logging.getLogger('scraper.config').setLevel(logging.WARNING)
logging.getLogger('database.supabase_client').setLevel(logging.WARNING)

# If a `CLIENT_SECRET_JSON` env var is provided (Render/host secret), write it to the
# `credentials/client_secret.json` file so the OAuth flow can read it at runtime.
def _ensure_client_secrets_from_env():
    client_secrets_env = os.environ.get('CLIENT_SECRET_JSON')
    client_secrets_file = os.path.join(os.path.dirname(__file__), 'credentials', 'client_secret.json')
    if client_secrets_env and not os.path.exists(client_secrets_file):
        try:
            os.makedirs(os.path.dirname(client_secrets_file), exist_ok=True)
            # Write raw JSON string into the credentials file
            with open(client_secrets_file, 'w', encoding='utf-8') as f:
                f.write(client_secrets_env)
            logger.info('Wrote client_secret.json from CLIENT_SECRET_JSON env var')
        except Exception as e:
            logger.error(f'Failed to write client_secret.json from env: {e}')


_ensure_client_secrets_from_env()

# Import after CORS setup
from scraper.scheduler import run_once
from scraper.config import settings
from database.supabase_client import supabase_manager


OAUTH_STATE_TTL_SECONDS = 600
oauth_state_store = {}


def _cleanup_oauth_state_store():
    now_ts = datetime.now().timestamp()
    expired_states = [
        state_key
        for state_key, state_data in oauth_state_store.items()
        if now_ts - state_data.get('created_at', 0) > OAUTH_STATE_TTL_SECONDS
    ]
    for state_key in expired_states:
        oauth_state_store.pop(state_key, None)


def _store_oauth_state(state, code_verifier, frontend_origin):
    _cleanup_oauth_state_store()
    oauth_state_store[state] = {
        'code_verifier': code_verifier,
        'frontend_origin': frontend_origin,
        'created_at': datetime.now().timestamp(),
    }


def _pop_oauth_state(state):
    _cleanup_oauth_state_store()
    if not state:
        return None
    return oauth_state_store.pop(state, None)


def get_public_origin():
    """Return the externally reachable origin for this backend."""
    env_origin = os.environ.get('PUBLIC_BACKEND_URL')
    if env_origin:
        return env_origin.rstrip('/')

    forwarded_host = request.headers.get('X-Forwarded-Host') or request.headers.get('X-Original-Host')
    forwarded_proto = request.headers.get('X-Forwarded-Proto') or 'http'

    if forwarded_host:
        return f"{forwarded_proto}://{forwarded_host}".rstrip('/')

    return request.host_url.rstrip('/')


def get_redirect_uri():
    return get_public_origin() + '/api/auth/gmail/callback'

def get_public_request_url():
    """Return the externally visible URL for the current request."""
    public_origin = get_public_origin()
    full_path = request.full_path

    if full_path.endswith('?'):
        full_path = full_path[:-1]

    return public_origin + request.path + (f'?{request.query_string.decode("utf-8")}' if request.query_string else '')

def get_local_ip():
    """Get the local IP address dynamically"""
    try:
        # Connect to a dummy address to get the local IP
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as s:
            s.connect(("8.8.8.8", 80))
            return s.getsockname()[0]
    except Exception:
        return "127.0.0.1"

# Dynamic network configuration
LOCAL_IP = get_local_ip()
FRONTEND_PORT = int(os.environ.get('FRONTEND_PORT', 3000))
BACKEND_PORT = int(os.environ.get('PORT', 5000))

def get_user_from_request():
    """Extract user email from request headers or JSON"""
    user_email = request.headers.get('X-User-Email')
    
    if not user_email and request.is_json:
        user_email = request.json.get('user_email')
    
    if not user_email:
        logger.warning("No user email found in request")
        return None, jsonify({'error': 'User email required'}), 400
        
    try:
        user = supabase_manager.get_or_create_user(user_email)
        return user, None, None
    except Exception as e:
        logger.error(f"Error getting user: {e}")
        return None, jsonify({'error': 'User management error'}), 500

@app.route('/api/health', methods=['GET'])
def health_check():
    """Health check endpoint"""
    try:
        return jsonify({
            'status': 'healthy',
            'timestamp': datetime.now().isoformat(),
            'config_loaded': True,
            'supabase_connected': True
        })
    except Exception as e:
        return jsonify({
            'status': 'unhealthy',
            'error': str(e),
            'timestamp': datetime.now().isoformat()
        }), 500

@app.route('/api/oauth-config', methods=['GET'])
def oauth_config_info():
    """Diagnostic endpoint to show OAuth configuration"""
    try:
        # Show what redirect URI would be generated
        origin = request.headers.get('Origin', '')
        host = request.headers.get('Host', f'localhost:{BACKEND_PORT}')
        redirect_uri = get_redirect_uri()
        
        # Load and show current OAuth config
        import os
        client_secrets_file = os.path.join(os.path.dirname(__file__), 'credentials', 'client_secret.json')
        
        oauth_info = {
            'current_redirect_uri': redirect_uri,
            'request_origin': origin,
            'request_host': host,
            'public_origin': get_public_origin(),
            'client_secrets_exists': os.path.exists(client_secrets_file)
        }
        
        if os.path.exists(client_secrets_file):
            with open(client_secrets_file, 'r') as f:
                import json
                client_config = json.load(f)
                # Support both 'installed' (desktop) and 'web' (web app) formats
                client_section = client_config.get('installed') or client_config.get('web') or {}
                oauth_info['configured_redirect_uris'] = client_section.get('redirect_uris', [])
                oauth_info['client_id'] = client_section.get('client_id', 'Not found')
                oauth_info['client_secrets_type'] = 'installed' if 'installed' in client_config else ('web' if 'web' in client_config else 'unknown')
        
        return jsonify(oauth_info)
        
    except Exception as e:
        return jsonify({
            'error': str(e),
            'timestamp': datetime.now().isoformat()
        }), 500

@app.route('/api/auth/gmail', methods=['GET'])
def gmail_auth():
    """Initiate Gmail OAuth flow"""
    try:
        from scraper.gmail_client import get_credentials
        import os
        from google.auth.transport.requests import Request
        from google_auth_oauthlib.flow import Flow
        
        # Allow insecure transport for local development
        os.environ['OAUTHLIB_INSECURE_TRANSPORT'] = '1'
        
        # Load client secrets
        client_secrets_file = os.path.join(os.path.dirname(__file__), 'credentials', 'client_secret.json')
        
        if not os.path.exists(client_secrets_file):
            return jsonify({'error': 'Client secrets file not found'}), 500
            
        # Create flow instance to manage the OAuth 2.0 Authorization Grant Flow steps
        flow = Flow.from_client_secrets_file(
            client_secrets_file,
            scopes=['https://www.googleapis.com/auth/gmail.readonly',
                   'https://www.googleapis.com/auth/userinfo.email',
                   'https://www.googleapis.com/auth/userinfo.profile',
                   'openid']
        )
        
        # Save the frontend origin so the callback can redirect back correctly.
        frontend_origin = request.args.get('frontend_origin') or request.headers.get('Origin') or request.headers.get('Referer', '').rstrip('/')
        if frontend_origin:
            try:
                session['frontend_origin'] = frontend_origin
            except Exception as sess_err:
                logger.warning(f"Could not store frontend origin in session: {sess_err}")

        # Build redirect URI from the externally reachable backend origin.
        redirect_uri = get_redirect_uri()

        flow.redirect_uri = redirect_uri
        
        authorization_url, state = flow.authorization_url(
            access_type='offline',
            include_granted_scopes='true',
            prompt='consent'
        )
        try:
            session['auth_state'] = state
            code_verifier = None
            if hasattr(flow, 'code_verifier') and flow.code_verifier:
                code_verifier = flow.code_verifier
                session['code_verifier'] = code_verifier

            _store_oauth_state(state, code_verifier, frontend_origin)
        except Exception as sess_err:
            logger.warning(f'Could not store session data for PKCE: {sess_err}')

        # For browser-driven mobile flows, redirect directly to Google so the user sees the consent page.
        if request.args.get('redirect') == '1':
            logger.info('Returning HTTP redirect to Google OAuth URL')
            return redirect(authorization_url)

        # Return url/state to frontend
        return jsonify({
            'auth_url': authorization_url,
            'state': state
        })
        
    except Exception as e:
        logger.error(f"Gmail auth error: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/auth/gmail/callback', methods=['GET'])
def gmail_callback():
    """Handle Gmail OAuth callback"""
    try:
        from google_auth_oauthlib.flow import Flow
        import os
        
        # Allow insecure transport for local development
        os.environ['OAUTHLIB_INSECURE_TRANSPORT'] = '1'
        
        # Load client secrets
        client_secrets_file = os.path.join(os.path.dirname(__file__), 'credentials', 'client_secret.json')
        
        # Create flow instance
        flow = Flow.from_client_secrets_file(
            client_secrets_file,
            scopes=['https://www.googleapis.com/auth/gmail.readonly',
                   'https://www.googleapis.com/auth/userinfo.email',
                   'https://www.googleapis.com/auth/userinfo.profile',
                   'openid']
        )
        # Build redirect URI from the externally reachable backend origin.
        redirect_uri = get_redirect_uri()

        flow.redirect_uri = redirect_uri
        
        authorization_response = get_public_request_url()

        callback_state = request.args.get('state')
        state_data = _pop_oauth_state(callback_state)

        frontend_origin_from_state = state_data.get('frontend_origin') if state_data else None
        
        try:
            code_verifier = state_data.get('code_verifier') if state_data else None
            if not code_verifier:
                code_verifier = session.get('code_verifier')
            if code_verifier and hasattr(flow, 'code_verifier'):
                flow.code_verifier = code_verifier
        except Exception as sess_err:
            logger.warning(f'Could not read PKCE code_verifier from session: {sess_err}')

        try:
            flow.fetch_token(authorization_response=authorization_response)
        except Exception as token_error:
            if "scope" in str(token_error).lower():
                import urllib.parse as urlparse
                parsed_url = urlparse.urlparse(authorization_response)
                query_params = urlparse.parse_qs(parsed_url.query)
                
                if 'scope' in query_params:
                    actual_scopes = query_params['scope'][0].split(' ')
                    
                    flow = Flow.from_client_secrets_file(
                        client_secrets_file,
                        scopes=actual_scopes
                    )
                    
                    redirect_uri = request.host_url.rstrip('/') + '/api/auth/gmail/callback'
                    flow.redirect_uri = redirect_uri
                
                flow.fetch_token(authorization_response=authorization_response)
            else:
                raise token_error
        
        # Get credentials
        credentials = flow.credentials
        
        # Get user info - try multiple approaches for getting user email
        from google.oauth2.credentials import Credentials
        from googleapiclient.discovery import build
        
        user_email = None
        
        try:
            gmail_service = build('gmail', 'v1', credentials=credentials)
            profile = gmail_service.users().getProfile(userId='me').execute()
            user_email = profile['emailAddress']
        except Exception:
            try:
                userinfo_service = build('oauth2', 'v2', credentials=credentials)
                userinfo = userinfo_service.userinfo().get().execute()
                user_email = userinfo.get('email')
            except Exception as userinfo_error:
                logger.error(f"Could not retrieve user email: {userinfo_error}")
                raise Exception("Could not retrieve user email from any API")
        
        if not user_email:
            raise Exception("No user email found in OAuth response")
        
        logger.info(f"OAuth successful for user: {user_email}")
        
        # Create or get user in Supabase
        user = supabase_manager.get_or_create_user(user_email)
        
        # Save Gmail tokens to Supabase
        token_data = {
            'token': credentials.token,
            'refresh_token': credentials.refresh_token,
            'token_uri': credentials.token_uri,
            'client_id': credentials.client_id,
            'client_secret': credentials.client_secret,
            'scopes': credentials.scopes,
            'expiry': credentials.expiry.isoformat() if credentials.expiry else None
        }
        
        supabase_manager.save_user_tokens(user['id'], token_data)
        
        # Get frontend URL from the session (set when auth started)
        frontend_url = frontend_origin_from_state or session.get('frontend_origin') or f'http://{LOCAL_IP}:{FRONTEND_PORT}'

        # Fallbacks if the session is missing
        referer = request.headers.get('Referer', '')
        user_agent = request.headers.get('User-Agent', '')

        if not (frontend_origin_from_state or session.get('frontend_origin')):
            if LOCAL_IP in referer:
                frontend_url = f'http://{LOCAL_IP}:{FRONTEND_PORT}'
            elif 'localhost:3000' in referer or '127.0.0.1:3000' in referer:
                frontend_url = f'http://localhost:{FRONTEND_PORT}'
        
        # Check if this is a mobile browser (Safari, iOS, etc.)
        is_mobile = any(mobile_agent in user_agent.lower() for mobile_agent in 
                       ['mobile', 'android', 'iphone', 'ipad', 'ipod', 'blackberry', 'opera mini'])
        
        if is_mobile:
            # For mobile browsers, redirect directly to frontend with auth data in URL
            import urllib.parse
            auth_data = urllib.parse.urlencode({
                'auth': 'success',
                'user_id': user['id'],
                'email': user_email
            })
            redirect_url = f"{frontend_url}?{auth_data}"
            
            return f"""
            <html>
            <head>
                <meta http-equiv="refresh" content="0; url={redirect_url}">
            </head>
            <body>
                <script>
                    window.location.href = '{redirect_url}';
                </script>
                <p>Authentication successful! Redirecting...</p>
            </body>
            </html>
            """
        else:
            # Desktop popup flow - use postMessage
            frontend_origin = frontend_origin_from_state or session.get('frontend_origin') or f'http://localhost:{FRONTEND_PORT}'
            return f"""
            <html>
            <body>
            <script>
            // Try to communicate with parent window using multiple target origins
            const targetOrigins = [
                '{frontend_origin}',
                'http://localhost:3000',
                'http://127.0.0.1:3000', 
                'http://{LOCAL_IP}:{FRONTEND_PORT}'
            ];
            
            const message = {{
                type: 'GMAIL_AUTH_SUCCESS',
                user: {{
                    id: '{user['id']}',
                    email: '{user_email}'
                }}
            }};
            
            targetOrigins.forEach(origin => {{
                try {{
                    window.opener.postMessage(message, origin);
                }} catch (e) {{
                    console.log('Failed to post to:', origin, e);
                }}
            }});
            
            setTimeout(() => window.close(), 1000);
            </script>
            <p>Authentication successful! This window will close automatically.</p>
            </body>
            </html>
            """
        
    except Exception as e:
        logger.error(f"Gmail callback error: {e}")
        
        # Get frontend URL for redirect
        frontend_url = f'http://localhost:{FRONTEND_PORT}'  # default
        
        # Get frontend URL from the session (set when auth started)
        callback_state = request.args.get('state')
        state_data = _pop_oauth_state(callback_state)
        frontend_origin_from_state = state_data.get('frontend_origin') if state_data else None

        frontend_url = frontend_origin_from_state or session.get('frontend_origin') or f'http://{LOCAL_IP}:{FRONTEND_PORT}'

        # Fallbacks if the session is missing
        referer = request.headers.get('Referer', '')
        user_agent = request.headers.get('User-Agent', '')

        if not (frontend_origin_from_state or session.get('frontend_origin')):
            if LOCAL_IP in referer:
                frontend_url = f'http://{LOCAL_IP}:{FRONTEND_PORT}'
            elif 'localhost:3000' in referer or '127.0.0.1:3000' in referer:
                frontend_url = f'http://localhost:{FRONTEND_PORT}'
        
        # Check if this is a mobile browser
        is_mobile = any(mobile_agent in user_agent.lower() for mobile_agent in 
                       ['mobile', 'android', 'iphone', 'ipad', 'ipod', 'blackberry', 'opera mini'])
        
        if is_mobile:
            # For mobile browsers, redirect to frontend with error
            import urllib.parse
            error_data = urllib.parse.urlencode({
                'auth': 'error',
                'error': str(e)
            })
            redirect_url = f"{frontend_url}?{error_data}"
            
            return f"""
            <html>
            <head>
                <meta http-equiv="refresh" content="0; url={redirect_url}">
            </head>
            <body>
                <script>
                    window.location.href = '{redirect_url}';
                </script>
                <p>Authentication failed. Redirecting...</p>
            </body>
            </html>
            """
        else:
            # Desktop popup flow
            frontend_origin = frontend_origin_from_state or session.get('frontend_origin') or f'http://localhost:{FRONTEND_PORT}'
            return f"""
            <html>
            <body>
        <script>
        // Try to communicate with parent window using multiple target origins
        const targetOrigins = [
            '{frontend_origin}',
            'http://localhost:3000',
            'http://127.0.0.1:3000', 
            'http://{LOCAL_IP}:{FRONTEND_PORT}'
        ];
        
        const message = {{
            type: 'GMAIL_AUTH_ERROR',
            error: '{str(e)}'
        }};
        
        targetOrigins.forEach(origin => {{
            try {{
                window.opener.postMessage(message, origin);
            }} catch (e) {{
                console.log('Failed to post to:', origin, e);
            }}
        }});
        
        setTimeout(() => window.close(), 2000);
        </script>
        <p>Authentication failed: {str(e)}</p>
        <p>This window will close automatically.</p>
        </body>
        </html>
        """

@app.route('/api/auth/login', methods=['POST'])
def login():
    """Simple email-based login"""
    try:
        data = request.get_json()
        email = data.get('email')
        
        if not email:
            return jsonify({'error': 'Email required'}), 400
            
        user = supabase_manager.get_or_create_user(email)
        
        return jsonify({
            'success': True,
            'user': {
                'id': user['id'],
                'email': user['email']
            },
            'message': 'Login successful'
        })
        
    except Exception as e:
        logger.error(f"Login error: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/config', methods=['GET'])
def get_config():
    """Get current configuration for a user"""
    try:
        user, error_response, status_code = get_user_from_request()
        if error_response:
            return error_response, status_code
            
        user_settings = supabase_manager.get_user_settings(user['id'])
        
        # Return user-specific configuration
        safe_config = {
            'gmail_query': user_settings.get('gmail_query_base', settings.gmail_query_base),
            'semester_filter': user_settings.get('allowed_semesters', settings.allowed_semesters),
            'personal_email': user_settings.get('personal_email', ''),
            'daily_email_enabled': user_settings.get('daily_email_enabled', bool(user_settings.get('personal_email'))),
            'schedule_time': f"{settings.check_hour_local:02d}:{settings.check_minute_local:02d}",
            'timezone': user_settings.get('timezone', settings.tz),
            'max_results': getattr(settings, 'max_results_per_semester', 50)
        }
        return jsonify(safe_config)
    except Exception as e:
        logger.error(f"Error loading config: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/config/personal-email', methods=['POST', 'OPTIONS'])
def update_personal_email():
    """Update the personal recipient email used for daily timetable delivery."""
    if request.method == 'OPTIONS':
        return '', 200

    try:
        user, error_response, status_code = get_user_from_request()
        if error_response:
            return error_response, status_code

        data = request.get_json() or {}
        personal_email = (data.get('personal_email') or '').strip()

        if personal_email and not re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", personal_email):
            return jsonify({
                'success': False,
                'error': 'Please enter a valid email address'
            }), 400

        current_settings = supabase_manager.get_user_settings(user['id'])
        current_settings['personal_email'] = personal_email
        current_settings['daily_email_enabled'] = bool(personal_email)

        success = supabase_manager.save_user_settings(user['id'], current_settings)

        if not success:
            return jsonify({
                'success': False,
                'error': 'Failed to save personal email'
            }), 500

        return jsonify({
            'success': True,
            'message': 'Daily email recipient saved' if personal_email else 'Daily email disabled',
            'personal_email': personal_email,
            'daily_email_enabled': bool(personal_email),
            'timestamp': datetime.now().isoformat()
        })

    except Exception as e:
        logger.error(f"Error updating personal email: {e}", exc_info=True)
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/api/config/semesters', methods=['POST', 'OPTIONS'])
def update_semesters():
    """Update allowed semesters configuration for a user"""
    # Handle preflight request
    if request.method == 'OPTIONS':
        return '', 200
        
    try:
        logger.info('📨 [UPDATE_SEMESTERS] Received request')
        logger.info(f'📨 [UPDATE_SEMESTERS] Headers: {dict(request.headers)}')
        
        user, error_response, status_code = get_user_from_request()
        if error_response:
            logger.error('❌ [UPDATE_SEMESTERS] Failed to get user')
            return error_response, status_code
        
        logger.info(f'✅ [UPDATE_SEMESTERS] User: {user["email"]}')
            
        data = request.get_json()
        logger.info(f'📨 [UPDATE_SEMESTERS] Received JSON data: {data}')
        
        if not data or 'semesters' not in data:
            logger.error('❌ [UPDATE_SEMESTERS] Missing semesters data')
            return jsonify({'error': 'Missing semesters data'}), 400
        
        new_semesters = data['semesters']
        logger.info(f'📨 [UPDATE_SEMESTERS] New semesters: {new_semesters}')
        
        if not isinstance(new_semesters, list):
            logger.error('❌ [UPDATE_SEMESTERS] Semesters is not a list')
            return jsonify({'error': 'Semesters must be a list'}), 400

        # Get current user settings
        logger.info(f'📨 [UPDATE_SEMESTERS] Getting current settings for user {user["id"]}')
        current_settings = supabase_manager.get_user_settings(user['id'])
        logger.info(f'📨 [UPDATE_SEMESTERS] Current settings: {current_settings}')
        
        current_settings['allowed_semesters'] = new_semesters
        logger.info(f'📨 [UPDATE_SEMESTERS] Updated settings: {current_settings}')
        
        # Save updated settings to Supabase
        logger.info(f'📨 [UPDATE_SEMESTERS] Saving to Supabase...')
        success = supabase_manager.save_user_settings(user['id'], current_settings)
        logger.info(f'📨 [UPDATE_SEMESTERS] Save result: {success}')
        
        if success:
            logger.info(f"✅ [UPDATE_SEMESTERS] Updated allowed semesters for user {user['email']}: {new_semesters}")
            response = {
                'success': True,
                'message': f'Updated {len(new_semesters)} allowed semesters',
                'semesters': new_semesters
            }
            logger.info(f'📤 [UPDATE_SEMESTERS] Returning response: {response}')
            return jsonify(response)
        else:
            logger.error('❌ [UPDATE_SEMESTERS] Failed to save settings to Supabase')
            return jsonify({'error': 'Failed to save settings'}), 500
            
    except Exception as e:
        logger.error(f"❌ [UPDATE_SEMESTERS] Error: {e}", exc_info=True)
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/api/scrape', methods=['POST'])
def scrape_now():
    """Run the scraper once and return results for the authenticated user"""
    try:
        user, error_response, status_code = get_user_from_request()
        if error_response:
            return error_response, status_code
            
        logger.info(f"Starting manual scrape via API for user {user['email']}")
        
        # Check if force_refresh parameter is provided
        force_refresh = request.json.get('force_refresh', False) if request.is_json else False
        
        if force_refresh:
            logger.info(f"Force refresh requested - clearing cache for user {user['id']}")
            supabase_manager.clear_user_cache(user['id'])
        
        # Get user settings for the scrape
        user_settings = supabase_manager.get_user_settings(user['id'])
        
        # Run the scraper with user-specific settings
        result = run_once(
            user_email=user['email'], 
            show_table=False, 
            user_id=user['id'], 
            user_settings=user_settings
        )
        
        if result and result.get('success'):
            return jsonify({
                'success': True,
                'message': 'Scrape completed successfully',
                'data': result.get('data', []),
                'timestamp': datetime.now().isoformat()
            })
        else:
            return jsonify({
                'success': False,
                'message': 'Scrape failed or no data found',
                'error': result.get('error') if result else 'Unknown error',
                'timestamp': datetime.now().isoformat()
            }), 400
            
    except Exception as e:
        logger.error(f"Error during scrape: {e}")
        return jsonify({
            'success': False,
            'error': str(e),
            'timestamp': datetime.now().isoformat()
        }), 500

@app.route('/api/cache/clear', methods=['POST'])
def clear_cache():
    """Clear cached data for the authenticated user"""
    try:
        user, error_response, status_code = get_user_from_request()
        if error_response:
            return error_response, status_code
            
        logger.info(f"Clearing cache for user {user['email']}")
        
        success = supabase_manager.clear_user_cache(user['id'])
        
        if success:
            return jsonify({
                'success': True,
                'message': 'Cache cleared successfully',
                'timestamp': datetime.now().isoformat()
            })
        else:
            return jsonify({
                'success': False,
                'message': 'Failed to clear cache'
            }), 500
            
    except Exception as e:
        logger.error(f"Error in clear_cache: {e}")
        return jsonify({'success': False, 'message': 'Internal server error'}), 500

@app.route('/api/automation/send-daily-timetables', methods=['POST'])
def send_daily_timetables_automation():
    """Protected endpoint for external schedulers to trigger daily timetable emails."""
    try:
        expected_token = os.environ.get('AUTOMATION_SECRET', '')
        provided_token = request.headers.get('X-Automation-Token', '')
        auth_header = request.headers.get('Authorization', '')

        if auth_header.startswith('Bearer '):
            provided_token = auth_header.replace('Bearer ', '', 1).strip()

        if not expected_token or provided_token != expected_token:
            return jsonify({'success': False, 'error': 'Unauthorized'}), 401

        from utils.daily_email import send_daily_timetable_emails

        result = send_daily_timetable_emails()
        return jsonify({
            **result,
            'timestamp': datetime.now().isoformat()
        }), 200 if result.get('success') else 207

    except Exception as e:
        logger.error(f"Daily timetable automation failed: {e}", exc_info=True)
        return jsonify({
            'success': False,
            'error': str(e),
            'timestamp': datetime.now().isoformat()
        }), 500

@app.route('/api/automation/send-test-timetable-email', methods=['POST', 'OPTIONS'])
def send_test_timetable_email():
    """Run and send the daily timetable email for the authenticated user only."""
    if request.method == 'OPTIONS':
        return '', 200

    try:
        user, error_response, status_code = get_user_from_request()
        if error_response:
            return error_response, status_code

        user_settings = supabase_manager.get_user_settings(user['id'])

        if not (user_settings.get('personal_email') or '').strip():
            return jsonify({
                'success': False,
                'error': 'Save a personal email before sending a test.'
            }), 400

        from utils.daily_email import send_daily_timetable_email_for_user

        result = send_daily_timetable_email_for_user(user, user_settings)
        return jsonify({
            **result,
            'timestamp': datetime.now().isoformat()
        }), 200 if result.get('success') else 400

    except Exception as e:
        logger.error(f"Test timetable email failed: {e}", exc_info=True)
        return jsonify({
            'success': False,
            'error': str(e),
            'timestamp': datetime.now().isoformat()
        }), 500

@app.route('/api/timetable', methods=['GET'])
def get_latest_timetable():
    """Get the latest saved timetable data for a user"""
    try:
        logger.info(f"Timetable request received - Headers: {dict(request.headers)}")
        user, error_response, status_code = get_user_from_request()
        if error_response:
            logger.warning(f"User validation failed: {error_response}")
            return error_response, status_code
            
        logger.info(f"Getting timetable for user: {user['email']}")
        # Get latest timetable cache from Supabase
        cache_data = supabase_manager.get_latest_timetable_cache(user['id'])
        latest_ts = supabase_manager.get_latest_timetable_timestamp(user['id'])

        if not cache_data:
            logger.info("No cached timetable data found")
            return jsonify({
                'success': False,
                'message': 'No cached schedule data found. Run a scrape first.',
                'timestamp': datetime.now().isoformat()
            }), 404

        # Use cache created_at (when available) so frontend shows true scrape/cache time.
        response_ts = latest_ts or datetime.now().isoformat()

        logger.info("Returning cached timetable data with timestamp: %s", response_ts)
        return jsonify({
            'success': True,
            'data': cache_data,
            'timestamp': response_ts,
            'cached': True,
        })
            
    except Exception as e:
        logger.error(f"Error reading cached data: {e}")
        return jsonify({
            'success': False,
            'error': str(e),
            'timestamp': datetime.now().isoformat()
        }), 500

@app.route('/api/status', methods=['GET'])
def get_status():
    """Get current system status"""
    try:
        # Get user from request for user-specific data
        user, error_response, status_code = get_user_from_request()
        user_id = user.get('id') if user else None
        
        # Get latest user-specific timetable cache timestamp from Supabase.
        # This must represent when data was actually fetched/scraped.
        latest_timestamp = supabase_manager.get_latest_timetable_timestamp(user_id)

        last_update = latest_timestamp
        
        status_data = {
            'timestamp': datetime.now().isoformat(),
            'cache_exists': latest_timestamp is not None,
            'last_update': last_update,
            'source': 'supabase' if latest_timestamp else 'none'
        }
        
        return jsonify({
            'success': True,
            'data': status_data,
            'timestamp': datetime.now().isoformat()
        })
        
    except Exception as e:
        logger.error(f"Error getting status: {e}")
        return jsonify({
            'success': False,
            'error': str(e),
            'timestamp': datetime.now().isoformat()
        }), 500

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    print(f"Starting server on 0.0.0.0:{port}")
    print(f"Access URLs:")
    print(f"  Local: http://localhost:{port}")
    print(f"  Network: http://{LOCAL_IP}:{port}")
    app.run(host='0.0.0.0', port=port, debug=False, threaded=True)
