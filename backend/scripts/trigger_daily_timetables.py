import json
import os
import sys

import requests


def main() -> int:
    backend_url = os.environ.get('PUBLIC_BACKEND_URL', '').rstrip('/')
    automation_secret = os.environ.get('AUTOMATION_SECRET', '')

    if not backend_url:
        print(json.dumps({
            'success': False,
            'error': 'PUBLIC_BACKEND_URL must be configured',
        }, indent=2))
        return 1

    if not automation_secret:
        print(json.dumps({
            'success': False,
            'error': 'AUTOMATION_SECRET must be configured',
        }, indent=2))
        return 1

    response = requests.post(
        f'{backend_url}/api/automation/send-daily-timetables',
        headers={'Authorization': f'Bearer {automation_secret}'},
        timeout=120,
    )

    try:
        payload = response.json()
    except ValueError:
        payload = {'success': False, 'response_text': response.text}

    print(json.dumps({
        'status_code': response.status_code,
        **payload,
    }, indent=2))

    return 0 if response.status_code < 400 and payload.get('success') else 1


if __name__ == '__main__':
    sys.exit(main())
