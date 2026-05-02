from scraper.timetable_parser import parse_html_with_advanced_pandas

if __name__ == '__main__':
    with open('debug_email.html', 'r', encoding='utf-8') as f:
        html = f.read()

    targets = ['BSSE 3 B']
    print(f"Testing targets: {targets}")
    results = parse_html_with_advanced_pandas(html, targets)
    print(f"Found {len(results)} items")
    for i, item in enumerate(results[:10]):
        print(f"{i+1}. course={item.get('course')}, semester={item.get('semester')}, semester_original={item.get('semester_original')}, faculty={item.get('faculty')}")

    # Also test with compact target
    compact_targets = ['BSSE3B']
    print(f"\nTesting compact targets: {compact_targets}")
    results2 = parse_html_with_advanced_pandas(html, compact_targets)
    print(f"Found {len(results2)} items for compact target")
    for i, item in enumerate(results2[:10]):
        print(f"{i+1}. course={item.get('course')}, semester={item.get('semester')}, semester_original={item.get('semester_original')}")

    # Also run parser without target to see all extracted items
    print("\nTesting without target semesters:")
    results_all = parse_html_with_advanced_pandas(html, None)
    print(f"Found {len(results_all)} items without filtering")
    for i, item in enumerate(results_all[:20]):
        print(f"{i+1}. course={item.get('course')}, semester={item.get('semester')}, semester_original={item.get('semester_original')}")

    # Diagnostic: list all semesters and search for BSSE / '3 B' occurrences
    print("\nDiagnostic: looking for 'BSSE' and '3 B' in extracted semesters")
    bsse_items = [it for it in results_all if it.get('semester_original') and 'BSSE' in it.get('semester_original')]
    print(f"Found {len(bsse_items)} items where semester_original contains 'BSSE'")
    for it in bsse_items:
        print(f"orig='{it.get('semester_original')}' -> canon='{it.get('semester')}' course={it.get('course')}")

    three_b_items = [it for it in results_all if it.get('semester_original') and '3 B' in it.get('semester_original')]
    print(f"Found {len(three_b_items)} items where semester_original contains '3 B'")
    for it in three_b_items:
        print(f"orig='{it.get('semester_original')}' -> canon='{it.get('semester')}' course={it.get('course')}")

    # Search raw lines for specific identifiers from the debug HTML
    key_terms = ['Laiba Batool', 'SEC TE01', 'BSSE 3 B']
    for term in key_terms:
        matches = [it for it in results_all if it.get('raw_line') and term in it.get('raw_line')]
        print(f"Found {len(matches)} items with '{term}' in raw_line")
        for m in matches:
            print(f"raw='{m.get('raw_line')}' -> semester_orig='{m.get('semester_original')}', canon='{m.get('semester')}', course={m.get('course')}")
