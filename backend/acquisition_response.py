# -*- coding: utf-8 -*-
"""V14.2.0 Cycle 3-3: UA CPI Response Curve JSON 인터페이스 (shadow only — 공식 미반영)"""
import json, os
from typing import Dict, Any, Optional

CURVES_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "data", "ua_cpi_curves.json")

def load_cpi_curves() -> Dict[str, Any]:
    if not os.path.exists(CURVES_PATH):
        return {"curves": []}
    return json.load(open(CURVES_PATH))

def validate_cpi_curve(curve: Dict) -> Dict[str, Any]:
    pts = curve.get("points", [])
    warnings, ok = [], True
    if len(pts) < 2:
        return {"valid": False, "warnings": ["points < 2"]}
    spends = [p["daily_spend_krw"] for p in pts]
    cpis = [p["expected_cpi"] for p in pts]
    if any(s2 <= s1 for s1, s2 in zip(spends, spends[1:])):
        ok = False; warnings.append("spend 오름차순 위반 — interpolation 불가")
    if any(c <= 0 for c in cpis):
        ok = False; warnings.append("CPI ≤ 0 존재")
    drops = [(c2 - c1) / c1 for c1, c2 in zip(cpis, cpis[1:])]
    if any(d < -0.15 for d in drops):
        warnings.append("⚠ spend 증가 구간에서 CPI 15%+ 하락 — 비정상 효율 개선 검토 필요")
    if curve.get("status") != "shadow":
        warnings.append("status != shadow — 공식 반영은 Gate 통과 전 금지 (shadow 강제 처리)")
    return {"valid": ok, "warnings": warnings}

def interpolate_cpi(curve: Dict, daily_spend_krw: float) -> float:
    pts = sorted(curve["points"], key=lambda p: p["daily_spend_krw"])
    if daily_spend_krw <= pts[0]["daily_spend_krw"]:
        return float(pts[0]["expected_cpi"])
    if daily_spend_krw >= pts[-1]["daily_spend_krw"]:
        return float(pts[-1]["expected_cpi"])
    for a, b in zip(pts, pts[1:]):
        if a["daily_spend_krw"] <= daily_spend_krw <= b["daily_spend_krw"]:
            t = (daily_spend_krw - a["daily_spend_krw"]) / (b["daily_spend_krw"] - a["daily_spend_krw"])
            return float(a["expected_cpi"] + t * (b["expected_cpi"] - a["expected_cpi"]))
    return float(pts[-1]["expected_cpi"])

def spend_to_installs_with_curve(total_budget_krw: float, days: int,
                                  curve_id: Optional[str], static_cpi: float) -> Dict[str, Any]:
    """shadow 비교 — curve 없으면 static fallback"""
    daily = total_budget_krw / max(1, days)
    static_installs = int(total_budget_krw / static_cpi)
    curves = {c["curve_id"]: c for c in load_cpi_curves().get("curves", [])}
    if not curve_id or curve_id not in curves:
        return {"mode": "static_cpi_fallback", "installs": static_installs,
                "effective_cpi": static_cpi, "note": "curve 미지정/미발견 — static CPI 사용"}
    curve = curves[curve_id]
    v = validate_cpi_curve(curve)
    if not v["valid"]:
        return {"mode": "static_cpi_fallback", "installs": static_installs,
                "effective_cpi": static_cpi, "note": "curve validation 실패 — static fallback",
                "warnings": v["warnings"]}
    eff_cpi = interpolate_cpi(curve, daily)
    return {"mode": "response_curve_shadow", "installs": int(total_budget_krw / eff_cpi),
            "effective_cpi": round(eff_cpi), "static_installs": static_installs,
            "delta_vs_static": int(total_budget_krw / eff_cpi) - static_installs,
            "curve_id": curve_id, "warnings": v["warnings"],
            "note": "SHADOW — 공식 NRU에 미반영 (acquisition_owner=static_cpi 유지)"}
