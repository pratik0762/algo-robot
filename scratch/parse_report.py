import json

with open('scratch/responsive_audit_report.json') as f:
    d = json.load(f)

print(f"Total audit runs: {len(d['results'])}")
overflows = []
double_scrolls = []
small_targets = {}

for r in d['results']:
    route = r['route']
    vp = r['viewport']
    sw = r['doc_scroll_width']
    w = r['width']
    if sw > w:
        overflows.append((route, vp, sw, w))
    if r.get('double_scrollbars_count', 0) > 0:
        double_scrolls.append((route, vp, r['double_scrollbars']))
    for t in r.get('small_touch_targets', []):
        key = f"{route}:{t['tag']}:{t['text']}"
        if key not in small_targets:
            small_targets[key] = (vp, t['w'], t['h'])

print(f"Total Document Overflow findings: {len(overflows)}")
for o in overflows:
    print("  Overflow:", o)

print(f"Total Double Scrollbar findings: {len(double_scrolls)}")
for ds in double_scrolls:
    print("  Double scroll:", ds)

print(f"Unique Small Touch Targets on Mobile/Tablet (<32px): {len(small_targets)}")
for k, v in list(small_targets.items())[:15]:
    print(f"  {k} -> {v}")

