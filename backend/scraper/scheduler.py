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
    LOGGER.info("🔥🔥🔥 RUN_ONCE CALLED! 🔥🔥🔥")
    LOGGER.info(f"User: {user_email}, ID: {user_id}")
    LOGGER.info(f"Settings: {user_settings}")
    LOGGER.info("🔥🔥🔥 RUN_ONCE CALLED! 🔥🔥🔥")
    # Import here to ensure config is loaded first
    from .config import settings
    
    try:
        # Use user settings if provided, otherwise use global settings
        LOGGER.info(f"User settings received: {user_settings}")
        LOGGER.info(f"Global settings allowed_semesters: {settings.allowed_semesters}")
        
        allowed_semesters = user_settings.get('allowed_semesters', settings.allowed_semesters) if user_settings else settings.allowed_semesters
        gmail_query_base = user_settings.get('gmail_query_base', settings.gmail_query_base) if user_settings else settings.gmail_query_base
        newer_than_days = user_settings.get('newer_than_days', settings.newer_than_days) if user_settings else settings.newer_than_days
        timezone = user_settings.get('timezone', settings.tz) if user_settings else settings.tz
        next_day_available_hour = user_settings.get('next_day_available_hour', settings.next_day_available_hour) if user_settings else settings.next_day_available_hour
        
        LOGGER.info(f"Final allowed_semesters being used: {allowed_semesters}")
        
        local_tz = tz.gettz(timezone)
        now_local = datetime.now(tz=local_tz)
        for_day_name = _target_day_name(now_local, next_day_available_hour)
        target_date = _target_date(now_local, next_day_available_hour)

        query = _build_query(gmail_query_base, for_day_name, newer_than_days)

        LOGGER.info("Looking for: %s  (local: %s)", for_day_name, now_local.strftime("%Y-%m-%d %H:%M"))
        LOGGER.info("Gmail query: %s", query)

        # Use user-specific tokens if available
        LOGGER.info(f"Attempting to load Gmail credentials for user: {user_id if user_id else 'default'}")
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
        LOGGER.info(f"Found {len(msgs) if msgs else 0} messages matching query")
        
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
        LOGGER.info(f"Processing message ID: {msg_id}")
        
        html = get_message_html(service, user_id=user_email, msg_id=msg_id) or ""
        
        LOGGER.info(f"Message ID: {msg_id}")
        LOGGER.info(f"HTML length: {len(html)} characters")
        if html:
            # Show a preview of the HTML to see if it contains table data
            preview = html[:1000].replace('\n', '\\n').replace('\r', '\\r')
            LOGGER.info(f"HTML preview (first 1000 chars): {preview}")
            
            # Check if HTML contains table-related keywords
            if '<table' in html.lower():
                LOGGER.info("✅ HTML contains <table> elements")
            else:
                LOGGER.warning("❌ HTML does NOT contain <table> elements")
                
            if 'class' in html.lower() and 'section' in html.lower():
                LOGGER.info("✅ HTML contains 'class' and 'section' keywords")
            else:
                LOGGER.warning("❌ HTML missing 'class' or 'section' keywords")
        else:
            LOGGER.warning("HTML content is empty or None")

        LOGGER.info(f"Parsing HTML with semester filters: {allowed_semesters}")
        LOGGER.info("Using timetable_parser as the only parser")
        
        # Save HTML to file for debugging purposes
        debug_html_path = "debug_email.html"
        try:
            with open(debug_html_path, 'w', encoding='utf-8') as f:
                f.write(html)
            LOGGER.info(f"💾 DEBUG: Saved HTML to {debug_html_path}")
        except Exception as e:
            LOGGER.warning(f"Could not save debug HTML: {e}")
        
        items = parse_html_with_advanced_pandas(html, allowed_semesters)
        LOGGER.info(f"timetable_parser returned {len(items)} schedule items")
        
        # Log first few items to verify parser extraction
        for i, item in enumerate(items[:2]):
            LOGGER.info(f"  Item {i+1}: course='{item.get('course')}', title='{item.get('course_title')}', faculty='{item.get('faculty')}', room='{item.get('room')}'")
            LOGGER.info(f"  Raw: {item.get('raw_cells', [])[:4]}")  # Show first 4 cells
        LOGGER.info(f"Parsed {len(items)} schedule items with enhanced validation")

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
