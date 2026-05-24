import os
import smtplib
from email.message import EmailMessage
from typing import Dict, List


def _smtp_settings() -> Dict[str, object]:
    return {
        'host': os.environ.get('SMTP_HOST', 'smtp-mail.outlook.com'),
        'port': int(os.environ.get('SMTP_PORT', '587')),
        'username': os.environ.get('SMTP_USERNAME', ''),
        'password': os.environ.get('SMTP_PASSWORD', ''),
        'from_name': os.environ.get('SMTP_FROM_NAME', 'Inbox2Table'),
    }


def _escape(value: object) -> str:
    text = '' if value is None else str(value)
    return (
        text.replace('&', '&amp;')
        .replace('<', '&lt;')
        .replace('>', '&gt;')
        .replace('"', '&quot;')
    )


def _display(value: object, fallback: str = '-') -> str:
    text = str(value or '').strip()
    return text if text else fallback


def _build_plain_text(timetable: Dict) -> str:
    items: List[Dict] = timetable.get('items') or []
    lines = [
        f"Inbox2Table schedule for {timetable.get('for_day', 'today')} ({timetable.get('for_date', '')})",
        '',
    ]

    if not items:
        lines.append('No classes were found for the configured semesters.')
        return '\n'.join(lines)

    for item in items:
        lines.append(
            f"{_display(item.get('semester_display') or item.get('semester'))} | "
            f"{_display(item.get('course_title') or item.get('course'))} | "
            f"{_display(item.get('faculty'))} | "
            f"{_display(item.get('room'))} | "
            f"{_display(item.get('time'))} | "
            f"{_display(item.get('campus'))}"
        )

    return '\n'.join(lines)


def _group_items_by_semester(items: List[Dict]) -> Dict[str, List[Dict]]:
    grouped: Dict[str, List[Dict]] = {}
    for item in items:
        semester = _display(
            item.get('semester_display') or item.get('class_section') or item.get('semester'),
            'Unassigned',
        )
        grouped.setdefault(semester, []).append(item)
    return grouped


def build_timetable_email_html(timetable: Dict, university_email: str) -> str:
    items: List[Dict] = timetable.get('items') or []
    summary = timetable.get('summary') or {}
    grouped = _group_items_by_semester(items)
    for semester_items in grouped.values():
        semester_items.sort(key=lambda item: _display(item.get('time')))

    rows_html = []
    if not items:
        rows_html.append(
            """
            <tr>
              <td colspan="5" style="padding:18px;color:#64748b;text-align:center;">
                No classes were found for your configured semesters.
              </td>
            </tr>
            """
        )
    else:
        for semester, semester_items in grouped.items():
            rows_html.append(
                f"""
                <tr>
                  <td colspan="5" style="padding:12px 14px;background:#f8fafc;border-top:1px solid #e2e8f0;border-bottom:1px solid #e2e8f0;color:#0f172a;font-weight:700;">
                    {_escape(semester)} · {len(semester_items)} class{'es' if len(semester_items) != 1 else ''}
                  </td>
                </tr>
                """
            )
            for item in semester_items:
                course = _display(item.get('course_title') or item.get('course'))
                course_code = _display(item.get('course_code') or item.get('course'), '')
                faculty = _display(item.get('faculty') or item.get('faculty_name'), 'TBD')
                room = _display(item.get('room'), 'TBD')
                time = _display(item.get('time'))
                campus = _display(item.get('campus'))
                cancelled = 'cancelled' in ' '.join([course, faculty, room, time, campus]).lower()
                accent = '#dc2626' if cancelled else '#0f172a'

                rows_html.append(
                    f"""
                    <tr>
                      <td style="padding:12px 14px;border-bottom:1px solid #e5e7eb;color:{accent};">
                        <div style="font-weight:700;">{_escape(course)}</div>
                        <div style="margin-top:3px;color:#64748b;font-size:12px;">{_escape(course_code)}</div>
                      </td>
                      <td style="padding:12px 14px;border-bottom:1px solid #e5e7eb;color:#334155;">{_escape(faculty)}</td>
                      <td style="padding:12px 14px;border-bottom:1px solid #e5e7eb;color:#334155;">{_escape(room)}</td>
                      <td style="padding:12px 14px;border-bottom:1px solid #e5e7eb;color:#334155;white-space:nowrap;">{_escape(time)}</td>
                      <td style="padding:12px 14px;border-bottom:1px solid #e5e7eb;color:#334155;">{_escape(campus)}</td>
                    </tr>
                    """
                )

    return f"""
    <!doctype html>
    <html>
      <body style="margin:0;padding:0;background:#f1f5f9;font-family:Arial,Helvetica,sans-serif;color:#0f172a;">
        <div style="max-width:920px;margin:0 auto;padding:28px 14px;">
          <div style="background:#ffffff;border:1px solid #e2e8f0;border-radius:18px;overflow:hidden;box-shadow:0 18px 42px rgba(15,23,42,0.08);">
            <div style="padding:24px;background:#0f172a;color:#ffffff;">
              <div style="font-size:12px;letter-spacing:0.12em;text-transform:uppercase;color:#cbd5e1;">Inbox2Table</div>
              <h1 style="margin:8px 0 0;font-size:24px;line-height:1.2;">Your timetable for {_escape(timetable.get('for_day', 'today'))}</h1>
              <p style="margin:8px 0 0;color:#cbd5e1;font-size:14px;">Generated for {_escape(university_email)} · {_escape(timetable.get('for_date', ''))}</p>
            </div>

            <div style="display:flex;gap:10px;flex-wrap:wrap;padding:16px 20px;background:#f8fafc;border-bottom:1px solid #e2e8f0;">
              <span style="padding:8px 10px;border-radius:999px;background:#ffffff;border:1px solid #e2e8f0;font-size:13px;"><strong>{_escape(summary.get('total_items', len(items)))}</strong> classes</span>
              <span style="padding:8px 10px;border-radius:999px;background:#ffffff;border:1px solid #e2e8f0;font-size:13px;"><strong>{_escape(summary.get('unique_courses', 0))}</strong> unique courses</span>
              <span style="padding:8px 10px;border-radius:999px;background:#ffffff;border:1px solid #e2e8f0;font-size:13px;"><strong>{_escape(summary.get('unique_faculty', 0))}</strong> faculty</span>
            </div>

            <div style="overflow-x:auto;">
              <table role="presentation" cellspacing="0" cellpadding="0" style="width:100%;border-collapse:collapse;font-size:14px;">
                <thead>
                  <tr style="background:#ffffff;">
                    <th align="left" style="padding:13px 14px;border-bottom:1px solid #e2e8f0;color:#64748b;font-size:11px;text-transform:uppercase;letter-spacing:0.08em;">Course</th>
                    <th align="left" style="padding:13px 14px;border-bottom:1px solid #e2e8f0;color:#64748b;font-size:11px;text-transform:uppercase;letter-spacing:0.08em;">Faculty</th>
                    <th align="left" style="padding:13px 14px;border-bottom:1px solid #e2e8f0;color:#64748b;font-size:11px;text-transform:uppercase;letter-spacing:0.08em;">Room</th>
                    <th align="left" style="padding:13px 14px;border-bottom:1px solid #e2e8f0;color:#64748b;font-size:11px;text-transform:uppercase;letter-spacing:0.08em;">Time</th>
                    <th align="left" style="padding:13px 14px;border-bottom:1px solid #e2e8f0;color:#64748b;font-size:11px;text-transform:uppercase;letter-spacing:0.08em;">Campus</th>
                  </tr>
                </thead>
                <tbody>
                  {''.join(rows_html)}
                </tbody>
              </table>
            </div>

            <div style="padding:16px 20px;color:#64748b;font-size:12px;background:#ffffff;">
              This automated email was sent because daily delivery is enabled in Inbox2Table.
            </div>
          </div>
        </div>
      </body>
    </html>
    """


def send_timetable_email(to_email: str, university_email: str, timetable: Dict) -> None:
    smtp = _smtp_settings()
    username = str(smtp['username'])
    password = str(smtp['password'])

    if not username or not password:
        raise RuntimeError('SMTP_USERNAME and SMTP_PASSWORD must be configured')

    subject = f"Inbox2Table: timetable for {timetable.get('for_day', 'today')}"

    msg = EmailMessage()
    msg['Subject'] = subject
    msg['From'] = f"{smtp['from_name']} <{username}>"
    msg['To'] = to_email
    msg.set_content(_build_plain_text(timetable))
    msg.add_alternative(build_timetable_email_html(timetable, university_email), subtype='html')

    with smtplib.SMTP(str(smtp['host']), int(smtp['port']), timeout=30) as server:
        server.ehlo()
        server.starttls()
        server.ehlo()
        server.login(username, password)
        server.send_message(msg)
