"""
Simple verification script for frontend-backend integration.
Calls key backend endpoints and reports statuses.
"""
import sys
import requests
import json

BASE = "http://localhost:8000"

def call(path, params=None):
    url = BASE + path
    try:
        r = requests.get(url, params=params, timeout=5)
        r.raise_for_status()
        return r.json()
    except Exception as e:
        print(f"ERROR calling {url}: {e}")
        return None


def main():
    ok = True
    print("Checking /api/health...")
    h = call("/api/health")
    if not h:
        ok = False
    else:
        print("  OK:", h)

    print("Checking /api/models...")
    m = call("/api/models")
    if m is None:
        ok = False
    else:
        print(f"  Found {len(m.get('models', []))} model(s)")

    print("Checking /api/aqi/heatmap?city=Kolkata...")
    hm = call("/api/aqi/heatmap", {"city": "Kolkata"})
    if hm is None:
        ok = False
    else:
        print(f"  Heatmap points: {len(hm)}")

    print("Checking /api/forecast (sample)...")
    fc = call("/api/forecast", {"lat": 22.5726, "lon": 88.3639, "city": "Kolkata", "hours": 24})
    if fc is None:
        ok = False
    else:
        print(f"  Forecast for ward: {fc.get('ward_name')} ({len(fc.get('forecasts', []))} points)")

    # If we have a ward_id, try advanced endpoint
    ward_id = fc.get('ward_id') if fc else None
    if ward_id:
        print(f"Checking /api/forecast-advanced/{ward_id}...")
        adv = call(f"/api/forecast-advanced/{ward_id}", {"hours": 24})
        if adv is None:
            ok = False
        else:
            print(f"  Advanced model: {adv.get('model')} predictions: {len(adv.get('predictions', []))}")

    print("Summary:")
    if ok:
        print("All checks passed.")
        return 0
    else:
        print("One or more checks failed. See errors above.")
        return 2

if __name__ == '__main__':
    sys.exit(main())
