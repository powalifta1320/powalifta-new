# Check the shipped percentile table (night C): every group whole and rising, and the demo lifter's numbers placed
# by a separate method (numpy-free: count of the 99 points under the value, then the fraction to the next).
import json, sys
d = json.load(open(sys.argv[1]))
ok = True
def say(c, m):
    global ok
    ok = ok and c
    print(('PASS ' if c else 'FAIL ') + m)
say(d.get('source', '').startswith('OpenPowerlifting') and len(d.get('data', '')) == 10 and d.get('since') == '2021-01-01', 'source, data date (' + d.get('data', '') + ') and window in the file')
groups = d['b']
say(len(groups) == 32, '32 groups (2 sexes x raw/equipped x 8 IPF classes): %d' % len(groups))
for k, g in groups.items():
    for col in 'tsbd':
        st = g[col]
        if len(st) != 99 or any((not isinstance(x, int)) or x < 0 for x in st):
            say(False, k + ' ' + col + ' broken'); break
    if g['n'] < 100: say(False, k + ' under 100 lifters')
say(ok, 'every group: 4 lists of 99 whole non-negative steps, 100+ lifters')
def vals(st):
    out, v = [], 0
    for i, x in enumerate(st):
        v = x if i == 0 else v + x
        out.append(v / 2)
    return out
def rank(v, x):
    under = sum(1 for p in v if p < x)          # points strictly under
    if under == 0: return 0 if x < v[0] else 1
    if under == 99: return 99
    lo, hi = v[under - 1], v[under]
    return int(under + (x - lo) / (hi - lo) if hi > lo else under)
g = groups['M|raw|83']
t, s, b, dl = vals(g['t']), vals(g['s']), vals(g['b']), vals(g['d'])
print('M raw 83 medians (24 Oct 2026 data: 520 / 185 / 120 / 215 kg):', t[49], s[49], b[49], dl[49])
say(all(v[i] <= v[i + 1] for v in (t, s, b, dl) for i in range(98)), 'M raw 83: every list rises')
r = (rank(t, 593.3), rank(s, 207.1), rank(b, 134.4), rank(dl, 251.8))
print('demo lifter (83 kg, e1RMs 593.3 / 207.1 / 134.4 / 251.8):', r)
size = len(open(sys.argv[1], 'rb').read())
say(size < 60000, 'file size %d bytes (under 60 KB)' % size)
print('ALL PASSED' if ok else 'FAILED')
