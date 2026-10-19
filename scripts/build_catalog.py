"""Build a sourced undergraduate department-course catalog from official PDF text.

Usage: python scripts/build_catalog.py /tmp
The directory contains pdftotext -layout outputs named below. No inferred degree
requirements are added: program membership means department exploration only.
"""
import json, re, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
TEXT = Path(sys.argv[1])
seed = json.loads((ROOT / 'scripts/cs-seed.json').read_text())
sources = [
    ('bulletin', '2022–23', 'https://www.ncat.edu/provost/academic-affairs/bulletins/2022-23undergraduatebulletin1.pdf'),
    ('meen', '2023', 'https://www.ncat.edu/coe/departments/me/handbooks/meen_ug_handbook_2023-ver02-2023_11_20.pdf'),
    ('caee', '2023 handbook, approved 2025', 'https://www.ncat.edu/coe/departments/caee/undergraduate-programs/caee-handbook-2023.pdf'),
    ('bmen26', '2026–27', 'https://www.ncat.edu/coe/departments/cbbe/undergraduate-programs/bs-bmen-handbook-2026-2027.pdf'),
    ('chen26', '2026–27', 'https://www.ncat.edu/coe/departments/cbbe/undergraduate-programs/bs-chen-handbook-2026-2027.pdf'),
]
allowed = {'MEEN','ECEN','ISEN','CAEE','CIEN','AREN','BMEN','BIOE','CHEN','GEEN'}
catalog = {}
header = re.compile(r'^\s*([A-Z]{2,5})\s+(\d{3})\.?\s+(.+?)\s{2,}Credit\s+(\d+)([^\n]*)$', re.M)

def clean(s):
    s = re.sub(r'^\s*\d+\s*$', '', s, flags=re.M)
    return re.sub(r'\s+', ' ', s.replace('\f', ' ')).strip()

for name, year, url in sources:
    text = (TEXT / (name + '.txt')).read_text()
    headers = list(header.finditer(text))
    for i, h in enumerate(headers):
        prefix, number, title, credits, extra = h.groups()
        if prefix not in allowed or not (100 <= int(number) < 500):
            continue
        # Each block ends at the next actual course header, never a course reference.
        block = clean(text[h.end():headers[i+1].start() if i+1 < len(headers) else h.end()+2500])
        # Do not let the last course in a department consume the next degree plan.
        block = re.split(r'COURSE DESCRIPTIONS|BACHELOR OF|DEPARTMENT OF', block)[0]
        rules = re.findall(r'((?:Pre-?requisites?|Co-?requisites?)\s*[:.]\s*.*?)(?=(?:Pre-?requisites?|Co-?requisites?)\s*[:.]|$)', block, re.I)
        rule = ' '.join(rules)
        rule = re.sub(r'\([FS; ,]+\).*$', '', rule).strip()
        description = re.split(r'(?:Pre-?requisites?|Co-?requisites?)\s*[:.]', block, flags=re.I)[0]
        description = re.sub(r'\([FS; ,]+\)\s*$', '', description).strip()
        description = description[:1600]
        code = prefix + ' ' + number
        catalog[code] = dict(code=code, title=title.strip(), credits=int(credits),
            description=description, requirementText=rule,
            source=url, sourceYear=year, category='department course', tags=[],
            sourcePage=text[:h.start()].count('\f')+1)

# Preserve the CS handbook seed and its explicitly reviewed elective rules.
for course in seed['COURSES']:
    if course['code'] in catalog and not course['code'].startswith('COMP'):
        continue
    c = dict(course)
    c.update(description=course['title'] + '. Topics: ' + ', '.join(course['tags']) + '.',
             source=seed['SOURCE'], sourceYear='2025', sourcePage=None,
             requirementText='; '.join(dict.fromkeys(r['text'] for r in seed['PREREQUISITES'].get(course['code'], []))),
             reviewedRules=seed['PREREQUISITES'].get(course['code']))
    catalog[c['code']] = c

mapping = {
 'BS-CS':['COMP','GEEN','BUAN','ECEN','ISEN','MATH','CST'],
 'BS-AE':['CAEE','AREN','GEEN'], 'BS-CE':['CAEE','CIEN','GEEN'],
 'BS-ME':['MEEN','GEEN'], 'BS-MEA':['MEEN','GEEN'],
 'BS-ISE':['ISEN','GEEN'], 'BS-EE':['ECEN','GEEN'], 'BS-CpE':['ECEN','GEEN'],
 'BS-BIOE-G':['BMEN','GEEN'], 'BS-BIOE-I':['BMEN','GEEN'],
 'BS-BE-BP':['BIOE','GEEN'], 'BS-BE-NR':['BIOE','GEEN'], 'BS-CHE':['CHEN','GEEN']}
cs_codes = {c['code'] for c in seed['COURSES']}
for c in catalog.values():
    c['programs'] = [p for p, prefixes in mapping.items()
        if c['code'].split()[0] in prefixes and (p != 'BS-CS' or c['code'] in cs_codes)]
    if c['code'] == 'COMP 320':
        c['reviewNote'] = 'The CS handbook contains conflicting COMP 320 requirements; confirm with the department.'
    # Required CS courses lacked complete prerequisite data in the original seed.
    if c.get('reviewedRules') is None and c['source'] == seed['SOURCE']:
        c['reviewNote'] = 'Prerequisite details were not included in the original handbook seed.'
out = dict(programs=seed['PROGRAMS'], courses=sorted(catalog.values(), key=lambda c:c['code']),
    collected='2026-10-18', coverage='Department course exploration, not a degree audit. Tracks share department pools. Some source snapshots are older than the current catalog.',
    model=dict(id='Xenova/all-MiniLM-L6-v2', revision='751bff37182d3f1213fa05d7196b954e230abad9', license='Apache-2.0'))
(ROOT/'catalog.json').write_text(json.dumps(out, indent=2))
print(json.dumps({'courses':len(catalog), 'perProgram':{p:sum(p in c['programs'] for c in catalog.values()) for p in mapping}}, indent=2))
