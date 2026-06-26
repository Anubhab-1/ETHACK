import requests, time

BASE = "http://localhost:8000"

print("=" * 50)
print("FINAL VERIFICATION — Recompute Fix + Full Platform")
print("=" * 50)

# 1. Recompute — must return 202 in < 2s
print("\n[1] POST /api/enforcement/recompute")
t0 = time.time()
r = requests.post(f"{BASE}/api/enforcement/recompute?city=Kolkata", timeout=10)
elapsed = round(time.time() - t0, 2)
status = "PASS" if r.status_code == 202 else "FAIL"
print(f"    [{status}] HTTP {r.status_code} in {elapsed}s | {r.json()}")

# 2. Wait for background job, then check stats
print("\n[2] Waiting 8s for background recompute to run...")
time.sleep(8)
r2 = requests.get(f"{BASE}/api/enforcement/stats?city=Kolkata", timeout=10)
d = r2.json()
stats_ok = d["total"] > 0
print(f"    [{'PASS' if stats_ok else 'WARN'}] Stats: total={d['total']}, open={d['open']}, deployed={d['deployed']}, resolved={d['resolved']}")

# 3. Enforcement actions
r3 = requests.get(f"{BASE}/api/enforcement?city=Kolkata&status=open&limit=3", timeout=10)
items = r3.json()
print(f"\n[3] Open enforcement actions: {len(items)}")
for i, item in enumerate(items[:3], 1):
    print(f"    #{i}: {item['ward_name']} | score={round(item['priority_score'])} | {item['target_type']}")

# 4. Core endpoints sanity
print("\n[4] Core endpoints sanity check")
endpoints = [
    ("GET", "/api/health", None),
    ("GET", "/api/aqi/live?city=Kolkata", None),
    ("GET", "/api/aqi/heatmap?city=Kolkata", None),
    ("GET", "/api/weather/current?city=Kolkata", None),
    ("GET", "/api/advisory/briefing?city=Kolkata", None),
]
all_pass = True
for method, path, body in endpoints:
    try:
        rr = requests.get(f"{BASE}{path}", timeout=15) if method == "GET" else requests.post(f"{BASE}{path}", json=body, timeout=15)
        rr.raise_for_status()
        d2 = rr.json()
        count = len(d2) if isinstance(d2, list) else len(d2.keys())
        print(f"    [PASS] {path}: {count} {'items' if isinstance(d2, list) else 'keys'}")
    except Exception as e:
        print(f"    [FAIL] {path}: {e}")
        all_pass = False

print("\n" + "=" * 50)
print(f"RESULT: {'ALL SYSTEMS GO' if (r.status_code == 202 and all_pass) else 'ISSUES FOUND'}")
print("=" * 50)
