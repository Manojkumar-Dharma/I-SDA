#!/usr/bin/env python3
"""Check that every keyword without a keywordSpec.js RECORD_TYPES entry is owned by exactly one
I-121 slice in the ledger in docs/sda-reference/keywordFixes.md (between the slice-ledger markers).

Run from the repo root:  python3 docs/sda-reference/keyword-index/check_spec_coverage.py
Exit status 1 if a keyword is owned by no slice or by more than one; keywords that are owned
but already have an entry are listed as information (that slice is done or partly done).
`*` parameters (for example *AUTOENT) are not keywords and are ignored.
"""
import json, re, subprocess, sys
from collections import defaultdict

LOOKUP = 'docs/sda-reference/keyword-index/KEYWORD-LOOKUP.json'
FIXES = 'docs/sda-reference/keywordFixes.md'

keywords = {k for k in json.load(open(LOOKUP, encoding='utf-8', errors='replace'))['keywords']
            if not k.startswith('*')}
specified = set(subprocess.check_output(
    ['node', '-e', "console.log(Object.keys(require('./src/keywordSpec.js').RECORD_TYPES).join(' '))"]
).decode().split())

text = open(FIXES, encoding='utf-8').read()
ledger = text.split('<!-- slice-ledger:start -->')[1].split('<!-- slice-ledger:end -->')[0]
owners = defaultdict(list)
for row in ledger.splitlines():
    m = re.match(r'\| \[(I-121[a-t])\]', row)
    if not m:
        continue
    cells = [c.strip() for c in row.strip('|').split('|')]
    for kw in re.findall(r'`([^`]+)`', cells[3]):
        owners[kw].append(m.group(1))

needed = keywords - specified
unowned = sorted(needed - set(owners))
multiple = sorted(k for k, v in owners.items() if len(v) > 1)
unknown = sorted(set(owners) - keywords)
done = sorted(k for k in owners if k in specified)

slices = defaultdict(list)
for kw, ids in owners.items():
    for i in ids:
        slices[i].append(kw)
print('slice progress (keywords with a RECORD_TYPES entry / keywords owned):')
for i in sorted(slices):
    n = sum(1 for k in slices[i] if k in specified)
    note = '  <- all specified: mark the slice Done' if n == len(slices[i]) else ''
    print('  %s  %d/%d%s' % (i, n, len(slices[i]), note))

print('keywords in lookup (no * parameters): %d, with a spec entry: %d, still needing one: %d'
      % (len(keywords), len(keywords & specified), len(needed)))
print('owned by a slice: %d' % len(owners))
if unowned:
    print('NOT OWNED BY ANY SLICE (%d): %s' % (len(unowned), ' '.join(unowned)))
if multiple:
    print('OWNED BY MORE THAN ONE SLICE: ' + ', '.join('%s (%s)' % (k, '/'.join(owners[k])) for k in multiple))
if unknown:
    print('in the ledger but not in KEYWORD-LOOKUP.json (typo?): %s' % ' '.join(unknown))
if done:
    print('already have a spec entry (slice done or partly done): %s' % ' '.join(done))
sys.exit(1 if (unowned or multiple or unknown) else 0)
