import os
import sys

sys.path.append(os.path.join(os.path.dirname(__file__), '..'))

from scraper.timetable_parser import parse_html_with_advanced_pandas


def test_parser_avoids_department_noise_in_semester_display():
    email_body = (
        '20 Computer Sciences BSCS BCS/BS 8C CSC 4201 Information Security (3,0) '
        'Muhammad Taseer ul Islam 201 08:00 PM - 09:30 PM SZABIST University H-8/4 ISB Campus'
    )

    items = parse_html_with_advanced_pandas(email_body)
    assert len(items) == 1

    item = items[0]
    assert item['semester_display'] == 'BCS/BS 8C'
    assert item['course_title'] == 'Information Security'
    assert item['faculty'] == 'Muhammad Taseer ul Islam'
    assert item['room'] == '201'


def test_parser_extracts_meeting_room_and_keeps_faculty_clean():
    email_body = (
        '58 Management Sciences PhDMS PhD-1 MS 6325 Seminars in Finance '
        'Dr. Shumaila Zeb Meeting Room Admin Block '
        '05:00 PM - 08:00 PM SZABIST University H-8/4 ISB Campus'
    )

    items = parse_html_with_advanced_pandas(email_body)
    assert len(items) == 1

    item = items[0]
    assert item['semester_display'] == 'PhD-1'
    assert item['course_title'] == 'Seminars in Finance'
    assert item['faculty'] == 'Dr. Shumaila Zeb'
    assert item['room'] == 'Meeting Room Admin Block'


def test_parser_extracts_psy_lab_room():
    email_body = (
        '59 Social Sciences MS - CPY MS - CPY Open CLP 5103 Quantitative Research Methods (3,0) '
        'Maria Rafique Psy Lab 05:00 PM - 08:00 PM SZABIST University H-8/4 ISB Campus'
    )

    items = parse_html_with_advanced_pandas(email_body)
    assert len(items) == 1

    item = items[0]
    assert item['semester_display'] == 'MS - CPY Open'
    assert item['faculty'] == 'Maria Rafique'
    assert item['room'] == 'Psy Lab'


def test_parser_handles_tuesday_time_without_meridiem():
    email_body = (
        '23\tComputer Sciences\tBSCS\tBSCS 5 A\tCSC 1215 Teachings of Holy Quran (0,0)\tMuhammad Hassaan Raza\tONLINE\t10:00 - 11:00\tSZABIST University\nH-8/4 ISB Campus'
    )

    items = parse_html_with_advanced_pandas(email_body)
    assert len(items) == 1
    item = items[0]
    assert item['semester_display'] == 'BSCS 5 A'
    assert item['room'] == 'ONLINE'
    assert item['time'] == '10:00 - 11:00'


def test_parser_handles_cancelled_room_with_date_line():
    email_body = (
        '37\tSocial Sciences\tBSSS\tBSSS 2\tSS 1216 Intro to International Relations\tGulrukhsar Mujahid -\tCancelled\n30-04-2026\t08:00 AM - 11:00 AM\tSZABIST University\nH-8/4 ISB Campus'
    )

    items = parse_html_with_advanced_pandas(email_body)
    assert len(items) == 1
    item = items[0]
    assert item['semester_display'] == 'BSSS 2'
    assert item['room'].lower().startswith('cancelled')
    assert item['faculty'] == 'Gulrukhsar Mujahid'


def test_parser_handles_meeting_room_numbered_admin_block():
    email_body = (
        '49\tManagement Sciences\tPhDMS\tPhD-1\tMS 6432 Strategic Entrepreneurial Marketing\tDr. Fahim A Khan\tMeeting Room 1\nAdmin Block\t06:30 PM - 09:30 PM\tSZABIST University\nH-8/4 ISB Campus'
    )

    items = parse_html_with_advanced_pandas(email_body)
    assert len(items) == 1
    item = items[0]
    assert item['semester_display'] == 'PhD-1'
    assert item['faculty'] == 'Dr. Fahim A Khan'
    assert item['room'] == 'Meeting Room 1 Admin Block'


def test_parser_handles_conference_room_and_trailing_course_suffix():
    email_body = (
        '19\tManagement Sciences\tMSBA /MSMS\tMSMS /MSBA\tPerformance Management\tDr. Faisal Malik\tConference Room\t11:10 AM - 02:10 PM\tSZABIST University\nH-8/4 ISB Campus\n'
        '45\tMedia Sciences\tBS Media\tBS Media 4 B\tMD 2428 Introduction to Advertising Strategy (3,0) B\tDr. Naila\t208\t02:20 PM - 05:20 PM\tSZABIST University\nH-8/4 ISB Campus'
    )

    items = parse_html_with_advanced_pandas(email_body)
    assert len(items) == 2
    by_row = {item['row_number']: item for item in items}

    assert by_row[19]['room'] == 'Conference Room'
    assert by_row[19]['faculty'] == 'Dr. Faisal Malik'
    assert by_row[45]['course_title'] == 'Introduction to Advertising Strategy'
