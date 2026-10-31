# Step 3: read the filtered lines sorted by bucket then name (stdin), keep each lifter's best squat,
# bench, deadlift and total in each bucket, and print the percentile table as JSON (stdout).
# Every percentile from 1 to 99 (linear between ranks, numpy's default), in 0.5 kg steps, written as
# the first value then the steps up from it (all >= 0), so the file stays small.
import sys, json
from array import array

SOURCE_DATE = sys.argv[1]
SINCE = sys.argv[2]
MIN_N = int(sys.argv[3]) if len(sys.argv) > 3 else 100

buckets = {}
cur = None
best = None

def flush():
    if cur is None:
        return
    arrs = buckets.setdefault(cur[0], (array('f'), array('f'), array('f'), array('f')))
    for i in range(4):
        arrs[i].append(best[i])

for line in sys.stdin:
    parts = line.rstrip('\n').split('\t')
    if len(parts) != 6:
        continue
    key = (parts[0], parts[1])
    vals = [float(x) for x in parts[2:]]
    if key != cur:
        flush()
        cur = key
        best = vals
    else:
        best = [max(a, b) for a, b in zip(best, vals)]
flush()

def pct(sorted_vals, p):
    n = len(sorted_vals)
    pos = p / 100.0 * (n - 1)
    lo = int(pos)
    hi = min(lo + 1, n - 1)
    f = pos - lo
    return sorted_vals[lo] + (sorted_vals[hi] - sorted_vals[lo]) * f

def enc(vals):
    s = sorted(vals)
    halves = [int(round(pct(s, p) * 2)) for p in range(1, 100)]
    for i in range(1, len(halves)):
        if halves[i] < halves[i - 1]:
            halves[i] = halves[i - 1]
    return [halves[0]] + [halves[i] - halves[i - 1] for i in range(1, len(halves))]

out = {}
counts = {}
for k in sorted(buckets):
    s, b, d, t = buckets[k]
    n = len(t)
    counts[k] = n
    if n < MIN_N:
        continue
    out[k] = {'n': n, 't': enc(t), 's': enc(s), 'b': enc(b), 'd': enc(d)}

doc = {
    'source': 'OpenPowerlifting (www.openpowerlifting.org), bulk CSV ' + SOURCE_DATE + ', public domain',
    'data': SOURCE_DATE,
    'since': SINCE,
    'rule': 'Full-power (SBD) sanctioned meets from ' + SINCE + ' to ' + SOURCE_DATE + ', placed or guest lifters with a total; Raw = raw, Single-ply = equipped; '
            'IPF open class from the meet bodyweight; each lifter once per class, with their best squat, bench, deadlift and total.',
    'p': 'Percentiles 1 to 99 in 0.5 kg steps: the first value, then each step up from it',
    'b': out,
}
sys.stdout.write(json.dumps(doc, separators=(',', ':')))
sys.stderr.write(json.dumps(counts) + '\n')
