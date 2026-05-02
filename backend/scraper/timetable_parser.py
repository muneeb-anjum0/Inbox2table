"""Robust timetable parser for plain-text SZABIST schedule emails.

The schedule email is not a real HTML table. It is a wrapped text bulletin
that happens to render like a table in email clients. The parser therefore
works from plain text blocks, using semantic anchors from the right side of
each row to split the columns cleanly.
"""
from __future__ import annotations

import html as html_module
import logging
import re
from typing import Dict, List, Optional, Sequence, Tuple

from bs4 import BeautifulSoup

LOGGER = logging.getLogger(__name__)

ROW_START_RE = re.compile(r"^\s*(\d{1,3})\s+(.+\S)\s*$")
TIME_RE = re.compile(
    r"\b\d{1,2}:\d{2}\s*(?:AM|PM)\s*-\s*\d{1,2}:\d{2}\s*(?:AM|PM)\b",
    re.IGNORECASE,
)
COURSE_CODE_TOKEN_RE = re.compile(r"^[A-Z]{2,6}$")
COURSE_CODE_VALUE_RE = re.compile(r"^(?:\d{2,4}[A-Z]?|[A-Z]{1,4}\d{1,4}|\d{3,4})$", re.IGNORECASE)
COURSE_CODE_SINGLE_RE = re.compile(r"^[A-Z]{2,6}\d{2,4}$")
NAME_PREFIXES = {"DR.", "PROF.", "MR.", "MS.", "MRS.", "MISS."}
NAME_TOKEN_RE = re.compile(r"^(?:[A-Z]\.|[A-Z][A-Za-z.'-]*|[A-Z]{2,})$")
SECTION_SUFFIX_PATTERNS = [
    re.compile(r"^[A-Z]{1,8}\s*\([A-Z0-9&/]+\)\s*(?:-\s*)?\d+\s*[A-Z]?$", re.IGNORECASE),
    re.compile(r"^[A-Z]{1,8}\s*\([A-Z0-9&/]+\)\s+\d+\s*[A-Z]?$", re.IGNORECASE),
    re.compile(r"^[A-Z]{1,8}\s*\(\d+\)\s*$", re.IGNORECASE),
    re.compile(r"^[A-Z]{1,8}\s+Open(?:\s*/\s*[A-Z]{1,8}\s+Open)*\s*$", re.IGNORECASE),
    re.compile(r"^[A-Z]{1,8}(?:\s*/\s*[A-Z]{1,8})+\s+Open(?:\s*/\s*[A-Z]{1,8}\s+Open)*\s*$", re.IGNORECASE),
    re.compile(r"^[A-Z]{1,8}\s+\d+\s*/\s*[A-Z][A-Za-z]+(?:\s+[A-Z][A-Za-z]+)*\s+\d+$", re.IGNORECASE),
    re.compile(r"^[A-Z]{1,8}\s+\d+\s*[A-Z]?$", re.IGNORECASE),
]


def _collapse_whitespace(value: str) -> str:
    return re.sub(r"\s+", " ", value or "").strip()


def _html_to_text(value: str) -> str:
    if not value:
        return ""

    cleaned = html_module.unescape(value)
    if "<" in cleaned and ">" in cleaned:
        try:
            soup = BeautifulSoup(cleaned, "html.parser")
            cleaned = soup.get_text("\n")
        except Exception:
            LOGGER.debug("Falling back to raw text because BeautifulSoup parsing failed", exc_info=True)

    cleaned = cleaned.replace("\r\n", "\n").replace("\r", "\n")
    cleaned = cleaned.replace("\xa0", " ")
    cleaned = cleaned.replace("\u2013", "-").replace("\u2014", "-")
    return cleaned


def _iter_row_blocks(text: str) -> List[Tuple[int, str]]:
    blocks: List[Tuple[int, str]] = []
    current_serial: Optional[int] = None
    current_lines: List[str] = []

    for raw_line in text.splitlines():
        line = _collapse_whitespace(raw_line)
        if not line:
            continue

        match = ROW_START_RE.match(line)
        if match:
            if current_serial is not None and current_lines:
                blocks.append((current_serial, _collapse_whitespace(" ".join(current_lines))))
            current_serial = int(match.group(1))
            current_lines = [match.group(2)]
            continue

        if current_serial is not None:
            current_lines.append(line)

    if current_serial is not None and current_lines:
        blocks.append((current_serial, _collapse_whitespace(" ".join(current_lines))))

    return blocks


def _normalize_semester_key(value: str) -> str:
    if not value:
        return ""
    return re.sub(r"[^A-Z0-9/]+", "", value.upper())


def _normalize_semester_display(value: str) -> str:
    return _collapse_whitespace(value)


def _semester_matches_filters(item_values: Sequence[str], allowed_semesters: Optional[List[str]]) -> bool:
    if not allowed_semesters:
        return True

    item_keys = {_normalize_semester_key(value) for value in item_values if value}
    item_keys.discard("")
    if not item_keys:
        return False

    for allowed in allowed_semesters:
        allowed_key = _normalize_semester_key(allowed)
        if not allowed_key:
            continue

        for item_key in item_keys:
            if item_key == allowed_key:
                return True
            if item_key.endswith(allowed_key) or allowed_key.endswith(item_key):
                return True

    return False


def _is_name_token(token: str) -> bool:
    cleaned = token.strip().strip(",;:")
    if not cleaned:
        return False

    upper = cleaned.upper()
    if upper in NAME_PREFIXES:
        return True

    if NAME_TOKEN_RE.fullmatch(cleaned):
        return True

    return False


def _is_section_token(token: str) -> bool:
    cleaned = token.strip().strip(",;:")
    if not cleaned:
        return False

    upper = cleaned.upper()
    if upper == "OPEN":
        return True
    if cleaned in {"-", "/", "&"}:
        return True
    if re.fullmatch(r"\([A-Z0-9&/]+\)", cleaned):
        return True
    if re.fullmatch(r"[A-Z]{1,8}(?:/[A-Z]{1,8})+", upper):
        return True
    if re.fullmatch(r"[A-Z]{1,8}&[A-Z]{1,8}", upper):
        return True
    if re.fullmatch(r"[A-Z]{1,8}\d{0,4}[A-Z]?", upper):
        return True
    if re.fullmatch(r"\d{1,4}[A-Z]?", upper):
        return True

    return False


def _extract_course_code(tokens: Sequence[str]) -> Tuple[int, int, str]:
    for index in range(len(tokens) - 1):
        first = tokens[index].strip().strip(",;:")
        second = tokens[index + 1].strip().strip(",;:")

        if COURSE_CODE_TOKEN_RE.fullmatch(first) and COURSE_CODE_VALUE_RE.fullmatch(second):
            return index, index + 2, f"{first} {second}"

    for index, token in enumerate(tokens):
        cleaned = token.strip().strip(",;:")
        if COURSE_CODE_SINGLE_RE.fullmatch(cleaned):
            return index, index + 1, cleaned

    return -1, -1, ""


def _extract_section_suffix(text: str) -> str:
    cleaned = _collapse_whitespace(text)
    if not cleaned:
        return ""

    tokens = cleaned.split()
    best_match = ""

    for start_index in range(len(tokens)):
        candidate = _collapse_whitespace(" ".join(tokens[start_index:]))
        if not candidate:
            continue

        for pattern in SECTION_SUFFIX_PATTERNS:
            if pattern.fullmatch(candidate):
                if len(candidate) > len(best_match):
                    best_match = candidate
                break

    return best_match


def _split_section_and_course(text: str) -> Tuple[str, str, str]:
    cleaned = _collapse_whitespace(text)
    if not cleaned:
        return "", "", ""

    tokens = cleaned.split()
    code_start, code_end, code_value = _extract_course_code(tokens)
    if code_start >= 0:
        section_text = _extract_section_suffix(" ".join(tokens[:code_start])) or _collapse_whitespace(" ".join(tokens[:code_start]).strip(" -/"))
        course_text = _collapse_whitespace(" ".join(tokens[code_start:]))
        return section_text, course_text, code_value

    section_end = 0
    seen_section_signal = False

    for index, token in enumerate(tokens):
        if _is_section_token(token):
            section_end = index + 1
            if re.search(r"\d", token) or token.upper() == "OPEN":
                seen_section_signal = True
            continue

        if seen_section_signal:
            break

        if token[:1].isupper() and token[1:].islower():
            break

        section_end = index + 1

    section_text = _extract_section_suffix(" ".join(tokens[:section_end])) or _collapse_whitespace(" ".join(tokens[:section_end]).strip(" -/"))
    course_text = _collapse_whitespace(" ".join(tokens[section_end:]))
    return section_text, course_text, ""


def _extract_faculty_and_course(text: str) -> Tuple[str, str]:
    cleaned = _collapse_whitespace(text).strip(" -/")
    if not cleaned:
        return "", ""

    tokens = cleaned.split()
    prefix_index = -1
    for index, token in enumerate(tokens):
        if token.upper() in NAME_PREFIXES:
            prefix_index = index

    if prefix_index >= 0:
        end_index = prefix_index
        while end_index < len(tokens) and _is_name_token(tokens[end_index]):
            end_index += 1

        faculty_tokens = tokens[prefix_index:end_index]
        if len(faculty_tokens) >= 2:
            faculty = _collapse_whitespace(" ".join(faculty_tokens))
            course = _collapse_whitespace(" ".join(tokens[:prefix_index]))
            return faculty, course

    end_index = len(tokens)
    while end_index > 0 and _is_name_token(tokens[end_index - 1]):
        end_index -= 1

    faculty_tokens = tokens[end_index:]
    if len(faculty_tokens) >= 2:
        before_faculty = tokens[end_index - 1] if end_index > 0 else ""
        if end_index == 0 or not _is_name_token(before_faculty):
            faculty = _collapse_whitespace(" ".join(faculty_tokens))
            course = _collapse_whitespace(" ".join(tokens[:end_index]))
            return faculty, course

    return "", cleaned


def _extract_time_and_campus(text: str) -> Tuple[str, str, str]:
    cleaned = _collapse_whitespace(text)
    match = TIME_RE.search(cleaned)
    if not match:
        return cleaned, "", ""

    before_time = _collapse_whitespace(cleaned[: match.start()])
    time_text = _collapse_whitespace(match.group(0))
    campus_text = _collapse_whitespace(cleaned[match.end():])
    return before_time, time_text, campus_text


def _extract_venue(text: str) -> Tuple[str, str]:
    cleaned = _collapse_whitespace(text).strip(" -/")
    if not cleaned:
        return "", ""

    venue_patterns = [
        re.compile(r"(?:Cancelled|Canceled)\s+\d{2}-\d{2}-\d{4}", re.IGNORECASE),
        re.compile(r"(?:VF\s+)?ONLINE", re.IGNORECASE),
        re.compile(r"\b(?:NB|OB|HB|CB|AIC)-\d{2,4}\b", re.IGNORECASE),
        re.compile(r"\b(?:Lab|Room)\s+\d+[A-Z]?\b", re.IGNORECASE),
        re.compile(r"\bHall\s+\d+\s*[A-Z]?\b", re.IGNORECASE),
        re.compile(r"\b\d{3}\b"),
    ]

    candidates = []
    for priority, pattern in enumerate(venue_patterns):
        for match in pattern.finditer(cleaned):
            candidates.append((match.start(), match.end(), priority, match.group(0)))

    if not candidates:
        return "", cleaned

    start, _, _, venue = sorted(candidates, key=lambda item: (item[1], -item[2], item[0]))[-1]
    before = _collapse_whitespace(cleaned[:start].rstrip(" -/"))
    return _collapse_whitespace(venue), before


def _normalize_campus(text: str) -> str:
    cleaned = _collapse_whitespace(text)
    if not cleaned:
        return ""

    upper = cleaned.upper()
    if "ONLINE" in upper or "VIRTUAL" in upper:
        return "Virtual Campus"
    if "HMB" in upper or "I-8 MARKAZ" in upper:
        return "SZABIST HMB I-8 Markaz Campus"
    if "H-8/4" in upper or "ISB" in upper or "UNIVERSITY" in upper:
        return "SZABIST University H-8/4 ISB Campus"

    return cleaned


def _build_item(serial_no: int, raw_text: str) -> Dict[str, object]:
    before_time, time_text, campus_text = _extract_time_and_campus(raw_text)
    venue_text, before_venue = _extract_venue(before_time)
    faculty_text, course_and_section = _extract_faculty_and_course(before_venue)
    semester_source, course_text, course_code = _split_section_and_course(course_and_section)

    semester_display = _normalize_semester_display(semester_source)
    semester_key = _normalize_semester_key(semester_source)
    campus = _normalize_campus(campus_text)
    course_title = course_text
    if course_code and course_text.upper().startswith(course_code.upper()):
        course_title = _collapse_whitespace(course_text[len(course_code):].strip(" -/")) or course_text

    raw_cells = [
        semester_display,
        course_text,
        faculty_text,
        venue_text,
        time_text,
        campus,
    ]
    comma_separated = ", ".join(cell for cell in raw_cells if cell)

    return {
        "row_number": serial_no,
        "semester": semester_key,
        "semester_key": semester_key,
        "semester_display": semester_display,
        "semester_original": semester_source,
        "class_section": semester_display,
        "course": course_text,
        "course_title": course_title,
        "course_code": course_code,
        "faculty": faculty_text,
        "room": venue_text,
        "time": time_text,
        "campus": campus,
        "raw_line": raw_text,
        "raw_cells": raw_cells,
        "full_text": comma_separated,
    }


def parse_html_with_advanced_pandas(html: str, allowed_semesters: Optional[List[str]] = None) -> List[Dict]:
    """Parse a timetable email body into structured schedule items.

    The legacy function name is preserved for compatibility with the rest of
    the backend, but the implementation no longer depends on tables or pandas.
    """
    if not html:
        return []

    text = _html_to_text(html)
    row_blocks = _iter_row_blocks(text)
    if not row_blocks:
        return []

    items: List[Dict] = []
    for serial_no, row_text in row_blocks:
        item = _build_item(serial_no, row_text)
        if _semester_matches_filters(
            [
                str(item.get("semester", "")),
                str(item.get("semester_display", "")),
                str(item.get("semester_original", "")),
            ],
            allowed_semesters,
        ):
            items.append(item)

    return items


class AdvancedTableParser:
    """Compatibility wrapper used by older debug helpers.

    The parser no longer extracts HTML tables. It now returns structured row
    dictionaries from the plain-text timetable bulletin.
    """

    def extract_tables_from_html(self, html: str):
        return parse_html_with_advanced_pandas(html)
