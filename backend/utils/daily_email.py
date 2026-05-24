import logging
from typing import Dict

from database.supabase_client import supabase_manager
from scraper.scheduler import run_once
from utils.email_sender import send_timetable_email

LOGGER = logging.getLogger(__name__)


def send_daily_timetable_email_for_user(user: Dict, settings: Dict) -> Dict:
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
    scrape_result = run_once(
        user_email=university_email,
        show_table=False,
        user_id=user_id,
        user_settings=settings,
    )

    if not scrape_result or not scrape_result.get('success'):
        return {
            'user_email': university_email,
            'personal_email': personal_email,
            'success': False,
            'error': scrape_result.get('error') if scrape_result else 'Unknown scrape error',
        }

    timetable = scrape_result.get('data') or {}
    send_timetable_email(personal_email, university_email, timetable)
    return {
        'user_email': university_email,
        'personal_email': personal_email,
        'success': True,
        'items': len(timetable.get('items') or []),
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
