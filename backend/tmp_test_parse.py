from scraper.timetable_parser import parse_html_with_advanced_pandas, _html_to_text, _iter_row_blocks, _iter_row_blocks_fallback, _parse_html_table_rows

def check(s):
    text = _html_to_text(s)
    print('INPUT:', repr(s[:120]))
    print('strict blocks:', len(_iter_row_blocks(text)))
    print('fallback blocks:', len(_iter_row_blocks_fallback(text)))
    print('table rows:', len(_parse_html_table_rows(s)))
    items = parse_html_with_advanced_pandas(s)
    print('parsed items:', len(items))
    for it in items:
        print('-', it.get('semester_display'), '|', it.get('course'), '|', it.get('campus'))
    print('\n')


s1 = '23\tComputer Sciences\tBSCS\tBSCS 5 A\tCSC 1215 Teachings of Holy Quran (0,0)\tMuhammad Hassaan Raza\tONLINE\t10:00 - 11:00\tSZABIST University\nH-8/4 ISB Campus'
s2 = '37\tSocial Sciences\tBSSS\tBSSS 2\tSS 1216 Intro to International Relations\tGulrukhsar Mujahid -\tCancelled\n30-04-2026\t08:00 AM - 11:00 AM\tSZABIST University\nH-8/4 ISB Campus'

check(s1)
check(s2)
