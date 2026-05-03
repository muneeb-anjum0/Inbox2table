from __future__ import annotations

import html as html_module
import logging
import re
from typing import Dict, List, Optional, Sequence, Tuple

from bs4 import BeautifulSoup

LOGGER = logging.getLogger(__name__)

ROW_START_RE = re.compile(r"^\s*(\d{1,3})\s+(.+\S)\s*$")
TIME_RE = re.compile(
    r"\b\d{1,2}:\d{2}(?:\s*(?:AM|PM))?\s*-\s*\d{1,2}:\d{2}(?:\s*(?:AM|PM))?\b",
    re.IGNORECASE,
)
COURSE_CODE_TOKEN_RE = re.compile(r"^[A-Z]{2,6}$")
COURSE_CODE_VALUE_RE = re.compile(r"^(?:\d{2,4}[A-Z]?|[A-Z]{1,4}\d{1,4}|\d{3,4})$", re.IGNORECASE)
COURSE_CODE_SINGLE_RE = re.compile(r"^[A-Z]{2,6}\d{2,4}$")
NAME_PREFIXES = {"DR.", "PROF.", "MR.", "MS.", "MRS.", "MISS."}
NAME_TOKEN_RE = re.compile(r"^(?:[A-Z]\.|[A-Z][A-Za-z.'-]*|[A-Z]{2,})$")
NAME_CONNECTORS = {"ul", "al", "bin", "bint", "e"}
NON_PERSON_TOKENS = {
    "ROOM",
    "HALL",
    "LAB",
    "BLOCK",
    "CAMPUS",
    "STUDIO",
    "DIGITAL",
    "MEDIA",
    "MEETING",
    "ADMIN",
    "ORIC",
    "PSY",
}
FACULTY_KEYWORDS = {"INSTRUCTOR", "INSTRUCTORS", "FACULTY", "PROFESSOR", "PROF", "DOCTOR", "LECTURER", "TRAINER", "TUTOR", "FACILITATOR", "EXTERNAL"}
COURSE_KEYWORDS = {"WORKSHOP", "COURSE", "DEVELOPMENT", "MANAGEMENT", "COMMUNICATION", "TECHNIQUES", "ANALYSIS", "PRACTICE", "RESEARCH", "ELECTIVES", "UNDERSTANDING", "QURAN", "HOLY"}
COURSE_CREDITS_RE = re.compile(r"\s*\(\d+\s*,\s*\d+\)\s*$")
COURSE_CREDITS_SUFFIX_RE = re.compile(r"\s*\(\d+\s*,\s*\d+\)\s*[A-Z]\s*$")


SECTION_SUFFIX_PATTERNS = [
    re.compile(r"^[A-Z]{1,8}\s*\([A-Z0-9&/]+\)\s*(?:-\s*)?\d+\s*[A-Z]?$", re.IGNORECASE),
    re.compile(r"^[A-Z]{1,8}\s*\([A-Z0-9&/]+\)\s+\d+\s*[A-Z]?$", re.IGNORECASE),
    re.compile(r"^[A-Z]{1,8}\s*\(\d+\)\s*$", re.IGNORECASE),
    re.compile(r"^[A-Z]{1,12}\s*-\s*\d+\s*[A-Z]?$", re.IGNORECASE),
    re.compile(r"^[A-Z]{1,12}-\d+\s*[A-Z]?$", re.IGNORECASE),
    re.compile(r"^[A-Z]{1,8}\s+Open(?:\s*/\s*[A-Z]{1,8}\s+Open)*\s*$", re.IGNORECASE),
    re.compile(r"^[A-Z]{1,8}\s*-\s*[A-Z]{1,8}\s+Open(?:\s*/\s*[A-Z]{1,8}\s*-\s*[A-Z]{1,8}\s+Open)*\s*$", re.IGNORECASE),
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
        line = raw_line.strip()
        if not line:
            continue

        match = ROW_START_RE.match(line)
        if match:
            if current_serial is not None and current_lines:
                blocks.append((current_serial, "\n".join(current_lines).strip()))
            current_serial = int(match.group(1))
            current_lines = [match.group(2).lstrip()]
            continue

        if current_serial is not None:
            current_lines.append(line)

    if current_serial is not None and current_lines:
        blocks.append((current_serial, "\n".join(current_lines).strip()))

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

    if cleaned.lower() in NAME_CONNECTORS:
        return True

    upper = cleaned.upper()
    if upper in NON_PERSON_TOKENS:
        return False

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
    
    # Exclude common English words that might look like section codes
    common_english = {"HANDS", "WORKSHOP", "COURSE", "DEVELOPMENT", "MANAGEMENT", 
                      "COMMUNICATION", "TECHNIQUES", "ANALYSIS", "PRACTICE", "RESEARCH", 
                      "ELECTIVES", "EXTERNAL", "INSTRUCTORS", "UNDERSTANDING"}
    if upper in common_english:
        return False
    
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


def _normalize_person_name(text: str) -> str:
    cleaned = _collapse_whitespace(text)
    if not cleaned:
        return ""

    tokens = [token for token in cleaned.split() if token not in {"-", "–", "—", "/", "&", "."}]
    return _collapse_whitespace(" ".join(tokens))


def _clean_course_title(text: str, course_code: str = "") -> str:
    cleaned = _collapse_whitespace(text).strip(" -/.,")
    if not cleaned:
        return ""

    if course_code and cleaned.upper().startswith(course_code.upper()):
        cleaned = _collapse_whitespace(cleaned[len(course_code):].strip(" -/.,"))

    # Some rows append an extra section marker after credits, e.g. "(3,0) B".
    cleaned = COURSE_CREDITS_SUFFIX_RE.sub("", cleaned)
    cleaned = COURSE_CREDITS_RE.sub("", cleaned)
    cleaned = cleaned.strip(" -/.,")
    return cleaned


def _parse_structured_row(serial_no: int, raw_text: str) -> Optional[Dict[str, object]]:
    if "\t" not in raw_text:
        return None

    parts = [part.strip() for part in raw_text.split("\t")]
    parts = [part for part in parts if part]
    if len(parts) < 8:
        return None

    if len(parts) > 8:
        parts = parts[:7] + [" ".join(parts[7:])]

    if len(parts) != 8:
        return None

    department, program, section, course, faculty, room, time_text, campus_text = parts
    _, _, course_code = _extract_course_code(_collapse_whitespace(course).split())
    course_value = _collapse_whitespace(course)
    course_title = _clean_course_title(course_value, course_code)
    semester_display = _normalize_semester_display(section)
    semester_key = _normalize_semester_key(section)
    faculty = _clean_faculty_name(faculty)
    room = _collapse_whitespace(room)
    time_text = _collapse_whitespace(time_text)
    campus = _normalize_campus(campus_text)

    raw_cells = [
        semester_display,
        course_title or course_value,
        faculty,
        room,
        time_text,
        campus,
    ]

    return {
        "row_number": serial_no,
        "department": _collapse_whitespace(department),
        "program": _collapse_whitespace(program),
        "section": semester_display,
        "semester": semester_key,
        "semester_key": semester_key,
        "semester_display": semester_display,
        "semester_original": section,
        "class_section": semester_display,
        "course": course_value,
        "course_title": course_title or course_value,
        "course_code": course_code,
        "faculty": faculty,
        "faculty_name": faculty,
        "room": room,
        "time": time_text,
        "campus": campus,
        "raw_line": raw_text,
        "raw_cells": raw_cells,
        "full_text": ", ".join(cell for cell in raw_cells if cell),
    }


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

    if not best_match:
        return ""

    # Trim leading pure program acronyms when the remaining text still
    # matches a valid section pattern (e.g., "PhDMS PhD-1" -> "PhD-1").
    match_tokens = best_match.split()
    while len(match_tokens) > 1:
        first = match_tokens[0].strip("-/,")
        if not re.fullmatch(r"[A-Za-z]{2,10}", first):
            break
        candidate_tail = _collapse_whitespace(" ".join(match_tokens[1:]))
        if any(pattern.fullmatch(candidate_tail) for pattern in SECTION_SUFFIX_PATTERNS):
            match_tokens = match_tokens[1:]
            continue
        break

    return _collapse_whitespace(" ".join(match_tokens))


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
    """Extract faculty from course text using keyword hints and backward matching.
    
    Uses both explicit keywords (like "INSTRUCTOR", "EXTERNAL") and name pattern
    matching to identify faculty. Prioritizes rightmost faculty keywords to avoid
    including course content as part of the faculty name.
    """
    cleaned = _collapse_whitespace(text).strip(" -/")
    # Clean trailing dashes and hyphens from faculty names
    cleaned = re.sub(r'\s+[-–—]+\s*$', '', cleaned)
    if not cleaned:
        return "", ""

    tokens = cleaned.split()
    
    if len(tokens) < 2:
        return "", cleaned
    
    # First, check for explicit prefixes like DR., PROF., etc.
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

    # Look for the RIGHTMOST faculty keyword within reasonable distance from the end
    rightmost_keyword_idx = -1
    for i in range(len(tokens) - 1, max(0, len(tokens) - 4), -1):
        if tokens[i].upper() in FACULTY_KEYWORDS:
            rightmost_keyword_idx = i
            break
    
    if rightmost_keyword_idx >= 0:
        # Found a faculty keyword, include from here to end
        # Backtrack to include preceding name tokens, but only 1-2 at most
        start_idx = rightmost_keyword_idx
        
        # Check if immediately preceding token is a name
        if rightmost_keyword_idx > 0 and _is_name_token(tokens[rightmost_keyword_idx - 1]):
            start_idx = rightmost_keyword_idx - 1
            
            # Check if there's another name token before that
            if rightmost_keyword_idx > 1 and _is_name_token(tokens[rightmost_keyword_idx - 2]):
                # Only include if the token before the second-last is not a name
                # (to avoid including entire course titles)
                if rightmost_keyword_idx < 3 or not _is_name_token(tokens[rightmost_keyword_idx - 3]):
                    start_idx = rightmost_keyword_idx - 2
        
        faculty = _collapse_whitespace(" ".join(tokens[start_idx:]))
        course = _collapse_whitespace(" ".join(tokens[:start_idx]))
        if course and faculty:
            return faculty, course
    
    # If no faculty keywords found, try the name token approach
    # Try to extract 2 name tokens from the end (typical faculty name)
    if len(tokens) >= 2:
        last_two_are_names = (_is_name_token(tokens[-1]) and _is_name_token(tokens[-2]))
        
        if last_two_are_names:
            # Check what comes before them
            if len(tokens) >= 3:
                token_before = tokens[-3]
                # Accept trailing two-name faculty when preceded by either
                # a non-name token or a known course keyword phrase token.
                if (((not _is_name_token(token_before) and token_before.upper() not in COURSE_KEYWORDS)
                    or token_before.upper() in COURSE_KEYWORDS) and
                    tokens[-1].upper() not in COURSE_KEYWORDS and
                    tokens[-2].upper() not in COURSE_KEYWORDS):
                    faculty = _collapse_whitespace(" ".join(tokens[-2:]))
                    course = _collapse_whitespace(" ".join(tokens[:-2]))
                    return faculty, course
            elif len(tokens) == 2:
                # Only 2 tokens, both are names - this is the whole thing
                if (tokens[-1].upper() not in COURSE_KEYWORDS and
                    tokens[-2].upper() not in COURSE_KEYWORDS):
                    faculty = _collapse_whitespace(" ".join(tokens[-2:]))
                    return faculty, ""

    # Try 3 name tokens if 2 didn't work
    if len(tokens) >= 3:
        last_three_are_names = (
            _is_name_token(tokens[-1]) and 
            _is_name_token(tokens[-2]) and 
            _is_name_token(tokens[-3])
        )
        
        if last_three_are_names:
            if len(tokens) >= 4:
                token_before = tokens[-4]
                # Only accept if preceded by non-name token and not a course keyword
                # Also check that the tokens aren't course keywords
                if (not _is_name_token(token_before) and 
                    token_before.upper() not in COURSE_KEYWORDS and
                    tokens[-1].upper() not in COURSE_KEYWORDS and
                    tokens[-2].upper() not in COURSE_KEYWORDS and
                    tokens[-3].upper() not in COURSE_KEYWORDS):
                    faculty = _collapse_whitespace(" ".join(tokens[-3:]))
                    course = _collapse_whitespace(" ".join(tokens[:-3]))
                    return faculty, course

    suffix_start = len(tokens)
    while suffix_start > 0:
        token = tokens[suffix_start - 1]
        if token in {"-", "–", "—", "/", "&", "."} or _is_name_token(token):
            suffix_start -= 1
            continue
        break

    suffix_tokens = [token for token in tokens[suffix_start:] if token not in {"-", "–", "—", "/", "&", "."}]
    if suffix_tokens and len(suffix_tokens) <= 5:
        if len(suffix_tokens) > 1 or suffix_tokens[0].upper() not in COURSE_KEYWORDS:
            faculty = _collapse_whitespace(" ".join(suffix_tokens))
            course = _collapse_whitespace(" ".join(tokens[:suffix_start]))
            if course and faculty:
                return faculty, course
            if faculty and not course:
                return faculty, ""

    # No faculty pattern found
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
        re.compile(r"\bTV\s+Studio\b", re.IGNORECASE),
        re.compile(r"\bMeeting\s+Room(?:\s+\d+)?\s+Admin\s+Block\b", re.IGNORECASE),
        re.compile(r"\bConference\s+Room\b", re.IGNORECASE),
        re.compile(r"\b(?:[A-Za-z]+\s+)?Lab(?:\s+\d+[A-Z]?)?\b", re.IGNORECASE),
        re.compile(r"\b(?:Media|Digital)\s+Lab\b", re.IGNORECASE),
        re.compile(r"\bFM-?Radio\b", re.IGNORECASE),
        re.compile(r"\bORIC\s+Hall\b", re.IGNORECASE),
        re.compile(r"\bAuditorium\b", re.IGNORECASE),
        re.compile(r"\bLibrary\b", re.IGNORECASE),
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

    cleaned = re.sub(r"(?<=[a-z])(?=[A-Z])", " ", cleaned)
    cleaned = re.sub(r"(?<=\w)(Campus)$", r" \1", cleaned)

    upper = cleaned.upper()
    if "ONLINE" in upper or "VIRTUAL" in upper:
        return "Virtual Campus"
    if "HMB" in upper or "I-8 MARKAZ" in upper:
        return "SZABIST HMB I-8 Markaz Campus"
    if "H-8/4" in upper or "ISB" in upper or "UNIVERSITY" in upper:
        return "SZABIST University H-8/4 ISB Campus"

    return cleaned


def _skip_known_columns(text: str) -> str:
    """Skip the Department and Program columns at the start of the row.
    
    After Sr.No is removed, the text typically starts with:
    Department (e.g., "Management Sciences", "Social Sciences", "Media Studies")
    Program (e.g., "MBA", "MSDS", "MHRM", "BBA")
    
    This function identifies and skips these columns, returning everything
    from Section onwards (Section, Course, Faculty, Room, Time, Campus).
    """
    cleaned = _collapse_whitespace(text).strip()
    if not cleaned:
        return ""
    
    tokens = cleaned.split()
    if len(tokens) < 2:
        return cleaned
    
    # Known department names (common patterns)
    dept_patterns = [
        "Computer Sciences",
        "Robotics & AI",
        "Management Sciences",
        "Social Sciences",
        "Media Sciences",
        "Media Studies",
        "Law",
        "Engineering",
    ]
    
    # Check if the text starts with a known department name
    dept_skipped = 0
    text_upper = cleaned.upper()
    
    for dept in dept_patterns:
        if text_upper.startswith(dept.upper()):
            dept_skipped = len(dept)
            break
    
    if dept_skipped > 0:
        remaining = _collapse_whitespace(cleaned[dept_skipped:]).strip()
    else:
        # If no exact match, assume first 1-2 words are department
        remaining = _collapse_whitespace(" ".join(tokens[1:])).strip() if len(tokens) > 1 else ""
    
    if not remaining:
        return ""
    
    tokens = remaining.split()
    if len(tokens) < 1:
        return ""
    
    # Skip a compact program acronym only when the following token(s)
    # clearly indicate section content.
    first_token = tokens[0]
    second_token = tokens[1] if len(tokens) > 1 else ""
    third_token = tokens[2] if len(tokens) > 2 else ""
    second_or_third_has_section_signal = (
        "/" in second_token
        or bool(re.search(r"\d", second_token))
        or bool(re.search(r"\d", third_token))
    )
    if (
        re.fullmatch(r"^[A-Z]{2,6}$", first_token)
        and first_token not in {"AND", "FOR", "WITH", "OR", "OF"}
        and second_or_third_has_section_signal
    ):
        remaining = _collapse_whitespace(" ".join(tokens[1:])).strip() if len(tokens) > 1 else ""
    
    return remaining


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


def _clean_faculty_name(faculty: str) -> str:
    """Clean faculty names by removing trailing dashes, hyphens, and extra whitespace."""
    if not faculty:
        return ""
    cleaned = _normalize_person_name(faculty)
    cleaned = re.sub(r"\s*[-–—,.;]+\s*$", "", cleaned).strip()
    return cleaned


def _build_heuristic_item(serial_no: int, raw_text: str) -> Dict[str, object]:
    # Step 1: Skip the Department and Program columns (first 3 columns including Sr.No)
    # The Sr.No is already removed by _iter_row_blocks, so we just need to skip Department and Program
    text_after_skip = _skip_known_columns(raw_text)
    
    # Step 2: Extract from the RIGHT (Time, Campus)
    before_time, time_text, campus_text = _extract_time_and_campus(text_after_skip)
    
    # Step 3: Extract venue and work left  
    venue_text, before_venue = _extract_venue(before_time)
    
    # Step 4: FIRST extract section from the remaining text, then extract faculty from what's left
    # This ensures we get the section right, which is critical for filtering
    semester_source, course_and_faculty, course_code = _split_section_and_course(before_venue)
    
    # Step 5: Extract faculty from the course_and_faculty text
    faculty_text, course_text = _extract_faculty_and_course(course_and_faculty)
    faculty_text = _clean_faculty_name(faculty_text)
    
    # If faculty extraction didn't work (returns empty course), fall back to full text as course
    if not faculty_text and not course_text:
        course_text = course_and_faculty

    # Heuristic: if faculty is empty but course_text ends with a likely faculty name
    # (two name tokens), move them to faculty. Also remove stray 'TBD' suffixes.
    if not faculty_text and course_text:
        ct_tokens = course_text.split()
        # Remove trailing TBD or similar placeholders
        if ct_tokens and ct_tokens[-1].upper() in {"TBD", "TBA"}:
            ct_tokens = ct_tokens[:-1]

        if len(ct_tokens) >= 2:
            last, second_last = ct_tokens[-1], ct_tokens[-2]
            if _is_name_token(last) and _is_name_token(second_last):
                faculty_text = _collapse_whitespace(" ".join([second_last, last]))
                course_text = _collapse_whitespace(" ".join(ct_tokens[:-2]))

    semester_display = _normalize_semester_display(semester_source)
    semester_key = _normalize_semester_key(semester_source)
    campus = _normalize_campus(campus_text)
    course_title = _clean_course_title(course_text, course_code)
    if course_code and course_text.upper().startswith(course_code.upper()):
        course_text = _collapse_whitespace(course_text)

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
        "faculty_name": faculty_text,
        "room": venue_text,
        "time": time_text,
        "campus": campus,
        "raw_line": raw_text,
        "raw_cells": raw_cells,
        "full_text": comma_separated,
    }


def _build_item(serial_no: int, raw_text: str) -> Dict[str, object]:
    structured_item = _parse_structured_row(serial_no, raw_text)
    if structured_item is not None:
        return structured_item

    return _build_heuristic_item(serial_no, raw_text)


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
