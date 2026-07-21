"""
AETHER — Forecast Model Admin API
Provides simple metadata listing for stored model artifacts (XGBoost JSON, ST-GCN weights).
"""
from __future__ import annotations

import logging
from datetime import datetime
from pathlib import Path
import re

from fastapi import APIRouter

logger = logging.getLogger(__name__)
router = APIRouter()


MODEL_DIR = Path(__file__).parent.parent.parent / "models"


def _parse_model_filename(fname: str) -> dict:
    # Examples: kolkata_24h.json, st_gcn_weights.pt
    m = re.match(r"(?P<city>[a-zA-Z]+)_(?P<horizon>\d+h)\.(?P<ext>json|pb|bin)$", fname)
    if m:
        return {"city": m.group("city"), "horizon": m.group("horizon"), "file": fname}
    if fname.endswith(".pt") or fname.endswith(".pth"):
        return {"model": "st_gcn", "file": fname}
    return {"file": fname}


@router.get("/api/models")
def list_models():
    """List model artifacts with basic metadata."""
    if not MODEL_DIR.exists():
        return {"models": []}

    results = []
    for p in sorted(MODEL_DIR.iterdir()):
        if not p.is_file():
            continue
        stat = p.stat()
        info = _parse_model_filename(p.name)
        info.update({
            "filename": p.name,
            "size_bytes": stat.st_size,
            "modified_at": datetime.fromtimestamp(stat.st_mtime).isoformat(),
            "path": str(p.resolve()),
        })
        # Attach metrics payload if available (e.g. kolkata_24h.metrics.json)
        try:
            import json
            metrics_name = p.with_suffix("").name + ".metrics.json" if p.suffix != ".json" else p.stem + ".metrics.json"
            metrics_path = MODEL_DIR / metrics_name
            if metrics_path.exists():
                with open(metrics_path, "r", encoding="utf-8") as mf:
                    info_metrics = json.load(mf)
                info["metrics"] = info_metrics
        except Exception:
            pass

        results.append(info)

    return {"models": results}
