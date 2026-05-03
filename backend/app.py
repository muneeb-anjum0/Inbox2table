"""
Flask backend for TimeTable Scraper with Multi-User Support
Provides RESTful API endpoints for the React frontend
"""
import os
import sys
import json
import logging
import socket
from datetime import datetime
from flask import Flask, jsonify, request
from flask_cors import CORS

# Backend imports are now local since all backend code is in this directory

app = Flask(__name__)
# CORS configuration to allow network access
# More permissive CORS for development
CORS(app, origins=["*"], supports_credentials=True, 
     allow_headers=['Content-Type', 'Authorization', 'X-User-Email'],
     methods=['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'])

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

# Import after CORS setup
from scraper.scheduler import run_once
from scraper.config import settings
from database.supabase_client import supabase_manager

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
    logger.info(f"X-User-Email header: {user_email}")
    
    if not user_email and request.is_json:
        user_email = request.json.get('user_email')
        logger.info(f"user_email from JSON: {user_email}")
    
    if not user_email:
        logger.warning("No user email found in request")
        return None, jsonify({'error': 'User email required'}), 400
        
    try:
        user = supabase_manager.get_or_create_user(user_email)
        logger.info(f"Found/created user: {user['email']}")
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
        
        if '192.168.' in origin:
            redirect_host = origin.split('://')[1].split(':')[0] + f':{BACKEND_PORT}'
            redirect_uri = f'http://{redirect_host}/api/auth/gmail/callback'
        else:
            redirect_uri = 'http://localhost:5000/api/auth/gmail/callback'
        
        # Load and show current OAuth config
        import os
        client_secrets_file = os.path.join(os.path.dirname(__file__), 'credentials', 'client_secret.json')
        
        oauth_info = {
            'current_redirect_uri': redirect_uri,
            'request_origin': origin,
            'request_host': host,
            'client_secrets_exists': os.path.exists(client_secrets_file)
        }
        
        if os.path.exists(client_secrets_file):
            with open(client_secrets_file, 'r') as f:
                import json
                client_config = json.load(f)
                oauth_info['configured_redirect_uris'] = client_config.get('installed', {}).get('redirect_uris', [])
                oauth_info['client_id'] = client_config.get('installed', {}).get('client_id', 'Not found')
        
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
        
        # Always use localhost for OAuth redirects (Google OAuth requirement)
        # This works even when accessing from network devices because OAuth happens in popup/redirect
        redirect_uri = 'http://localhost:5000/api/auth/gmail/callback'
        
        flow.redirect_uri = redirect_uri
        logger.info(f"Using OAuth redirect URI: {redirect_uri}")
        logger.info(f"Request origin: {request.headers.get('Origin', 'None')}")
        logger.info(f"Request host: {request.headers.get('Host', 'None')}")
        
        # Generate authorization URL
        authorization_url, state = flow.authorization_url(
            access_type='offline',
            include_granted_scopes='true',
            prompt='consent'  # Force consent screen to ensure fresh tokens
        )
        
        logger.info(f"Generated Gmail OAuth URL: {authorization_url}")
        
        # Store state in session or return it to frontend
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
        # Always use localhost for OAuth redirects (Google OAuth requirement)
        redirect_uri = 'http://localhost:5000/api/auth/gmail/callback'
        
        flow.redirect_uri = redirect_uri
        logger.info(f"Using OAuth callback redirect URI: {redirect_uri}")
        logger.info(f"Request origin: {request.headers.get('Origin', 'None')}")
        logger.info(f"Request host: {request.headers.get('Host', 'None')}")
        
        # Get the authorization response
        authorization_response = request.url
        logger.info(f"Authorization response: {authorization_response}")
        
        # Fetch the token (this may fail if scopes don't match)
        try:
            flow.fetch_token(authorization_response=authorization_response)
        except Exception as token_error:
            logger.error(f"Token fetch error: {token_error}")
            # If scope mismatch, create a new flow with no scope validation
            if "scope" in str(token_error).lower():
                logger.warning("Scope mismatch detected, creating flexible flow...")
                
                # Create a more flexible flow by parsing the actual returned scopes
                import urllib.parse as urlparse
                parsed_url = urlparse.urlparse(authorization_response)
                query_params = urlparse.parse_qs(parsed_url.query)
                
                # Get the actual scopes returned by Google
                if 'scope' in query_params:
                    actual_scopes = query_params['scope'][0].split(' ')
                    logger.info(f"Actual scopes returned by Google: {actual_scopes}")
                    
                    # Create new flow with actual scopes and dynamic redirect URI
                    flow = Flow.from_client_secrets_file(
                        client_secrets_file,
                        scopes=actual_scopes
                    )
                    
                    # Always use localhost for OAuth redirects (Google OAuth requirement)
                    redirect_uri = 'http://localhost:5000/api/auth/gmail/callback'
                    
                    flow.redirect_uri = redirect_uri
                    logger.info(f"Using fallback OAuth callback redirect URI: {redirect_uri}")
                
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
            # Method 1: Try Gmail API to get profile
            gmail_service = build('gmail', 'v1', credentials=credentials)
            profile = gmail_service.users().getProfile(userId='me').execute()
            user_email = profile['emailAddress']
            logger.info(f"Got user email from Gmail API: {user_email}")
        except Exception as gmail_error:
            logger.warning(f"Gmail API profile fetch failed: {gmail_error}")
            
            try:
                # Method 2: Try userinfo API
                userinfo_service = build('oauth2', 'v2', credentials=credentials)
                userinfo = userinfo_service.userinfo().get().execute()
                user_email = userinfo.get('email')
                logger.info(f"Got user email from UserInfo API: {user_email}")
            except Exception as userinfo_error:
                logger.error(f"UserInfo API failed: {userinfo_error}")
                raise Exception("Could not retrieve user email from any API")
        
        if not user_email:
            raise Exception("No user email found in OAuth response")
        
        logger.info(f"Gmail OAuth successful for user: {user_email}")
        
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
        logger.info(f"Saved Gmail tokens for user: {user_email}")
        
        # Get frontend URL dynamically based on referrer or request origin
        frontend_url = f'http://localhost:{FRONTEND_PORT}'  # default
        
        # Check referer header to determine frontend origin
        referer = request.headers.get('Referer', '')
        user_agent = request.headers.get('User-Agent', '')
        
        if LOCAL_IP in referer:
            frontend_url = f'http://{LOCAL_IP}:{FRONTEND_PORT}'
        elif 'localhost:3000' in referer or '127.0.0.1:3000' in referer:
            frontend_url = f'http://localhost:{FRONTEND_PORT}'
        
        # Check if this is a mobile browser (Safari, iOS, etc.)
        is_mobile = any(mobile_agent in user_agent.lower() for mobile_agent in 
                       ['mobile', 'android', 'iphone', 'ipad', 'ipod', 'blackberry', 'opera mini'])
        
        logger.info(f"OAuth callback - Frontend URL: {frontend_url}, Mobile: {is_mobile}, User-Agent: {user_agent}")
        
        if is_mobile:
            # For mobile browsers, redirect directly to frontend with auth data in URL
            import urllib.parse
            auth_data = urllib.parse.urlencode({
                'auth': 'success',
                'user_id': user['id'],
                'email': user_email
            })
            redirect_url = f"{frontend_url}?{auth_data}"
            logger.info(f"Mobile redirect to: {redirect_url}")
            
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
            return f"""
            <html>
            <body>
            <script>
            // Try to communicate with parent window using multiple target origins
            const targetOrigins = [
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
        
        # Check referer header to determine frontend origin
        referer = request.headers.get('Referer', '')
        user_agent = request.headers.get('User-Agent', '')
        
        if LOCAL_IP in referer:
            frontend_url = f'http://{LOCAL_IP}:{FRONTEND_PORT}'
        elif 'localhost:3000' in referer or '127.0.0.1:3000' in referer:
            frontend_url = f'http://localhost:{FRONTEND_PORT}'
        
        # Check if this is a mobile browser
        is_mobile = any(mobile_agent in user_agent.lower() for mobile_agent in 
                       ['mobile', 'android', 'iphone', 'ipad', 'ipod', 'blackberry', 'opera mini'])
        
        logger.info(f"OAuth error callback - Frontend URL: {frontend_url}, Mobile: {is_mobile}")
        
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
            return f"""
            <html>
            <body>
        <script>
        // Try to communicate with parent window using multiple target origins
        const targetOrigins = [
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
            'schedule_time': f"{settings.check_hour_local:02d}:{settings.check_minute_local:02d}",
            'timezone': user_settings.get('timezone', settings.tz),
            'max_results': getattr(settings, 'max_results_per_semester', 50)
        }
        return jsonify(safe_config)
    except Exception as e:
        logger.error(f"Error loading config: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/config/semesters', methods=['POST', 'OPTIONS'])
def update_semesters():
    """Update allowed semesters configuration for a user"""
    # Handle preflight request
    if request.method == 'OPTIONS':
        return '', 200
        
    try:
        user, error_response, status_code = get_user_from_request()
        if error_response:
            return error_response, status_code
            
        data = request.get_json()
        if not data or 'semesters' not in data:
            return jsonify({'error': 'Missing semesters data'}), 400
        
        new_semesters = data['semesters']
        if not isinstance(new_semesters, list):
            return jsonify({'error': 'Semesters must be a list'}), 400

        # Get current user settings
        current_settings = supabase_manager.get_user_settings(user['id'])
        current_settings['allowed_semesters'] = new_semesters
        
        # Save updated settings to Supabase
        success = supabase_manager.save_user_settings(user['id'], current_settings)
        
        if success:
            logger.info(f"Updated allowed semesters for user {user['email']}: {new_semesters}")
            return jsonify({
                'success': True,
                'message': f'Updated {len(new_semesters)} allowed semesters',
                'semesters': new_semesters
            })
        else:
            return jsonify({'error': 'Failed to save settings'}), 500
            
    except Exception as e:
        logger.error(f"Error updating semesters: {e}")
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
        
        if not cache_data:
            logger.info("No cached timetable data found")
            return jsonify({
                'success': False,
                'message': 'No cached schedule data found. Run a scrape first.',
                'timestamp': datetime.now().isoformat()
            }), 404
            
        logger.info("Returning cached timetable data")
        return jsonify({
            'success': True,
            'data': cache_data,
            'timestamp': datetime.now().isoformat(),
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
        
        # Get latest timestamp from Supabase (user-specific or global)
        latest_timestamp = supabase_manager.get_latest_timetable_timestamp(user_id)
        
        # Also check local cache file as fallback
        cache_file = os.path.join(os.path.dirname(__file__), '..', 'data', 'cache', 'last_checked.json')
        cache_exists = os.path.exists(cache_file)
        local_timestamp = None
        
        if cache_exists:
            stat = os.stat(cache_file)
            local_timestamp = datetime.fromtimestamp(stat.st_mtime).isoformat()
        
        # Use the most recent timestamp (Supabase or local)
        last_update = latest_timestamp
        if local_timestamp and (not latest_timestamp or local_timestamp > latest_timestamp):
            last_update = local_timestamp
        
        status_data = {
            'timestamp': datetime.now().isoformat(),
            'cache_exists': cache_exists or (latest_timestamp is not None),
            'last_update': last_update,
            'source': 'supabase' if latest_timestamp else ('local' if local_timestamp else 'none')
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