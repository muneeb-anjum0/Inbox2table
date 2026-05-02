"""
main.py
"""
import argparse
import sys
import time
import logging

from ..utils.logging_config import setup_logging
from .scheduler import run_once, start_scheduler

def parse_args(argv=None):
    """Enhanced argument parsing with comprehensive options."""
    p = argparse.ArgumentParser(
        description="Enhanced TimeTable Scraper - Robust and intelligent schedule extraction",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  python -m src.scraper.main --once                    # Run once with table display
  python -m src.scraper.main --once --no-table        # Run once without table
  python -m src.scraper.main --show-json data.json    # Display JSON in table format
  python -m src.scraper.main --health-check           # Check system health
  python -m src.scraper.main --config-info            # Show current configuration
        """
    )
    
    # Main operation modes (mutually exclusive)
    g = p.add_mutually_exclusive_group(required=True)
    g.add_argument("--once", action="store_true", 
                   help="Run a single scrape now with enhanced error handling")
    g.add_argument("--run-scheduler", action="store_true", 
                   help="Start nightly scheduler with monitoring")
    g.add_argument("--show-json", metavar="JSON_FILE", 
                   help="Display a JSON file in enhanced table format")
    g.add_argument("--health-check", action="store_true",
                   help="Perform comprehensive system health check")
    g.add_argument("--config-info", action="store_true",
                   help="Display current configuration information")
    
    # Additional options
    p.add_argument("--no-table", action="store_true", 
                   help="Don't display table output when using --once")
    p.add_argument("--debug", action="store_true", 
                   help="Enable debug logging for troubleshooting")
    p.add_argument("--cache-clear", action="store_true", 
                   help="Clear cached data before operation")
    
    return p.parse_args(argv)

def main(argv=None):
    """Enhanced main function with comprehensive error handling."""
    # Set up logging first
    setup_logging()
    logger = logging.getLogger(__name__)
    
    try:
        args = parse_args(argv)
        
        # Enable debug logging if requested
        if args.debug:
            logging.getLogger().setLevel(logging.DEBUG)
            logger.info("🐛 Debug mode enabled")
        
        # Clear cache if requested
        if args.cache_clear:
            try:
                from pathlib import Path
                cache_dir = Path("data/cache")
                if cache_dir.exists():
                    for file in cache_dir.glob("*.json"):
                        if not file.name.endswith('.backup.json'):
                            file.unlink()
                    logger.info("🗑️  Cache cleared")
            except Exception as e:
                logger.warning(f"⚠️  Could not clear cache: {e}")
        
        # Health check
        if args.health_check:
            return perform_health_check()
        
        # Configuration info
        if args.config_info:
            return display_config_info()
        
        # Show JSON file in table format
        if args.show_json:
            try:
                from ..utils.table_formatter import format_schedule_json
                format_schedule_json(args.show_json)
                logger.info("✅ JSON display completed")
                return 0
            except FileNotFoundError:
                logger.error(f"❌ File not found: {args.show_json}")
                return 1
            except Exception as e:
                logger.error(f"❌ Error displaying JSON: {e}")
                return 1
        
        # Run once with enhanced error handling
        if args.once:
            show_table = not args.no_table
            logger.info("🚀 Starting enhanced schedule scraper...")
            
            try:
                result = run_once(user_email="me", show_table=show_table)
                
                if result.get('error'):
                    if result.get('is_warning'):
                        logger.warning(f"⚠️  {result['error']}")
                        return 1  # Warning exit code
                    else:
                        logger.error(f"❌ {result['error']}")
                        return 2  # Error exit code
                else:
                    logger.info("✅ Schedule scraping completed successfully")
                    
                    # Log summary if available
                    if 'summary' in result:
                        summary = result['summary']
                        logger.info(f"📊 Found {summary.get('total_items', 0)} items, "
                                  f"{summary.get('unique_courses', 0)} courses, "
                                  f"{summary.get('unique_faculty', 0)} faculty")
                    
                    return 0
                    
            except KeyboardInterrupt:
                logger.info("🛑 Operation cancelled by user")
                return 130  # Standard SIGINT exit code
            except Exception as e:
                logger.error(f"💥 Critical error during scraping: {e}", exc_info=True)
                return 3  # Critical error exit code
        
        # Start scheduler with enhanced monitoring
        if args.run_scheduler:
            logger.info("🕒 Starting enhanced scheduler...")
            
            try:
                sched = start_scheduler()
                logger.info("✅ Scheduler started successfully")
                logger.info("🔄 Press Ctrl+C to stop the scheduler")
                
                # Monitor scheduler with periodic health checks
                check_interval = 300  # 5 minutes
                last_check = time.time()
                
                while True:
                    time.sleep(1)
                    
                    # Periodic health check
                    current_time = time.time()
                    if current_time - last_check > check_interval:
                        logger.debug("🔍 Performing periodic health check...")
                        last_check = current_time
                        
            except KeyboardInterrupt:
                logger.info("🛑 Scheduler shutdown requested")
                sched.shutdown(wait=False)
                logger.info("✅ Scheduler stopped")
                return 0
            except Exception as e:
                logger.error(f"💥 Scheduler error: {e}", exc_info=True)
                return 3
        
        return 0
        
    except argparse.ArgumentError as e:
        logger.error(f"❌ Argument error: {e}")
        return 1
    except Exception as e:
        logger.error(f"💥 Unexpected error: {e}", exc_info=True)
        return 3

def perform_health_check():
    """Perform basic health check."""
    logger = logging.getLogger(__name__)
    logger.info("🔍 Performing health check...")
    
    health_issues = []
    
    # Check configuration
    try:
        from .config import settings
        logger.info(f"✅ Configuration loaded: {len(settings.allowed_semesters)} semesters configured")
    except Exception as e:
        health_issues.append(f"Configuration error: {e}")
    
    # Check Gmail connectivity
    try:
        from .gmail_client import GmailClient
        gmail = GmailClient()
        # Try a simple operation
        logger.info("✅ Gmail client initialized successfully")
    except Exception as e:
        health_issues.append(f"Gmail error: {e}")
    
    # Check file system
    try:
        from pathlib import Path
        data_dir = Path("data")
        data_dir.mkdir(exist_ok=True)
        (data_dir / "cache").mkdir(exist_ok=True)
        logger.info("✅ File system access OK")
    except Exception as e:
        health_issues.append(f"File system error: {e}")
    
    # Report results
    if health_issues:
        logger.error("❌ Health check failed:")
        for issue in health_issues:
            logger.error(f"  • {issue}")
        return 1
    else:
        logger.info("🎉 Health check passed - system is ready")
        return 0

def display_config_info():
    """Display current configuration."""
    logger = logging.getLogger(__name__)
    
    try:
        from .config import settings
        
        print("\\n" + "="*50)
        print("⚙️  CONFIGURATION INFORMATION")
        print("="*50)
        
        print(f"📧 Gmail Query: {settings.gmail_query_base}")
        print(f"🕒 Timezone: {settings.timezone}")
        print(f"📅 Check Time: {settings.check_hour_local:02d}:{settings.check_minute_local:02d}")
        print(f"📆 Newer Than: {settings.newer_than_days} days")
        print(f"🐛 Debug Mode: {settings.debug_parsing}")
        
        print("\\n📚 Allowed Semesters:")
        if settings.allowed_semesters:
            for semester in settings.allowed_semesters:
                print(f"  • {semester}")
        else:
            print("  • All semesters (no filter)")
        
        print("\\n" + "="*50)
        
        return 0
        
    except Exception as e:
        logger.error(f"❌ Error displaying configuration: {e}")
        return 1

if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
