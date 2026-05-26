import os
import sys
import threading

sys.path.append(os.path.join(os.path.dirname(__file__), '..'))

from app import app
from utils import daily_email
from utils.email_sender import _build_plain_text, _build_subject, build_timetable_email_html


def _empty_timetable():
    return {
        'for_day': 'Wednesday',
        'for_date': '2026-05-27',
        'items': [],
        'summary': {
            'total_items': 0,
            'semester_breakdown': {},
            'unique_courses': 0,
            'unique_faculty': 0,
        },
    }


def test_no_classes_email_template_is_themed():
    timetable = _empty_timetable()

    html = build_timetable_email_html(timetable, 'student@example.com')
    text = _build_plain_text(timetable)
    subject = _build_subject(timetable)

    assert 'No Classes Found' in html
    assert 'Clear schedule' in html
    assert 'We will check again automatically' in html
    assert 'No Classes Found' in text
    assert subject == 'Inbox2Table: No classes found for Wednesday'


def test_daily_email_sends_when_scraper_finds_no_messages(monkeypatch):
    sent = {}

    def fake_run_once(**_kwargs):
        return {
            'success': True,
            'data': _empty_timetable(),
            'message': 'No messages found for today',
        }

    def fake_send_timetable_email(to_email, university_email, timetable):
        sent['to_email'] = to_email
        sent['university_email'] = university_email
        sent['timetable'] = timetable
        return {'provider': 'official_gmail', 'subject': _build_subject(timetable)}

    monkeypatch.setattr(daily_email, 'run_once', fake_run_once)
    monkeypatch.setattr(daily_email, 'get_email_delivery_provider', lambda: 'official_gmail')
    monkeypatch.setattr(daily_email, 'send_timetable_email', fake_send_timetable_email)

    result = daily_email.send_daily_timetable_email_for_user(
        {'id': 'user-1', 'email': 'student@example.com'},
        {
            'personal_email': 'personal@example.com',
            'allowed_semesters': ['BS (SE) - 5C'],
            'daily_email_enabled': True,
        },
    )

    assert result['success'] is True
    assert result['items'] == 0
    assert result['message'] == 'No classes found email sent'
    assert sent['to_email'] == 'personal@example.com'
    assert sent['timetable']['items'] == []
    assert sent['timetable']['summary']['total_items'] == 0


def test_daily_email_falls_back_for_no_schedule_scraper_error(monkeypatch):
    saved_cache = {}
    sent = {}

    def fake_run_once(**_kwargs):
        return {
            'success': False,
            'error': 'No timetable email found for target day',
        }

    def fake_save_timetable_cache(user_id, timetable):
        saved_cache['user_id'] = user_id
        saved_cache['timetable'] = timetable

    def fake_send_timetable_email(to_email, university_email, timetable):
        sent['to_email'] = to_email
        sent['university_email'] = university_email
        sent['timetable'] = timetable
        return {'provider': 'official_gmail', 'subject': _build_subject(timetable)}

    monkeypatch.setattr(daily_email, 'run_once', fake_run_once)
    monkeypatch.setattr(daily_email.supabase_manager, 'save_timetable_cache', fake_save_timetable_cache)
    monkeypatch.setattr(daily_email, 'get_email_delivery_provider', lambda: 'official_gmail')
    monkeypatch.setattr(daily_email, 'send_timetable_email', fake_send_timetable_email)

    result = daily_email.send_daily_timetable_email_for_user(
        {'id': 'user-1', 'email': 'student@example.com'},
        {
            'personal_email': 'personal@example.com',
            'allowed_semesters': ['BS (SE) - 5C'],
            'timezone': 'Asia/Karachi',
            'next_day_available_hour': 17,
        },
    )

    assert result['success'] is True
    assert result['items'] == 0
    assert saved_cache['user_id'] == 'user-1'
    assert saved_cache['timetable']['items'] == []
    assert sent['timetable']['no_classes_reason'] == 'No timetable email found for target day'


def test_cron_endpoint_accepts_bearer_secret_and_starts_daily_job(monkeypatch):
    calls = []

    class ImmediateThread:
        def __init__(self, target, daemon=False):
            self.target = target
            self.daemon = daemon

        def start(self):
            self.target()

    def fake_send_daily_timetable_emails():
        calls.append('sent')
        return {'success': True, 'processed': 1, 'failed': 0, 'results': []}

    monkeypatch.setenv('AUTOMATION_SECRET', 'test-secret')
    monkeypatch.setattr(threading, 'Thread', ImmediateThread)
    monkeypatch.setattr(daily_email, 'send_daily_timetable_emails', fake_send_daily_timetable_emails)

    app.config['TESTING'] = True
    with app.test_client() as client:
        response = client.post(
            '/api/automation/send-daily-timetables',
            headers={'Authorization': 'Bearer test-secret'},
        )

    assert response.status_code == 202
    assert response.get_json()['success'] is True
    assert calls == ['sent']
