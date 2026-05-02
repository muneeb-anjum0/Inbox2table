from scraper.timetable_parser import AdvancedTableParser

with open('debug_email.html', 'r', encoding='utf-8') as f:
    html = f.read()

parser = AdvancedTableParser()
tables = parser.extract_tables_from_html(html)
print(f"Extracted {len(tables)} tables")
if tables:
    df = tables[0]
    print(df.columns)
    for i, raw in enumerate(df['raw_line'].tolist()):
        print(f"Row {i+1}: {raw}")
        if 'BSSE 3 B' in raw or 'SEC TE01' in raw or 'Laiba' in raw:
            row = df.iloc[i]
            print('  -> semester col value:', row.get('semester'))
            print('  -> course col value:', row.get('course'))
            print('  -> course_title col value:', row.get('course_title'))
        if i >= 80:
            break
