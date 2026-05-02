"""
gmail_client.py
"""
import base64
import logging
import os
from typing import Dict, List, Optional

from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow
from google.auth.transport.requests import Request
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError
import email
from email import policy

SCOPES = ["https://www.googleapis.com/auth/gmail.readonly"]

LOGGER = logging.getLogger(__name__)

def get_credentials(token_path: str = "token.json", client_secret_path: str = "credentials/client_secret.json") -> Credentials:
    creds = None
    if os.path.exists(token_path):
        creds = Credentials.from_authorized_user_file(token_path, SCOPES)
    if not creds or not creds.valid:
        if creds and creds.expired and creds.refresh_token:
            LOGGER.info("Refreshing Gmail token...")
            creds.refresh(Request())
        else:
            if not os.path.exists(client_secret_path):
                raise FileNotFoundError(
                    f"Missing OAuth client file at {client_secret_path}. "
                    f"Download from Google Cloud Console → OAuth 2.0 Client IDs."
                )
            flow = InstalledAppFlow.from_client_secrets_file(client_secret_path, SCOPES)
            creds = flow.run_local_server(port=0)
        with open(token_path, "w", encoding="utf-8") as token:
            token.write(creds.to_json())
            LOGGER.info("Saved Gmail token to %s", token_path)
    return creds

def build_service(creds: Credentials):
    return build("gmail", "v1", credentials=creds, cache_discovery=False)

def list_messages(service, user_id: str, query: str, max_results: int = 10) -> List[Dict]:
    try:
        resp = service.users().messages().list(userId=user_id, q=query, maxResults=max_results).execute()
        return resp.get("messages", []) or []
    except HttpError as e:
        LOGGER.error("Gmail list error: %s", e)
        return []

def get_message(service, user_id: str, msg_id: str) -> Dict:
    return service.users().messages().get(userId=user_id, id=msg_id, format="full").execute()

def _walk_parts_for_html(payload) -> Optional[str]:
    if not payload:
        return None

    mime_type = payload.get("mimeType")
    body = payload.get("body", {})

    if mime_type == "text/html":
        data = body.get("data")
        if data:
            return base64.urlsafe_b64decode(data.encode("utf-8")).decode("utf-8", errors="ignore")

    if mime_type in {"multipart/alternative", "multipart/mixed", "multipart/related"}:
        for part in payload.get("parts", []) or []:
            html = _walk_parts_for_html(part)
            if html:
                return html

    if mime_type == "text/plain":
        data = body.get("data")
        if data:
            return base64.urlsafe_b64decode(data.encode("utf-8")).decode("utf-8", errors="ignore")

    return None

def get_message_html(service, user_id: str, msg_id: str) -> Optional[str]:
    msg = get_message(service, user_id, msg_id)
    payload = msg.get("payload", {})
    html = _walk_parts_for_html(payload)

    # If the HTML is missing or contains a clipped marker, attempt raw MIME fetch
    clipped_markers = ['Message clipped', 'View entire message', 'View entire message']
    try_raw = False
    if not html:
        try_raw = True
    else:
        lower_html = html[:1000]
        if any(marker in lower_html for marker in clipped_markers):
            try_raw = True

    if try_raw:
        try:
            raw_msg = service.users().messages().get(userId=user_id, id=msg_id, format='raw').execute()
            raw_b64 = raw_msg.get('raw')
            if raw_b64:
                parsed = _parse_raw_message_html(raw_b64)
                if parsed:
                    return parsed
        except Exception as e:
            LOGGER.warning(f"Could not fetch/parse raw message: {e}")

    return html


def _base64_urlsafe_decode(s: str) -> bytes:
    # Add padding if necessary
    if isinstance(s, str):
        s = s.encode('utf-8')
    # base64.urlsafe_b64decode accepts bytes
    rem = len(s) % 4
    if rem:
        s = s + b'=' * (4 - rem)
    return base64.urlsafe_b64decode(s)


def _parse_raw_message_html(raw_b64: str) -> Optional[str]:
    """Decode a raw base64url-encoded RFC 822 message and extract the HTML part."""
    try:
        raw_bytes = _base64_urlsafe_decode(raw_b64)
        msg = email.message_from_bytes(raw_bytes, policy=policy.default)
        if msg.is_multipart():
            for part in msg.walk():
                ctype = part.get_content_type()
                if ctype == 'text/html':
                    try:
                        return part.get_content()
                    except Exception:
                        return part.get_payload(decode=True).decode(part.get_content_charset('utf-8'), errors='ignore')
            # fallback: return first text/plain if no html
            for part in msg.walk():
                if part.get_content_type() == 'text/plain':
                    try:
                        return part.get_content()
                    except Exception:
                        return part.get_payload(decode=True).decode(part.get_content_charset('utf-8'), errors='ignore')
        else:
            if msg.get_content_type() == 'text/html':
                try:
                    return msg.get_content()
                except Exception:
                    return msg.get_payload(decode=True).decode(msg.get_content_charset('utf-8'), errors='ignore')
    except Exception as e:
        LOGGER.warning(f"Failed to parse raw message: {e}")
    return None
