import os
import sys

sys.path.append(os.path.join(os.path.dirname(__file__), '..'))

from scraper.timetable_parser import parse_html_with_advanced_pandas


def _build_table_row(cells):
    return "<tr>" + "".join(f"<td>{c}</td>" for c in cells) + "</tr>"


def _sample_social_sciences_html():
    # Minimal HTML table matching the expected 8 columns: dept, program, section, course,
    # faculty, room, time, campus
    rows = []
    header = ["Sr No", "Department", "Program", "Section", "Course", "Faculty", "Room", "Time", "Campus"]
    rows.append("<tr>" + "".join(f"<th>{h}</th>" for h in header) + "</tr>")

    # Row where section contains a slash-separated pair
    rows.append(_build_table_row([
        "1",
        "Social Sciences",
        "BSSS & BS PSY",
        "BSSS 1 / BS Psychology 1",
        "SS 1201 Introduction to Social Sciences",
        "Abdul Hanan Sami",
        "204",
        "08:00 AM - 11:00 AM",
        "SZABIST University",
    ]))

    # Another row for BSSS 2 / BS Psychology 2
    rows.append(_build_table_row([
        "2",
        "Social Sciences",
        "BSSS & BS PSY",
        "BSSS 2 / BS Psychology 2",
        "SS 2413 Philosophy",
        "Dr. Muhammad Abo-Ul-Hassan Rashid",
        "Auditorium",
        "11:10 AM - 02:10 PM",
        "SZABIST University",
    ]))

    html = f"<html><body><table>{''.join(rows)}</table></body></html>"
    return html


def test_social_sciences_slash_expansion_no_filter():
    html = _sample_social_sciences_html()
    items = parse_html_with_advanced_pandas(html)
    # Expect expansion: each slash-separated section should produce separate items
    semesters = {it.get("semester_display") for it in items}
    assert any("BSSS 1" in s for s in semesters)
    assert any("BS Psychology 1" in s for s in semesters)
    assert any("BSSS 2" in s for s in semesters)
    assert any("BS Psychology 2" in s for s in semesters)


def test_social_sciences_filter_bsss1():
    html = _sample_social_sciences_html()
    items = parse_html_with_advanced_pandas(html, allowed_semesters=["BSSS 1"])
    assert len(items) >= 1
    assert any((it.get("semester_display") and "BSSS 1" in it.get("semester_display")) for it in items)


def test_social_sciences_filter_bspy1():
    html = _sample_social_sciences_html()
    items = parse_html_with_advanced_pandas(html, allowed_semesters=["BS Psychology 1"])
    assert len(items) >= 1
    assert any((it.get("semester_display") and "BS Psychology 1" in it.get("semester_display")) for it in items)
