"""
Supabase client configuration and database operations.
Handles multi-user authentication and data storage.
"""

import os
import json
from typing import Dict, List, Optional, Any
from datetime import datetime, timedelta
from supabase import create_client, Client
import logging

logger = logging.getLogger(__name__)

class SupabaseManager:
    def __init__(self):
        self.url = os.getenv('SUPABASE_URL')
        self.key = os.getenv('SUPABASE_SERVICE_KEY')  # Use service key for backend operations
        
        if not self.url or not self.key:
            raise ValueError("SUPABASE_URL and SUPABASE_SERVICE_KEY must be set in environment")
            
        self.client: Client = create_client(self.url, self.key)
        logger.debug("Supabase client initialized")

    def get_or_create_user(self, email: str) -> Dict:
        """Get existing user or create new one by email"""
        try:
            # Check if user exists
            result = self.client.table('users').select('*').eq('email', email).execute()
            
            if result.data:
                logger.info(f"Found existing user: {email}")
                return result.data[0]
            
            # Create new user
            new_user = {'email': email}
            result = self.client.table('users').insert(new_user).execute()
            logger.info(f"Created new user: {email}")
            return result.data[0]
            
        except Exception as e:
            logger.error(f"Error managing user {email}: {e}")
            raise

    def save_user_tokens(self, user_id: str, token_data: Dict) -> bool:
        """Save Gmail tokens for a user"""
        try:
            # Delete existing tokens for this user
            self.client.table('tokens').delete().eq('user_id', user_id).execute()
            
            # Insert new tokens
            token_record = {
                'user_id': user_id,
                'token_data': token_data
            }
            result = self.client.table('tokens').insert(token_record).execute()
            logger.info(f"Saved tokens for user {user_id}")
            return True
            
        except Exception as e:
            logger.error(f"Error saving tokens for user {user_id}: {e}")
            return False

    def get_user_tokens(self, user_id: str) -> Optional[Dict]:
        """Get Gmail tokens for a user"""
        try:
            result = self.client.table('tokens').select('token_data').eq('user_id', user_id).execute()
            
            if result.data:
                return result.data[0]['token_data']
            return None
            
        except Exception as e:
            logger.error(f"Error getting tokens for user {user_id}: {e}")
            return None

    def save_timetable_cache(self, user_id: str, cache_data: Dict) -> bool:
        """Save timetable cache for a user"""
        try:
            # Clean old cache first (older than 7 days)
            week_ago = (datetime.now() - timedelta(days=7)).isoformat()
            self.client.table('timetable_cache').delete().lt('created_at', week_ago).execute()
            
            # Insert new cache
            cache_record = {
                'user_id': user_id,
                'cache_data': cache_data
            }
            result = self.client.table('timetable_cache').insert(cache_record).execute()
            logger.info(f"Saved timetable cache for user {user_id}")
            return True
            
        except Exception as e:
            logger.error(f"Error saving cache for user {user_id}: {e}")
            return False

    def get_latest_timetable_cache(self, user_id: str) -> Optional[Dict]:
        """Get latest timetable cache for a user"""
        try:
            result = self.client.table('timetable_cache').select('cache_data').eq('user_id', user_id).order('created_at', desc=True).limit(1).execute()
            
            if result.data:
                return result.data[0]['cache_data']
            return None
            
        except Exception as e:
            logger.error(f"Error getting cache for user {user_id}: {e}")
            return None

    def clear_user_cache(self, user_id: str) -> bool:
        """Clear all timetable cache for a specific user"""
        try:
            result = self.client.table('timetable_cache').delete().eq('user_id', user_id).execute()
            logger.info(f"Cleared timetable cache for user {user_id}")
            return True
            
        except Exception as e:
            logger.error(f"Error clearing cache for user {user_id}: {e}")
            return False

    def get_latest_timetable_timestamp(self, user_id: str = None) -> Optional[str]:
        """Get the timestamp of the most recent timetable entry"""
        try:
            query = self.client.table('timetable_cache').select('created_at').order('created_at', desc=True).limit(1)
            
            # If user_id is provided, filter by user, otherwise get global latest
            if user_id:
                query = query.eq('user_id', user_id)
                
            result = query.execute()
            
            if result.data:
                return result.data[0]['created_at']
            return None
            
        except Exception as e:
            logger.error(f"Error getting latest timestamp: {e}")
            return None

    def save_user_settings(self, user_id: str, settings: Dict) -> bool:
        """Save user settings (semester filters, etc.)"""
        try:
            # Check if settings exist
            result = self.client.table('user_settings').select('id').eq('user_id', user_id).execute()
            
            settings_record = {
                'user_id': user_id,
                'settings': settings,
                'updated_at': datetime.now().isoformat()
            }
            
            if result.data:
                # Update existing
                self.client.table('user_settings').update(settings_record).eq('user_id', user_id).execute()
            else:
                # Insert new
                self.client.table('user_settings').insert(settings_record).execute()
                
            logger.info(f"Saved settings for user {user_id}")
            return True
            
        except Exception as e:
            logger.error(f"Error saving settings for user {user_id}: {e}")
            return False

    def get_user_settings(self, user_id: str) -> Dict:
        """Get user settings"""
        try:
            result = self.client.table('user_settings').select('settings').eq('user_id', user_id).execute()
            
            if result.data:
                return result.data[0]['settings']
            
            # Return default settings
            default_settings = {
                'allowed_semesters': ['BS (SE) - 5C'],
                'gmail_query_base': 'subject:("Class Schedule" OR schedule) in:inbox',
                'newer_than_days': 2,
                'timezone': 'Asia/Karachi'
            }
            return default_settings
            
        except Exception as e:
            logger.error(f"Error getting settings for user {user_id}: {e}")
            return {}

    def cleanup_old_cache(self) -> bool:
        """Clean up cache older than 7 days"""
        try:
            week_ago = (datetime.now() - timedelta(days=7)).isoformat()
            result = self.client.table('timetable_cache').delete().lt('created_at', week_ago).execute()
            logger.info(f"Cleaned up old cache entries")
            return True
            
        except Exception as e:
            logger.error(f"Error cleaning up cache: {e}")
            return False

# Global instance
supabase_manager = SupabaseManager()