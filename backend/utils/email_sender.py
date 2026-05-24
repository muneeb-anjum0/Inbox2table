import os
import base64
import requests
import smtplib
from email.message import EmailMessage
from datetime import datetime
from typing import Dict, List

from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError


def _smtp_settings() -> Dict[str, object]:
    return {
        'host': os.environ.get('SMTP_HOST', 'smtp-mail.outlook.com'),
        'port': int(os.environ.get('SMTP_PORT', '587')),
        'username': os.environ.get('SMTP_USERNAME', ''),
        'password': os.environ.get('SMTP_PASSWORD', ''),
        'from_name': os.environ.get('SMTP_FROM_NAME', 'Inbox2Table'),
    }


def _resend_settings() -> Dict[str, str]:
    return {
        'api_key': os.environ.get('RESEND_API_KEY', ''),
        'from_email': os.environ.get('EMAIL_FROM') or os.environ.get('SMTP_USERNAME', ''),
        'from_name': os.environ.get('SMTP_FROM_NAME', 'Inbox2Table'),
    }


def get_email_delivery_provider() -> str:
    provider = os.environ.get('EMAIL_DELIVERY_PROVIDER', 'gmail').strip().lower()
    if provider not in {'gmail', 'smtp', 'resend'}:
        return 'gmail'
    return provider


def _escape(value: object) -> str:
    text = '' if value is None else str(value)
    return (
        text.replace('&', '&amp;')
        .replace('<', '&lt;')
        .replace('>', '&gt;')
        .replace('"', '&quot;')
    )


def _display(value: object, fallback: str = '-') -> str:
    text = str(value or '').strip()
    return text if text else fallback


def _build_plain_text(timetable: Dict) -> str:
    items: List[Dict] = timetable.get('items') or []
    lines = [
        f"Inbox2Table schedule for {timetable.get('for_day', 'today')} ({timetable.get('for_date', '')})",
        '',
    ]

    if not items:
        lines.append('No classes were found for the configured semesters.')
        return '\n'.join(lines)

    for item in items:
        lines.append(
            f"{_display(item.get('semester_display') or item.get('semester'))} | "
            f"{_display(item.get('course_title') or item.get('course'))} | "
            f"{_display(item.get('faculty'))} | "
            f"{_display(item.get('room'))} | "
            f"{_display(item.get('time'))} | "
            f"{_display(item.get('campus'))}"
        )

    return '\n'.join(lines)


def _group_items_by_semester(items: List[Dict]) -> Dict[str, List[Dict]]:
    grouped: Dict[str, List[Dict]] = {}
    for item in items:
        semester = _display(
            item.get('semester_display') or item.get('class_section') or item.get('semester'),
            'Unassigned',
        )
        grouped.setdefault(semester, []).append(item)
    return grouped


def build_timetable_email_html(timetable: Dict, university_email: str) -> str:
    items: List[Dict] = timetable.get('items') or []
    summary = timetable.get('summary') or {}
    grouped = _group_items_by_semester(items)
    for semester_items in grouped.values():
        semester_items.sort(key=lambda item: _display(item.get('time')))

    rows_html = []
    if not items:
        rows_html.append(
            """
            <tr>
              <td colspan="5" style="padding:18px;color:#64748b;text-align:center;">
                No classes were found for your configured semesters.
              </td>
            </tr>
            """
        )
    else:
        for semester, semester_items in grouped.items():
            rows_html.append(
                f"""
                <tr>
                  <td colspan="5" style="padding:12px 14px;background:#f8fafc;border-top:1px solid #e2e8f0;border-bottom:1px solid #e2e8f0;color:#0f172a;font-weight:700;">
                    {_escape(semester)} · {len(semester_items)} class{'es' if len(semester_items) != 1 else ''}
                  </td>
                </tr>
                """
            )
            for item in semester_items:
                course = _display(item.get('course_title') or item.get('course'))
                course_code = _display(item.get('course_code') or item.get('course'), '')
                faculty = _display(item.get('faculty') or item.get('faculty_name'), 'TBD')
                room = _display(item.get('room'), 'TBD')
                time = _display(item.get('time'))
                campus = _display(item.get('campus'))
                cancelled = 'cancelled' in ' '.join([course, faculty, room, time, campus]).lower()
                accent = '#dc2626' if cancelled else '#0f172a'

                rows_html.append(
                    f"""
                    <tr>
                      <td style="padding:12px 14px;border-bottom:1px solid #e5e7eb;color:{accent};">
                        <div style="font-weight:700;">{_escape(course)}</div>
                        <div style="margin-top:3px;color:#64748b;font-size:12px;">{_escape(course_code)}</div>
                      </td>
                      <td style="padding:12px 14px;border-bottom:1px solid #e5e7eb;color:#334155;">{_escape(faculty)}</td>
                      <td style="padding:12px 14px;border-bottom:1px solid #e5e7eb;color:#334155;">{_escape(room)}</td>
                      <td style="padding:12px 14px;border-bottom:1px solid #e5e7eb;color:#334155;white-space:nowrap;">{_escape(time)}</td>
                      <td style="padding:12px 14px;border-bottom:1px solid #e5e7eb;color:#334155;">{_escape(campus)}</td>
                    </tr>
                    """
                )

    return f"""
    <!doctype html>
    <html>
      <body style="margin:0;padding:0;background:#f1f5f9;font-family:Arial,Helvetica,sans-serif;color:#0f172a;">
        <div style="max-width:920px;margin:0 auto;padding:28px 14px;">
          <div style="background:#ffffff;border:1px solid #e2e8f0;border-radius:18px;overflow:hidden;box-shadow:0 18px 42px rgba(15,23,42,0.08);">
            <div style="padding:24px;background:#0f172a;color:#ffffff;">
              <div style="font-size:12px;letter-spacing:0.12em;text-transform:uppercase;color:#cbd5e1;">Inbox2Table</div>
              <h1 style="margin:8px 0 0;font-size:24px;line-height:1.2;">Your timetable for {_escape(timetable.get('for_day', 'today'))}</h1>
              <p style="margin:8px 0 0;color:#cbd5e1;font-size:14px;">Generated for {_escape(university_email)} · {_escape(timetable.get('for_date', ''))}</p>
            </div>

            <div style="display:flex;gap:10px;flex-wrap:wrap;padding:16px 20px;background:#f8fafc;border-bottom:1px solid #e2e8f0;">
              <span style="padding:8px 10px;border-radius:999px;background:#ffffff;border:1px solid #e2e8f0;font-size:13px;"><strong>{_escape(summary.get('total_items', len(items)))}</strong> classes</span>
              <span style="padding:8px 10px;border-radius:999px;background:#ffffff;border:1px solid #e2e8f0;font-size:13px;"><strong>{_escape(summary.get('unique_courses', 0))}</strong> unique courses</span>
              <span style="padding:8px 10px;border-radius:999px;background:#ffffff;border:1px solid #e2e8f0;font-size:13px;"><strong>{_escape(summary.get('unique_faculty', 0))}</strong> faculty</span>
            </div>

            <div style="overflow-x:auto;">
              <table role="presentation" cellspacing="0" cellpadding="0" style="width:100%;border-collapse:collapse;font-size:14px;">
                <thead>
                  <tr style="background:#ffffff;">
                    <th align="left" style="padding:13px 14px;border-bottom:1px solid #e2e8f0;color:#64748b;font-size:11px;text-transform:uppercase;letter-spacing:0.08em;">Course</th>
                    <th align="left" style="padding:13px 14px;border-bottom:1px solid #e2e8f0;color:#64748b;font-size:11px;text-transform:uppercase;letter-spacing:0.08em;">Faculty</th>
                    <th align="left" style="padding:13px 14px;border-bottom:1px solid #e2e8f0;color:#64748b;font-size:11px;text-transform:uppercase;letter-spacing:0.08em;">Room</th>
                    <th align="left" style="padding:13px 14px;border-bottom:1px solid #e2e8f0;color:#64748b;font-size:11px;text-transform:uppercase;letter-spacing:0.08em;">Time</th>
                    <th align="left" style="padding:13px 14px;border-bottom:1px solid #e2e8f0;color:#64748b;font-size:11px;text-transform:uppercase;letter-spacing:0.08em;">Campus</th>
                  </tr>
                </thead>
                <tbody>
                  {''.join(rows_html)}
                </tbody>
              </table>
            </div>

            <div style="padding:16px 20px;color:#64748b;font-size:12px;background:#ffffff;">
              This automated email was sent because daily delivery is enabled in Inbox2Table.
            </div>
          </div>
        </div>
      </body>
    </html>
    """


def _build_subject(timetable: Dict) -> str:
    job_marker = timetable.get('email_job_id')
    suffix = f" [{job_marker[:8]}]" if job_marker else ""
    return f"Inbox2Table: timetable for {timetable.get('for_day', 'today')}{suffix}"


def send_timetable_email(to_email: str, university_email: str, timetable: Dict) -> Dict:
    provider = get_email_delivery_provider()

    if provider == 'resend':
        return send_timetable_email_with_resend(to_email, university_email, timetable)

    if provider == 'gmail':
        raise RuntimeError('Gmail API sending requires token data. Use send_timetable_email_with_gmail.')

    smtp = _smtp_settings()
    username = str(smtp['username'])
    password = str(smtp['password'])

    if not username or not password:
        raise RuntimeError('SMTP_USERNAME and SMTP_PASSWORD must be configured')

    subject = _build_subject(timetable)

    msg = EmailMessage()
    msg['Subject'] = subject
    msg['From'] = f"{smtp['from_name']} <{username}>"
    msg['To'] = to_email
    msg.set_content(_build_plain_text(timetable))
    msg.add_alternative(build_timetable_email_html(timetable, university_email), subtype='html')

    with smtplib.SMTP(str(smtp['host']), int(smtp['port']), timeout=30) as server:
        server.ehlo()
        server.starttls()
        server.ehlo()
        server.login(username, password)
        server.send_message(msg)
        return {
            'provider': 'smtp',
            'subject': subject,
        }


def send_timetable_email_with_gmail(
    to_email: str,
    university_email: str,
    timetable: Dict,
    token_data: Dict,
) -> Dict:
    if not token_data:
        raise RuntimeError('Gmail token data is missing. Sign in with Gmail again.')

    scopes = token_data.get('scopes') or []
    if 'https://www.googleapis.com/auth/gmail.send' not in scopes:
        raise RuntimeError('Gmail send permission is missing. Sign out and sign in again to grant email sending access.')

    expiry = None
    if token_data.get('expiry'):
        try:
            expiry = datetime.fromisoformat(str(token_data['expiry']).replace('Z', '+00:00'))
        except Exception:
            expiry = None

    credentials = Credentials(
        token=token_data.get('token'),
        refresh_token=token_data.get('refresh_token'),
        token_uri=token_data.get('token_uri'),
        client_id=token_data.get('client_id'),
        client_secret=token_data.get('client_secret'),
        scopes=scopes,
        expiry=expiry,
    )
    service = build('gmail', 'v1', credentials=credentials, cache_discovery=False)

    subject = _build_subject(timetable)
    msg = EmailMessage()
    msg['Subject'] = subject
    msg['From'] = university_email
    msg['To'] = to_email
    msg.set_content(_build_plain_text(timetable))
    msg.add_alternative(build_timetable_email_html(timetable, university_email), subtype='html')

    raw = base64.urlsafe_b64encode(msg.as_bytes()).decode('utf-8')

    try:
        send_result = service.users().messages().send(
            userId='me',
            body={'raw': raw},
        ).execute()
    except HttpError as error:
        raise RuntimeError(f"Gmail send failed: {error}") from error

    return {
        'provider': 'gmail',
        'message_id': send_result.get('id'),
        'thread_id': send_result.get('threadId'),
        'subject': subject,
        'from': university_email,
        'to': to_email,
    }


def send_timetable_email_with_resend(to_email: str, university_email: str, timetable: Dict) -> Dict:
    resend = _resend_settings()
    api_key = resend['api_key']
    from_email = resend['from_email']

    if not api_key:
        raise RuntimeError('RESEND_API_KEY must be configured')

    if not from_email:
        raise RuntimeError('EMAIL_FROM must be configured for Resend')

    subject = _build_subject(timetable)
    html = build_timetable_email_html(timetable, university_email)

    response = requests.post(
        'https://api.resend.com/emails',
        headers={
            'Authorization': f'Bearer {api_key}',
            'Content-Type': 'application/json',
        },
        json={
            'from': f"{resend['from_name']} <{from_email}>",
            'to': [to_email],
            'subject': subject,
            'html': html,
            'text': _build_plain_text(timetable),
        },
        timeout=30,
    )

    if response.status_code >= 400:
        raise RuntimeError(f"Resend API error {response.status_code}: {response.text}")

    return {
        'provider': 'resend',
        'response': response.json() if response.content else {},
        'subject': subject,
    }
