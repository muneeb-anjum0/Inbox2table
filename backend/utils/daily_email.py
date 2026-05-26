import logging
import os
from datetime import datetime, timedelta
from typing import Callable, Dict, Optional

from dateutil import tz

from database.supabase_client import supabase_manager
from scraper.scheduler import run_once
from utils.email_sender import get_email_delivery_provider, send_timetable_email, send_timetable_email_with_gmail

LOGGER = logging.getLogger(__name__)
WEEKDAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
NO_SCHEDULE_ERROR_MARKERS = (
    'no message',
    'no email',
    'no timetable',
    'no schedule',
    'no classes',
)


def _target_empty_timetable(settings: Dict, error: str = '') -> Dict:
    timezone = settings.get('timezone') or os.environ.get('TZ') or 'Asia/Karachi'
    next_day_available_hour = int(settings.get('next_day_available_hour') or os.environ.get('NEXT_DAY_AVAILABLE_HOUR') or 17)
    local_tz = tz.gettz(timezone)
    now_local = datetime.now(tz=local_tz)
    target_date = now_local + timedelta(days=1) if now_local.hour >= next_day_available_hour else now_local

    return {
        'for_day': WEEKDAY_NAMES[target_date.weekday()],
        'for_date': target_date.date().isoformat(),
        'query': settings.get('gmail_query_base'),
        'message_id': None,
        'items': [],
        'semesters': settings.get('allowed_semesters') or [],
        'summary': {
            'total_items': 0,
            'semester_breakdown': {},
            'unique_courses': 0,
            'unique_faculty': 0,
        },
        'no_classes_reason': error or 'No timetable email matched the configured semesters.',
    }


def _is_no_schedule_error(error: object) -> bool:
    text = str(error or '').lower()
    return any(marker in text for marker in NO_SCHEDULE_ERROR_MARKERS)


def send_daily_timetable_email_for_user(
    user: Dict,
    settings: Dict,
    status_callback: Optional[Callable[[Dict], None]] = None,
) -> Dict:
    """Run the scraper for one user and send their formatted timetable email."""
    personal_email = (settings.get('personal_email') or '').strip()
    university_email = user.get('email')
    user_id = user.get('id')

    if not personal_email:
        return {
            'user_email': university_email,
            'personal_email': personal_email,
            'success': False,
            'error': 'No personal email is configured',
        }

    if not university_email or not user_id:
        return {
            'user_email': university_email,
            'personal_email': personal_email,
            'success': False,
            'error': 'Missing user identity',
        }

    LOGGER.info("Running daily timetable email for %s -> %s", university_email, personal_email)
    if status_callback:
        status_callback({
            'status': 'scraping',
            'success': None,
            'message': 'Scraping the latest timetable from Gmail',
            'personal_email': personal_email,
            'user_email': university_email,
        })

    scrape_result = run_once(
        user_email=university_email,
        show_table=False,
        user_id=user_id,
        user_settings=settings,
    )

    if not scrape_result or not scrape_result.get('success'):
        scrape_error = scrape_result.get('error') if scrape_result else 'Unknown scrape error'
        if _is_no_schedule_error(scrape_error):
            timetable = _target_empty_timetable(settings, scrape_error)
            if user_id:
                try:
                    supabase_manager.save_timetable_cache(user_id, timetable)
                except Exception as cache_error:
                    LOGGER.warning("Could not save empty timetable cache for %s: %s", university_email, cache_error)
        else:
            return {
                'user_email': university_email,
                'personal_email': personal_email,
                'success': False,
                'error': scrape_error,
            }
    else:
        timetable = scrape_result.get('data') or {}

    if not timetable:
        timetable = _target_empty_timetable(settings)

    if not isinstance(timetable.get('items'), list):
        timetable['items'] = []

    if not timetable.get('summary'):
        timetable['summary'] = {
            'total_items': len(timetable.get('items') or []),
            'semester_breakdown': {},
            'unique_courses': 0,
            'unique_faculty': 0,
        }

    if timetable.get('items') == [] and status_callback:
        status_callback({
            'status': 'sending',
            'success': None,
            'message': f"No classes found. Sending a no-classes email to {personal_email}",
            'personal_email': personal_email,
            'user_email': university_email,
            'items': 0,
        })

    if settings.get('daily_email_last_result', {}).get('job_id'):
        timetable['email_job_id'] = settings['daily_email_last_result']['job_id']

    if status_callback:
        status_callback({
            'status': 'sending',
            'success': None,
            'message': f"Scrape completed. Sending email to {personal_email}",
            'personal_email': personal_email,
            'user_email': university_email,
            'items': len(timetable.get('items') or []),
        })

    if status_callback:
        status_callback({
            'status': 'sending',
            'success': None,
            'message': f"Sending email to {personal_email}",
            'personal_email': personal_email,
            'user_email': university_email,
            'items': len(timetable.get('items') or []),
        })

    provider = get_email_delivery_provider()

    if provider == 'gmail':
        token_data = supabase_manager.get_user_tokens(user_id)
        send_result = send_timetable_email_with_gmail(personal_email, university_email, timetable, token_data)
    else:
        send_result = send_timetable_email(personal_email, university_email, timetable)

    return {
        'user_email': university_email,
        'personal_email': personal_email,
        'success': True,
        'items': len(timetable.get('items') or []),
        'message': 'No classes found email sent' if not (timetable.get('items') or []) else 'Timetable email sent',
        'send_result': send_result,
    }


def send_daily_timetable_emails() -> Dict:
    """Run the scraper for every user with daily email enabled and send results."""
    configured_users = supabase_manager.list_users_with_daily_email()
    results = []

    for entry in configured_users:
        user = entry.get('user') or {}
        settings = entry.get('settings') or {}
        try:
            results.append(send_daily_timetable_email_for_user(user, settings))

        except Exception as exc:
            university_email = user.get('email')
            personal_email = entry.get('personal_email')
            LOGGER.error("Daily timetable email failed for %s: %s", university_email, exc, exc_info=True)
            results.append({
                'user_email': university_email,
                'personal_email': personal_email,
                'success': False,
                'error': str(exc),
            })

    failed = [result for result in results if not result.get('success')]
    return {
        'success': len(failed) == 0,
        'processed': len(results),
        'failed': len(failed),
        'results': results,
    }
