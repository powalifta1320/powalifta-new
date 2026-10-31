# Step 1 of the percentile table: stream the OpenPowerlifting CSV (stdin) and write one line per
# qualifying result: bucket \t name \t squat \t bench \t deadlift \t total (kg).
# A result qualifies when: a full-power meet (Event SBD), sanctioned, a placing (a number or G: no DQ,
# DD or NS), a total, a bodyweight, sex M or F, Raw or Single-ply, on or after SINCE.
# The bucket is sex|equipment|IPF open class from the bodyweight (the app's IPF_CLASSES).
import sys, csv

SINCE = sys.argv[1] if len(sys.argv) > 1 else '2021-01-01'
CLASSES = {'M': [59, 66, 74, 83, 93, 105, 120], 'F': [47, 52, 57, 63, 69, 76, 84]}
EQUIP = {'Raw': 'raw', 'Single-ply': 'eq'}

def cls(bw, sex):
    for c in CLASSES[sex]:
        if bw <= c:
            return str(c)
    return str(CLASSES[sex][-1]) + '+'

def num(v):
    try:
        x = float(v)
        return x if x > 0 else None
    except Exception:
        return None

r = csv.reader(sys.stdin)
head = next(r)
ix = {h: i for i, h in enumerate(head)}
need = ['Name', 'Sex', 'Event', 'Equipment', 'BodyweightKg', 'Best3SquatKg', 'Best3BenchKg', 'Best3DeadliftKg', 'TotalKg', 'Place', 'Date', 'Sanctioned']
for k in need:
    if k not in ix:
        sys.exit('missing column ' + k)
out = sys.stdout
seen = kept = 0
for row in r:
    seen += 1
    try:
        if row[ix['Event']] != 'SBD':
            continue
        sex = row[ix['Sex']]
        if sex not in CLASSES:
            continue
        eq = EQUIP.get(row[ix['Equipment']])
        if not eq:
            continue
        if row[ix['Date']] < SINCE:
            continue
        if row[ix['Sanctioned']] == 'No':
            continue
        place = row[ix['Place']]
        if not (place.isdigit() or place == 'G'):
            continue
        bw = num(row[ix['BodyweightKg']])
        t = num(row[ix['TotalKg']])
        s = num(row[ix['Best3SquatKg']]); b = num(row[ix['Best3BenchKg']]); d = num(row[ix['Best3DeadliftKg']])
        if not (bw and t and s and b and d):
            continue
        name = row[ix['Name']].replace('\t', ' ')
        out.write(sex + '|' + eq + '|' + cls(bw, sex) + '\t' + name + '\t' + repr(s) + '\t' + repr(b) + '\t' + repr(d) + '\t' + repr(t) + '\n')
        kept += 1
    except Exception:
        continue
sys.stderr.write('rows %d kept %d\n' % (seen, kept))
