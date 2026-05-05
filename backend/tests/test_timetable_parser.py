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


def test_parser_strips_lab_prefix_from_course_titles():
    email_body = (
        '14\tComputer Sciences\tBSCS\tBSCS 2 C\tCSCL 1207 Lab: Digital Logic Design (0,1)\tShehwar Tanveer -\tLab 03\t08:00 AM - 10:00 AM\tSZABIST University\nH-8/4 ISB Campus\n'
        '29\tComputer Sciences\tBSSE\tBSSE Open\tCSCL 2102 Lab: Data Structures and Algorithms (0,1)\tAzhar Kamal -\tLab 01\t08:00 AM - 10:00 AM\tSZABIST University\nH-8/4 ISB Campus\n'
        '31\tRobotics & AI\tBSAI\tBSAI 1 C\tCSCL 1103 Lab: Fundamentals of Programming (0,1)\tAnnas Khalid Khan\tLab 05\t08:00 AM - 10:00 AM\tSZABIST University\nH-8/4 ISB Campus'
    )

    items = parse_html_with_advanced_pandas(email_body)
    assert len(items) == 3
    by_row = {item['row_number']: item for item in items}

    assert by_row[14]['course_title'] == 'Digital Logic Design'
    assert by_row[29]['course_title'] == 'Data Structures and Algorithms'
    assert by_row[31]['course_title'] == 'Fundamentals of Programming'


def test_parser_splits_concatenated_course_code_and_title():
    email_body = (
        '39\tSocial Sciences\tBSSS\tBSSS 2 / BS Psychology 2\tSS 2413Philosphy\tDr. Muhammad Abo-Ul-Hassan Rashid\tAuditorium\t08:00 AM - 11:00 AM\tSZABIST University\nH-8/4 ISB Campus\n'
        '44\tMedia Sciences\tBS Media\tBS Media 4 B\tMD 2318 History of Commercial Art (3,0) B\tMasroor Ahmed\t206\t08:00 AM - 11:00 AM\tSZABIST University\nH-8/4 ISB Campus'
    )

    items = parse_html_with_advanced_pandas(email_body)
    assert len(items) == 2
    by_row = {item['row_number']: item for item in items}

    assert by_row[39]['course_title'] == 'Philosphy'
    assert by_row[39]['course_code'] == 'SS 2413'
    assert by_row[44]['course_title'] == 'History of Commercial Art'


def test_parser_separates_course_title_from_faculty_in_flattened_rows():
    email_body = (
        '33\tSocial Sciences\tBSSS\tBSSS 4 / BS Psychology 4\tSS 2418 Statistical Inferences\tDr. Syed Aziz Rasool\t203\t05:30 PM - 08:30 PM\tSZABIST University\nH-8/4 ISB Campus'
    )

    items = parse_html_with_advanced_pandas(email_body)
    assert len(items) == 1
    item = items[0]
    assert item['semester_display'] == 'BS Psychology 4'
    assert item['course_title'] == 'Statistical Inferences'
    assert item['faculty'] == 'Dr. Syed Aziz Rasool'


def test_parser_normalizes_bs_psychology_variants_to_one_group():
    email_body = (
        '36 Social Sciences BSSS OPEN BSSS / BS Psychology 4 SS 4112 Developmental Psychology Abdul Hanan Sami 301 02:00 PM - 05:00 PM SZABIST University H-8/4 ISB Campus\n'
        '33 Social Sciences BSSS BSSS 4 / BS Psychology 4 SS 2418 Statistical Inferences Dr. Syed Aziz Rasool 203 05:30 PM - 08:30 PM SZABIST University H-8/4 ISB Campus'
    )

    items = parse_html_with_advanced_pandas(email_body)
    assert len(items) == 2
    assert {item['semester_display'] for item in items} == {'BS Psychology 4'}

    by_row = {item['row_number']: item for item in items}
    assert by_row[36]['course_title'] == 'Developmental Psychology'
    assert by_row[36]['faculty'] == 'Abdul Hanan Sami'
    assert by_row[33]['course_title'] == 'Statistical Inferences'
    assert by_row[33]['faculty'] == 'Dr. Syed Aziz Rasool'


def test_parser_handles_tuesday_batch_variants_from_provided_sample():
    email_body = (
        '38\tSocial Sciences\tBSSS & BS PSY\tBSSS 1  /  BS Psychology 1\tSS 1201 Introduction to Social Sciences\tAbdul Hanan Sami\t204\t08:00 AM - 11:00 AM\tSZABIST University\n'
        'H-8/4 ISB Campus\n'
        '39\tSocial Sciences\tBSSS & BS PSY\tBSSS 2 / BS Psychology 2\tSS 2413Philosphy\tDr. Muhammad Abo-Ul-Hassan Rashid\tAuditorium\t08:00 AM - 11:00 AM\tSZABIST University\n'
        'H-8/4 ISB Campus\n'
        '2\tManagement Sciences\tPhDMS\tPhD-1\tMS 6428 Global Marketing Strategies\tDr. Zoya Wajid Satti\tMeeting Room\n'
        'Admin Block\t06:30 PM - 09:30 PM\tSZABIST University\n'
        'H-8/4 ISB Campus\n'
        '44\tMedia Sciences\tBS Media\tBS Media 4 B\tMD 2318 History of Commercial Art (3,0) B\tMasroor Ahmed\t206\t08:00 AM - 11:00 AM\tSZABIST University\n'
        'H-8/4 ISB Campus'
    )

    items = parse_html_with_advanced_pandas(email_body)
    assert len(items) == 4

    by_row = {item['row_number']: item for item in items}

    assert by_row[38]['semester_display'] == 'BS Psychology 1'
    assert by_row[38]['course_title'] == 'Introduction to Social Sciences'

    assert by_row[39]['semester_display'] == 'BS Psychology 2'
    assert by_row[39]['course_code'] == 'SS 2413'
    assert by_row[39]['course_title'] == 'Philosphy'

    assert by_row[2]['semester_display'] == 'PhD-1'
    assert by_row[2]['room'] == 'Meeting Room Admin Block'

    assert by_row[44]['course_title'] == 'History of Commercial Art'


def test_parser_handles_flattened_bsss_open_row_without_swallowing_course_title():
    email_body = (
        '36 Social Sciences BSSS OPEN BSSS Open SS 4211 Psychological Testing Amber Gillani 204 05:30 PM - 08:30 PM SZABIST University H-8/4 ISB Campus'
    )

    items = parse_html_with_advanced_pandas(email_body)
    assert len(items) == 1

    item = items[0]
    assert item['semester_display'] == 'BSSS Open'
    assert item['course'] == 'SS 4211 Psychological Testing'
    assert item['course_title'] == 'Psychological Testing'
    assert item['faculty'] == 'Amber Gillani'
    assert item['room'] == '204'


def test_parser_normalizes_split_semester_variants_listed_by_user():
    email_body = (
        '1\tManagement Sciences\tBS (AF)\tBS (AF) 6 A /\nBS (AF) 4 A\tAF 3503 Business Ethics (3,0)\tDr. Fuwad Bashir Awan\t205\t02:20 PM - 05:20 PM\tSZABIST University\n'
        'H-8/4 ISB Campus\n'
        '2\tManagement Sciences\tBSBA\tBS Media 4 A / 4 B\tMD 1119 Play Analysis (3,0)\tLeyla Zuberi\t206\t11:10 AM - 02:10 PM\tSZABIST University\n'
        'H-8/4 ISB Campus\n'
        '3\tSocial Sciences\tBSSS OPEN\tBSSS 1  /\nBS Psychology 1\tSS 1201 Introduction to Social Sciences\tAbdul Hanan Sami\t204\t08:00 AM - 11:00 AM\tSZABIST University\n'
        'H-8/4 ISB Campus\n'
        '4\tSocial Sciences\tBSSS OPEN\tBSSS 3 /\nBS Psychology3\tSS 2318 Mathematics and Statistics\tDr. Syed Aziz Rasool\t208\t11:10 AM - 02:10 PM\tSZABIST University\n'
        'H-8/4 ISB Campus\n'
        '5\tSocial Sciences\tBSSS OPEN\tBSSS 2 /\nBS Psychology 2\tSS 2413Philosphy\tDr. Muhammad Abo-Ul-Hassan Rashid\tAuditorium\t08:00 AM - 11:00 AM\tSZABIST University\n'
        'H-8/4 ISB Campus\n'
        '6\tSocial Sciences\tBS (Psychology)\tBS (Psychology) 2\tInternational Law and Human Rights\tDr. Syed Adnan Ali Shah Bukhari\t302\t02:20 PM - 05:20 PM\tSZABIST University\n'
        'H-8/4 ISB Campus\n'
        '7\tSocial Sciences\tBSSS OPEN\tBSSS /\nBS Psychology 4\tSS 4112 Developmental Psychology\tAbdul Hanan Sami\t301\t02:00 PM - 05:00 PM\tSZABIST University\n'
        'H-8/4 ISB Campus\n'
        '8\tManagement Sciences\tBS (AF)\tBS (AF) 4 A /\nBS (AF) 8 A\tAF 2411 Entrepreneurship (3,0)\tMuhammad Ijaz Minhas\t102\t05:30 PM - 08:30 PM\tSZABIST University\n'
        'H-8/4 ISB Campus\n'
        '9\tComputer Sciences\tMS Cyber Security / MS Computer Science\tMS Cyber Security - 1 / MS Computer Science\tCYS 5103 Network Security (3,0)\tMuhammad Akram Mughal\t306\t06:30 PM - 09:30 PM\tSZABIST University\n'
        'H-8/4 ISB Campus\n'
        '10\tComputer Sciences\tMS Cyber Security\tMS Cyber Security - 2\tCYS 5233 Machine Learning for Cyber Security (3,0)\tDr. Qamar Abbas\tHall 01 A\t06:30 PM - 09:30 PM\tSZABIST University\n'
        'H-8/4 ISB Campus\n'
        '11\tComputer Sciences\tMS Computer Science\tMS Computer Science\tCSC 5202 Advanced Computer Architecture (3,0)\tDr. Danish Mahmood\t105\t06:30 PM - 09:30 PM\tSZABIST University\n'
        'H-8/4 ISB Campus\n'
        '12\tRobotics & AI\tMS(Data Sci)\tMS(Data Sci) -2 Core Courses\tDSC 5241 Natural Language Processing (3,0)\tNabeela Kausar -\t104\t06:30 PM - 09:30 PM\tSZABIST University\n'
        'H-8/4 ISB Campus\n'
        '13\tSocial Sciences\tBSSS\tBSSS 4 / BS Psychology 4\tSS 2418 Statistical Inferences\tDr. Syed Aziz Rasool\t203\t05:30 PM - 08:30 PM\tSZABIST University\n'
        'H-8/4 ISB Campus\n'
        '14\tMedia Sciences\tBS Media\tFilm & Television Production Major\tMD 4825 Screenwriting (3,0)\tDr. Naveed Ullah Hashmi\tMedia Lab\t02:20 PM - 05:20 PM\tSZABIST University\n'
        'H-8/4 ISB Campus'
    )

    items = parse_html_with_advanced_pandas(email_body)
    assert len(items) == 14

    by_row = {item['row_number']: item for item in items}

    assert by_row[1]['semester_display'] == 'BS (AF) 6 A'
    assert by_row[2]['semester_display'] == 'BS Media 4 A'
    assert by_row[3]['semester_display'] == 'BS Psychology 1'
    assert by_row[4]['semester_display'] == 'BS Psychology 3'
    assert by_row[5]['semester_display'] == 'BS Psychology 2'
    assert by_row[6]['semester_display'] == 'BS Psychology 2'
    assert by_row[7]['semester_display'] == 'BS Psychology 4'
    assert by_row[8]['semester_display'] == 'BS (AF) 4 A'
    assert by_row[9]['semester_display'] == 'MS Cyber Security - 1'
    assert by_row[10]['semester_display'] == 'MS Cyber Security - 2'
    assert by_row[11]['semester_display'] == 'MS Computer Science'
    assert by_row[12]['semester_display'] == 'MS(Data Sci) -2 Core Courses'
    assert by_row[13]['semester_display'] == 'BS Psychology 4'
    assert by_row[14]['semester_display'] == 'Film & Television Production Major'

    assert by_row[3]['course_title'] == 'Introduction to Social Sciences'
    assert by_row[4]['course_title'] == 'Mathematics and Statistics'
    assert by_row[5]['course_title'] == 'Philosphy'
    assert by_row[13]['course_title'] == 'Statistical Inferences'
