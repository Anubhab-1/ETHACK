"""
AETHER -- Full Platform Functional Audit Script
Tests every backend API endpoint and reports pass/fail with response data.
"""
import requests
import json
import sys
import os

os.environ['PYTHONIOENCODING'] = 'utf-8'

BASE = "http://localhost:8000"
PASS = "[PASS]"
FAIL = "[FAIL]"
WARN = "[WARN]"

results = []

def test(name, fn):
    try:
        result = fn()
        print(f"{PASS} {name}: {result}")
        results.append((name, True, str(result)))
    except Exception as e:
        print(f"{FAIL} {name}: {e}")
        results.append((name, False, str(e)))

def get(path, **params):
    r = requests.get(f"{BASE}{path}", params=params, timeout=20)
    r.raise_for_status()
    return r.json()

def post(path, body):
    r = requests.post(f"{BASE}{path}", json=body, timeout=20)
    r.raise_for_status()
    return r.json()

print("\n" + "="*60)
print("AETHER FUNCTIONAL AUDIT -- All API Endpoints")
print("="*60 + "\n")

# 1. Health
test("GET /api/health", lambda: f"status={get('/api/health')['status']}")

# 2. Cities
test("GET /api/cities", lambda: f"{len(get('/api/cities'))} cities")

# 3. Live AQI - Kolkata
def check_live_kolkata():
    d = get('/api/aqi/live', city='Kolkata')
    valid = [s for s in d if s['aqi'] is not None]
    avg = round(sum(s['aqi'] for s in valid)/max(1,len(valid)))
    return f"{len(d)} stations, {len(valid)} with AQI, avg={avg}"
test("GET /api/aqi/live?city=Kolkata", check_live_kolkata)

# 4. Live AQI - Delhi
def check_live_delhi():
    d = get('/api/aqi/live', city='Delhi')
    valid = [s for s in d if s['aqi'] is not None]
    return f"{len(d)} stations, {len(valid)} with AQI"
test("GET /api/aqi/live?city=Delhi", check_live_delhi)

# 5. Live AQI - Mumbai
def check_live_mumbai():
    d = get('/api/aqi/live', city='Mumbai')
    valid = [s for s in d if s['aqi'] is not None]
    return f"{len(d)} stations, {len(valid)} with AQI"
test("GET /api/aqi/live?city=Mumbai", check_live_mumbai)

# 6. Heatmap - Kolkata
test("GET /api/aqi/heatmap?city=Kolkata", lambda: f"{len(get('/api/aqi/heatmap', city='Kolkata'))} wards")

# 7. Heatmap - Delhi
test("GET /api/aqi/heatmap?city=Delhi", lambda: f"{len(get('/api/aqi/heatmap', city='Delhi'))} wards")

# 8. Heatmap - Mumbai
test("GET /api/aqi/heatmap?city=Mumbai", lambda: f"{len(get('/api/aqi/heatmap', city='Mumbai'))} wards")

# 9. Wards list
def check_wards():
    d = get('/api/wards', city='Kolkata')
    return f"{len(d)} wards, first={d[0]['name'] if d else 'none'}"
test("GET /api/wards?city=Kolkata", check_wards)

# 10. Ward detail
def check_ward_detail():
    wards = get('/api/wards', city='Kolkata')
    if not wards: raise Exception("No wards found")
    wid = wards[0]['id']
    d = get(f'/api/wards/{wid}')
    return f"ward={d['name']}, aqi={d['aqi']}, pop={d['population']}, hospitals={d['hospital_count']}, schools={d['school_count']}"
test("GET /api/wards/{id}", check_ward_detail)

# 11. Forecast
def check_forecast():
    d = get('/api/forecast', lat=22.5626, lon=88.3630, city='Kolkata', hours=72)
    fc = d['forecasts']
    return f"ward={d['ward_name']}, {len(fc)} points, +24h={round(fc[0]['predicted_aqi']) if fc else 'N/A'}, +72h={round(fc[-1]['predicted_aqi']) if fc else 'N/A'}"
test("GET /api/forecast", check_forecast)

# 12. Attribution
def check_attribution():
    wards = get('/api/wards', city='Kolkata')
    if not wards: raise Exception("No wards")
    wid = wards[0]['id']
    d = get(f'/api/attribution/{wid}')
    breakdown_str = ", ".join(f"{k}={v}%" for k,v in list(d['breakdown'].items())[:3])
    return f"primary={d['primary_source']}, confidence={d['confidence']}%, [{breakdown_str}]"
test("GET /api/attribution/{id}", check_attribution)

# 13. Enforcement list
def check_enforcement():
    d = get('/api/enforcement', city='Kolkata', limit=10, status='open')
    return f"{len(d)} open actions" + (f", top={d[0]['ward_name']} score={round(d[0]['priority_score'])}" if d else "")
test("GET /api/enforcement?city=Kolkata&status=open", check_enforcement)

# 14. Enforcement stats
def check_enf_stats():
    d = get('/api/enforcement/stats', city='Kolkata')
    return f"total={d['total']}, open={d['open']}, deployed={d['deployed']}, resolved={d['resolved']}"
test("GET /api/enforcement/stats?city=Kolkata", check_enf_stats)

# 15. Recompute enforcement
def check_recompute():
    r = requests.post(f"{BASE}/api/enforcement/recompute?city=Kolkata", timeout=30)
    r.raise_for_status()
    return f"HTTP {r.status_code} OK"
test("POST /api/enforcement/recompute", check_recompute)

# 16. Weather
def check_weather():
    d = get('/api/weather/current', city='Kolkata')
    return f"temp={d['temp_c']}C, wind={d['wind_speed']}km/h @ {d['wind_dir']}deg, humidity={d['humidity_pct']}%"
test("GET /api/weather/current?city=Kolkata", check_weather)

# 17. Weather Delhi
def check_weather_delhi():
    d = get('/api/weather/current', city='Delhi')
    return f"temp={d['temp_c']}C, wind={d['wind_speed']}km/h"
test("GET /api/weather/current?city=Delhi", check_weather_delhi)

# 18. Advisory ask
def check_advisory():
    d = post('/api/advisory/ask', {
        "question": "Is it safe to go outside today?",
        "language": "en",
        "lat": 22.5626,
        "lon": 88.3630
    })
    return f"aqi={d['aqi']}, cat={d['category']}, answer_len={len(d['answer'])} chars, session={d.get('session_id','?')[:8]}"
test("POST /api/advisory/ask (English)", check_advisory)

# 19. Advisory - Bengali
def check_advisory_bn():
    d = post('/api/advisory/ask', {
        "question": "আজ বাইরে যাওয়া কি নিরাপদ?",
        "language": "bn"
    })
    return f"lang=bn, aqi={d['aqi']}, answer_len={len(d['answer'])} chars"
test("POST /api/advisory/ask (Bengali)", check_advisory_bn)

# 20. Advisory - Hindi
def check_advisory_hi():
    d = post('/api/advisory/ask', {
        "question": "क्या आज बाहर जाना सुरक्षित है?",
        "language": "hi"
    })
    return f"lang=hi, aqi={d['aqi']}, answer_len={len(d['answer'])} chars"
test("POST /api/advisory/ask (Hindi)", check_advisory_hi)

# 21. AI Briefing
def check_briefing():
    d = get('/api/advisory/briefing', city='Kolkata')
    return f"briefing_len={len(d['briefing'])} chars"
test("GET /api/advisory/briefing?city=Kolkata", check_briefing)

# 22. Multi-Agent Committee
def check_agents():
    wards = get('/api/wards', city='Kolkata')
    if not wards: raise Exception("No wards")
    wid = wards[0]['id']
    d = post(f'/api/agents/simulation?ward_id={wid}', {})
    return f"ward={d['ward_name']}, {len(d['dialogue'])} dialogue turns, decree_len={len(d['decree'])} chars"
test("POST /api/agents/simulation", check_agents)

# 23. Digital Twin Simulation
def check_simulation():
    wards = get('/api/wards', city='Kolkata')
    if not wards: raise Exception("No wards")
    wid = wards[0]['id']
    d = post('/api/simulation/evaluate', {
        "ward_id": wid,
        "traffic_reduction": 50,
        "construction_halt": True,
        "industrial_restriction": 30,
        "wind_speed": 8.5,
        "wind_dir": 180
    })
    results_count = len(d['results'])
    if d['results']:
        sample = d['results'][0]
        drop = round(sample['original_aqi'] - sample['simulated_aqi'])
        return f"{results_count} wards simulated, wind={d['wind_speed']}km/h@{d['wind_dir']}deg, sample_drop={drop} AQI pts"
    return f"{results_count} wards simulated"
test("POST /api/simulation/evaluate", check_simulation)

# 24. Satellite Calibration
def check_calibrate():
    d = get('/api/simulation/calibrate', city='Kolkata')
    return f"R2={d['r_squared']}, pearson_r={d['pearson_r']}, {len(d['points'])} calibration points, slope={d['slope']}"
test("GET /api/simulation/calibrate?city=Kolkata", check_calibrate)

# 25. Sensor Diagnostics
def check_diagnostics():
    d = get('/api/aqi/diagnostics', city='Kolkata')
    alerts = d.get('alerts', [])
    by_status = {}
    for a in alerts:
        by_status[a['status']] = by_status.get(a['status'], 0) + 1
    status_str = ", ".join(f"{k}={v}" for k,v in by_status.items())
    return f"score={d['score']}, {len(alerts)} stations [{status_str}]"
test("GET /api/aqi/diagnostics?city=Kolkata", check_diagnostics)

# 26. Broadcast alert (on first deployed action)
def check_broadcast():
    actions = get('/api/enforcement', city='Kolkata', limit=5, status='deployed')
    if not actions:
        # deploy one first
        open_actions = get('/api/enforcement', city='Kolkata', limit=3, status='open')
        if not open_actions:
            raise Exception("No enforcement actions to broadcast")
        aid = open_actions[0]['id']
        post(f'/api/enforcement/{aid}/action', {"status": "deployed"})
        actions = get('/api/enforcement', city='Kolkata', limit=5, status='deployed')
    if not actions:
        raise Exception("Could not find deployed action")
    aid = actions[0]['id']
    d = post(f'/api/enforcement/{aid}/broadcast', {})
    return f"action_id={aid}, alerts_sent={d.get('alerts_sent')}, confirmed={d.get('alerts_confirmed')}, updated={d.get('updated')}"
test("POST /api/enforcement/{id}/broadcast", check_broadcast)

# 27. Alert confirm receipt
def check_confirm():
    actions = get('/api/enforcement', city='Kolkata', limit=3, status='deployed')
    if not actions: raise Exception("No deployed actions")
    aid = actions[0]['id']
    d = post(f'/api/enforcement/{aid}/alert/confirm', {})
    return f"action={aid}, sent={d.get('alerts_sent')}, confirmed={d.get('alerts_confirmed')}, ratio={d.get('ratio')}"
test("POST /api/enforcement/{id}/alert/confirm", check_confirm)

# ─── Summary ────────────────────────────────────────────────────────
print("\n" + "="*60)
passed = sum(1 for _, ok, _ in results if ok)
failed = sum(1 for _, ok, _ in results if not ok)
total = len(results)
print(f"AUDIT COMPLETE: {passed}/{total} passed  |  {failed} failed")
print("="*60)

if failed > 0:
    print("\nFAILED TESTS:")
    for name, ok, msg in results:
        if not ok:
            print(f"  {FAIL} {name}")
            print(f"         {msg[:200]}")

sys.exit(0 if failed == 0 else 1)
