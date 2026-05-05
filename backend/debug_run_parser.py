import sys
import json
from collections import Counter

from scraper.timetable_parser import parse_html_with_advanced_pandas, _html_to_text, _iter_row_blocks, _iter_row_blocks_fallback


def main():
    path = sys.argv[1] if len(sys.argv) > 1 else "SZABIST Mail - Class Schedule – Tuesday, May 05, 2026 _ Spring 2026.html"
    with open(path, "r", encoding="utf-8", errors="replace") as fh:
        html = fh.read()

    text = _html_to_text(html)
    strict_blocks = _iter_row_blocks(text)
    fallback_blocks = _iter_row_blocks_fallback(text)
    print(f"Strict splitter produced {len(strict_blocks)} blocks; fallback produced {len(fallback_blocks)} blocks")

    items = parse_html_with_advanced_pandas(html)
    print(f"Parsed {len(items)} items")

    sem_counts = Counter(item.get("semester_display") for item in items)
    for sem, cnt in sem_counts.most_common():
        print(f"{cnt:3d}  {sem}")

    target = "BS (AF) 4 A"
    matches = [item for item in items if item.get("semester_display") == target]
    print(f"\nEntries matching '{target}': {len(matches)}")
    for m in matches[:50]:
        print(json.dumps({
            "row_number": m.get("row_number"),
            "semester_display": m.get("semester_display"),
            "semester_original": m.get("semester_original"),
            "course": m.get("course"),
            "course_title": m.get("course_title"),
            "faculty": m.get("faculty"),
            "room": m.get("room"),
            "time": m.get("time"),
        }, ensure_ascii=False))

    print("\nAll parsed items (brief):")
    for it in items:
        print(json.dumps({
            "row_number": it.get("row_number"),
            "semester_display": it.get("semester_display"),
            "semester_original": it.get("semester_original"),
            "course": it.get("course"),
        }, ensure_ascii=False))


if __name__ == "__main__":
    main()
