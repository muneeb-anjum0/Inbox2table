import json
import os
import sys

BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)

from utils.daily_email import send_daily_timetable_emails


if __name__ == '__main__':
    result = send_daily_timetable_emails()
    print(json.dumps(result, indent=2))
    sys.exit(0 if result.get('success') else 1)
