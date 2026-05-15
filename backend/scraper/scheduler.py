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
        tomorrow = now_local + timedelta(days=1)
        return WEEKDAY_NAMES[tomorrow.weekday()]
    else:
        return WEEKDAY_NAMES[now_local.weekday()]

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
    from .config import settings
    
    try:
        allowed_semesters = user_settings.get('allowed_semesters', settings.allowed_semesters) if user_settings else settings.allowed_semesters
        gmail_query_base = user_settings.get('gmail_query_base', settings.gmail_query_base) if user_settings else settings.gmail_query_base
        newer_than_days = user_settings.get('newer_than_days', settings.newer_than_days) if user_settings else settings.newer_than_days
        timezone = user_settings.get('timezone', settings.tz) if user_settings else settings.tz
        next_day_available_hour = user_settings.get('next_day_available_hour', settings.next_day_available_hour) if user_settings else settings.next_day_available_hour
        
        local_tz = tz.gettz(timezone)
        now_local = datetime.now(tz=local_tz)
        for_day_name = _target_day_name(now_local, next_day_available_hour)
        target_date = _target_date(now_local, next_day_available_hour)

        query = _build_query(gmail_query_base, for_day_name, newer_than_days)

        LOGGER.info("Looking for: %s  (local: %s)", for_day_name, now_local.strftime("%Y-%m-%d %H:%M"))
        LOGGER.info("Gmail query: %s", query)

        if user_id:
            try:
                from database.supabase_client import supabase_manager
                token_data = supabase_manager.get_user_tokens(user_id)
                if token_data:
                    from google.oauth2.credentials import Credentials
                    
                    expiry = None
                    if token_data.get('expiry'):
                        try:
                            expiry = datetime.fromisoformat(token_data['expiry'].replace('Z', '+00:00'))
                        except Exception:
                            expiry = None
                    
                    creds = Credentials(
                        token=token_data.get('token'),
                        refresh_token=token_data.get('refresh_token'),
                        token_uri=token_data.get('token_uri'),
                        client_id=token_data.get('client_id'),
                        client_secret=token_data.get('client_secret'),
                        scopes=token_data.get('scopes'),
                        expiry=expiry
                    )
                else:
                    creds = get_credentials()
            except Exception:
                creds = get_credentials()
        else:
            creds = get_credentials()

        service = build_service(creds)
        msgs = list_messages(service, user_id=user_email, query=query, max_results=5)
        
        if not msgs:
            LOGGER.warning("No messages found for target date")
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
        html = get_message_html(service, user_id=user_email, msg_id=msg_id) or ""
        
        items = parse_html_with_advanced_pandas(html, allowed_semesters)

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
        
        from database.supabase_client import supabase_manager
        supabase_manager.save_timetable_cache(user_id, doc)
        
        summary = doc.get("summary", {})
        LOGGER.info(f"Successfully parsed {summary['total_items']} items for date {target_date.date()}")
        
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
        LOGGER.error(f"Scraper error: {e}", exc_info=True)
        return {"success": False, "error": str(e)}

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
