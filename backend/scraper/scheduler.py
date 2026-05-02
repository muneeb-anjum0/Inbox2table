"""
APScheduler job that runs nightly at configured local time.
Now supports multi-user operation with Supabase storage.
"""
import json
import logging
import os
import sys
from datetime import datetime, timedelta
from typing import Dict, Optional

# Add parent directory to path for absolute imports
parent_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if parent_dir not in sys.path:
    sys.path.append(parent_dir)

from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger
from dateutil import tz

from .gmail_client import get_credentials, build_service, list_messages, get_message_html
from .timetable_parser import parse_html_with_advanced_pandas

LOGGER = logging.getLogger(__name__)

WEEKDAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]

# Hard-enforce class schedule mail selection so exam/lab/notice threads are excluded.
STRICT_CLASS_SCHEDULE_QUERY_BASE = (
    'subject:"Class Schedule" in:inbox '
    '-subject:midterm -subject:exam -subject:examination '
    '-subject:lab -subject:holiday -subject:retake '
    '-subject:"date sheet" -subject:notice -subject:"new material"'
)

def _target_day_name(now_local: datetime, next_day_available_hour: int = 17) -> str:
    """
    Determine which day's timetable to look for based on current time.
    
    Logic:
    - If it's after the configured hour (default 5 PM/17:00), look for tomorrow's timetable
    - If it's before that hour, look for today's timetable
    
    This is because the next day's timetable becomes available 
    between 5-11 PM on the previous day.
    
    Args:
        now_local: Current local datetime
        next_day_available_hour: Hour when next day's timetable becomes available (24-hour format)
    """
    if now_local.hour >= next_day_available_hour:
        # Look for tomorrow's timetable
        tomorrow = now_local + timedelta(days=1)
        target_day = WEEKDAY_NAMES[tomorrow.weekday()]
        LOGGER.info(f"After {next_day_available_hour}:00 (current: {now_local.hour}:00), looking for tomorrow's timetable: {target_day}")
        return target_day
    else:
        # Look for today's timetable
        target_day = WEEKDAY_NAMES[now_local.weekday()]
        LOGGER.info(f"Before {next_day_available_hour}:00 (current: {now_local.hour}:00), looking for today's timetable: {target_day}")
        return target_day

def _target_date(now_local: datetime, next_day_available_hour: int = 17) -> datetime:
    """
    Get the target date that corresponds to the day we're looking for.
    
    Args:
        now_local: Current local datetime
        next_day_available_hour: Hour when next day's timetable becomes available (24-hour format)
    """
    if now_local.hour >= next_day_available_hour:
        # Target tomorrow's date
        return now_local + timedelta(days=1)
    else:
        # Target today's date
        return now_local

def _build_query(base: str, day_name: str, newer_than_days: int) -> str:
    return f'{base} "for {day_name}" newer_than:{newer_than_days}d -in:trash'


def _class_schedule_query_base(_base: str) -> str:
    """Always use strict class-schedule-only filtering regardless of user input."""
    return STRICT_CLASS_SCHEDULE_QUERY_BASE

def _save_json(doc: Dict, folder: str = "data/cache") -> str:
    """Legacy function - still used for backward compatibility"""
    os.makedirs(folder, exist_ok=True)
    date_str = doc.get("for_date") or datetime.now().date().isoformat()
    path = os.path.join(folder, f"schedule_{date_str}.json")
    with open(path, "w", encoding="utf-8") as f:
        json.dump(doc, f, indent=2, ensure_ascii=False)
    meta_path = os.path.join(folder, "last_checked.json")
    with open(meta_path, "w", encoding="utf-8") as f:
        json.dump(
            {
                "last_message_id": doc.get("message_id"),
                "last_run_at": datetime.utcnow().isoformat() + "Z",
                "query_used": doc.get("query"),
                "for_day": doc.get("for_day"),
                "for_date": doc.get("for_date"),
                "items_found": len(doc.get("items", [])),
            },
            f,
            indent=2,
            ensure_ascii=False,
        )
    return path

def run_once(user_email: str = "me", show_table: bool = False, user_id: Optional[str] = None, user_settings: Optional[Dict] = None) -> Dict:
    """
    Run scraper once for a specific user
    
    Args:
        user_email: Gmail user email (for Gmail API)
        show_table: Whether to display results in table format
        user_id: Supabase user ID for storing results
        user_settings: User-specific settings (overrides global settings)
    """
    LOGGER.info("run_once started")
    LOGGER.info("User context: email=%s user_id=%s", user_email, user_id)
    LOGGER.info("User settings received: %s", user_settings)
    # Import here to ensure config is loaded first
    from .config import settings
    
    try:
        # Use user settings if provided, otherwise use global settings
        LOGGER.info("Global settings allowed_semesters: %s", settings.allowed_semesters)
        
        allowed_semesters = user_settings.get('allowed_semesters', settings.allowed_semesters) if user_settings else settings.allowed_semesters
        raw_gmail_query_base = user_settings.get('gmail_query_base', settings.gmail_query_base) if user_settings else settings.gmail_query_base
        gmail_query_base = _class_schedule_query_base(raw_gmail_query_base)
        newer_than_days = user_settings.get('newer_than_days', settings.newer_than_days) if user_settings else settings.newer_than_days
        timezone = user_settings.get('timezone', settings.tz) if user_settings else settings.tz
        next_day_available_hour = user_settings.get('next_day_available_hour', settings.next_day_available_hour) if user_settings else settings.next_day_available_hour
        
        LOGGER.info("Final allowed_semesters being used: %s", allowed_semesters)
        # scrape_status functionality removed; log a debug message instead
        LOGGER.debug('scrape_status removed: skipping "running" status update')
        if raw_gmail_query_base != gmail_query_base:
            LOGGER.info("Overriding stored gmail_query_base with strict Class Schedule filter")
        
        local_tz = tz.gettz(timezone)
        now_local = datetime.now(tz=local_tz)
        for_day_name = _target_day_name(now_local, next_day_available_hour)
        target_date = _target_date(now_local, next_day_available_hour)

        query = _build_query(gmail_query_base, for_day_name, newer_than_days)

        LOGGER.info("Looking for: %s  (local: %s)", for_day_name, now_local.strftime("%Y-%m-%d %H:%M"))
        LOGGER.info("Gmail query: %s", query)

        # Use user-specific tokens if available
        LOGGER.info("Attempting to load Gmail credentials for user: %s", user_id if user_id else 'default')
        if user_id:
            try:
                from database.supabase_client import supabase_manager
                token_data = supabase_manager.get_user_tokens(user_id)
                if token_data:
                    # Convert stored token data back to credentials object
                    from google.oauth2.credentials import Credentials
                    
                    # Parse expiry if it exists
                    expiry = None
                    if token_data.get('expiry'):
                        try:
                            expiry = datetime.fromisoformat(token_data['expiry'].replace('Z', '+00:00'))
                        except Exception as exp_error:
                            LOGGER.warning(f"Could not parse expiry date: {exp_error}")
                            expiry = None
                    
                    # Reconstruct credentials object
                    creds = Credentials(
                        token=token_data.get('token'),
                        refresh_token=token_data.get('refresh_token'),
                        token_uri=token_data.get('token_uri'),
                        client_id=token_data.get('client_id'),
                        client_secret=token_data.get('client_secret'),
                        scopes=token_data.get('scopes'),
                        expiry=expiry
                    )
                    LOGGER.info(f"Loaded user-specific Gmail credentials for user {user_id}")
                else:
                    # Fall back to default credentials
                    creds = get_credentials()
                    LOGGER.info("No user tokens found, using default credentials")
            except Exception as e:
                LOGGER.warning(f"Could not load user tokens: {e}, using default credentials")
                creds = get_credentials()
        else:
            creds = get_credentials()

        LOGGER.info("Building Gmail service...")
        service = build_service(creds)

        LOGGER.info("Searching for Gmail messages...")
        msgs = list_messages(service, user_id=user_email, query=query, max_results=5)
        LOGGER.info("Found %s messages matching query", len(msgs) if msgs else 0)
        LOGGER.debug('scrape_status removed: skipping "found_messages" status update')
        
        if not msgs:
            LOGGER.warning("No messages matched the query.")
            doc = {
                "for_day": for_day_name,
                "for_date": target_date.date().isoformat(),
                "query": query,
                "message_id": None,
                "items": [],
                "semesters": allowed_semesters,
                "summary": {
                    "total_items": 0,
                    "semester_breakdown": {},
                    "unique_courses": 0,
                    "unique_faculty": 0,
                }
            }
            
            # Save to Supabase if user_id provided, otherwise use local storage
            if user_id:
                from database.supabase_client import supabase_manager
                supabase_manager.save_timetable_cache(user_id, doc)
            else:
                _save_json(doc)
                
            return {"success": True, "data": doc, "message": "No messages found for today"}

        msg_id = msgs[0]["id"]
        LOGGER.info("Processing message ID: %s", msg_id)
        
        html = get_message_html(service, user_id=user_email, msg_id=msg_id) or ""
        
        LOGGER.info("Message ID: %s", msg_id)
        LOGGER.info("Email body length: %s characters", len(html))
        if html:
            # Show a preview for debugging parser input shape
            preview = html[:1000].replace('\n', '\\n').replace('\r', '\\r')
            LOGGER.info("Email preview (first 1000 chars): %s", preview)
            
            # Diagnostic only: parser is plain-text based and does not require HTML tables.
            if '<table' in html.lower():
                LOGGER.info("Input includes <table> markup, but plain-text row parser will still be used")
            else:
                LOGGER.info("No <table> markup detected; expected for this email format")
                
            if 'class' in html.lower() and 'section' in html.lower():
                LOGGER.info("Input contains 'class' and 'section' keywords")
            else:
                LOGGER.warning("Input missing expected 'class' or 'section' keywords")
        else:
            LOGGER.warning("Email body is empty")

        LOGGER.info("Parsing email body with semester filters: %s", allowed_semesters)
        LOGGER.info("Using plain-text timetable parser")
        
        # Save HTML to file for debugging purposes
        debug_html_path = "debug_email.html"
        try:
            with open(debug_html_path, 'w', encoding='utf-8') as f:
                f.write(html)
            LOGGER.info("Saved debug email body to %s", debug_html_path)
            LOGGER.debug('scrape_status removed: skipping "saved_debug_html" status update')
        except Exception as e:
            LOGGER.warning("Could not save debug email body: %s", e)
        
        # Parse using the plain-text row parser
        LOGGER.debug('scrape_status removed: skipping "parsing" status update')

        items = parse_html_with_advanced_pandas(html, allowed_semesters)
        if items:
            LOGGER.info("Parser success: %s schedule items extracted", len(items))
            LOGGER.debug('scrape_status removed: skipping "parsed" status update')
        else:
            LOGGER.warning("Parser returned no schedule items")
            items = []  # No fallback parsers

        LOGGER.debug('scrape_status removed: skipping duplicate "parsed" status update')
        
        LOGGER.info("Parsing complete")
        
        # Log first few parsed items for quick verification
        for i, item in enumerate(items[:2]):
            LOGGER.info(
                "Sample item %s: semester=%s course=%s faculty=%s room=%s time=%s",
                i + 1,
                item.get('semester'),
                item.get('course'),
                item.get('faculty'),
                item.get('room'),
                item.get('time'),
            )
        LOGGER.info("Parsed %s schedule items", len(items))

        # Create summary statistics
        semester_counts = {}
        for item in items:
            sem = item.get('semester', 'Unknown')
            semester_counts[sem] = semester_counts.get(sem, 0) + 1

        doc = {
            "for_day": for_day_name,
            "for_date": target_date.date().isoformat(),
            "query": query,
            "message_id": msg_id,
            "items": items,
            "semesters": allowed_semesters,
            "summary": {
                "total_items": len(items),
                "semester_breakdown": semester_counts,
                "unique_courses": len(set(item.get('course') for item in items if item.get('course'))),
                "unique_faculty": len(set(item.get('faculty') for item in items if item.get('faculty'))),
            }
        }
        
        # Save to Supabase instead of local file
        from database.supabase_client import supabase_manager
        saved = supabase_manager.save_timetable_cache(user_id, doc)
        LOGGER.info("Saved parsed schedule to Supabase for user %s", user_id)
        LOGGER.debug('scrape_status removed: skipping "saved" status update')
        
        # Log summary
        summary = doc.get("summary", {})
        LOGGER.info(f"Summary: {summary['total_items']} total items found")
        if summary.get("semester_breakdown"):
            for sem, count in summary["semester_breakdown"].items():
                LOGGER.info(f"  • {sem}: {count} classes")
        LOGGER.info(f"  • {summary['unique_courses']} unique courses, {summary['unique_faculty']} faculty members")
        
        # Display table if requested
        if show_table:
            try:
                from utils.table_formatter import format_schedule_data
                print()  # Add some spacing
                # Pass the doc data directly since we're not saving to file anymore
                format_schedule_data(doc)
            except ImportError as imp_err:
                LOGGER.warning(f"Could not import table formatter: {imp_err}")
            except Exception as table_err:
                LOGGER.warning(f"Error displaying table: {table_err}")
        
        return {"success": True, "data": doc, "message": f"Successfully found {len(items)} items"}
    
    except Exception as e:
        import traceback
        error_details = traceback.format_exc()
        LOGGER.error(f"Error in run_once: {e}")
        LOGGER.error(f"Full traceback: {error_details}")
        LOGGER.debug('scrape_status removed: skipping "error" status update')
        return {"success": False, "error": str(e), "traceback": error_details}

def start_scheduler(user_id: str, user_settings: dict = None) -> BackgroundScheduler:
    """Start the scheduler for a specific user with their settings"""
    from .config import settings
    
    # Use user-specific settings if provided, otherwise fall back to defaults
    effective_settings = user_settings if user_settings else settings
    
    local_tz = tz.gettz(effective_settings.get('tz', settings.tz))
    scheduler = BackgroundScheduler(timezone=local_tz)

    trigger = CronTrigger(
        hour=effective_settings.get('check_hour_local', settings.check_hour_local),
        minute=effective_settings.get('check_minute_local', settings.check_minute_local),
        timezone=local_tz,
    )

    scheduler.add_job(
        func=run_once,
        trigger=trigger,
        id=f"nightly_scrape_{user_id}",
        max_instances=1,
        replace_existing=True,
        kwargs={"user_id": user_id, "user_settings": user_settings},
    )

    scheduler.start()
    LOGGER.info(
        "Scheduler started for user %s. Will run nightly at %02d:%02d (%s).",
        user_id,
        effective_settings.get('check_hour_local', settings.check_hour_local),
        effective_settings.get('check_minute_local', settings.check_minute_local),
        effective_settings.get('tz', settings.tz),
    )
    return scheduler
