from scraper.timetable_parser import parse_html_with_advanced_pandas


def _build_table_row(cells):
    return "<tr>" + "".join(f"<td>{c}</td>" for c in cells) + "</tr>"


def _sample_social_sciences_html():
    rows = []
    header = ["Sr No", "Department", "Program", "Section", "Course", "Faculty", "Room", "Time", "Campus"]
    rows.append("<tr>" + "".join(f"<th>{h}</th>" for h in header) + "</tr>")

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


if __name__ == '__main__':
    html = _sample_social_sciences_html()
    items = parse_html_with_advanced_pandas(html)
    print(f"Parsed {len(items)} items")
    for it in items:
        print('---')
        for k, v in it.items():
            print(k, ':', v)
