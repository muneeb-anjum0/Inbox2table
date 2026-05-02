terms = ['BSSE 3 B', 'Laiba Batool', 'SEC TE01', 'BSSE']
with open('debug_email.html', 'r', encoding='utf-8') as f:
    lines = f.readlines()
for i, line in enumerate(lines):
    for t in terms:
        if t in line:
            print(f"Line {i+1}: contains '{t}': {line.strip()}")
