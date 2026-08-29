# -*- coding: utf-8 -*-
"""V14.2.0 Cycle 4: Alpha/CBT Actual Import (dry-run → confirm — Replace API 위에 얹음)"""
from typing import Dict, Any, List

SUPPORTED_VARS = {
    "target_d1": {"maps_to": "target_d1", "range": (0.05, 0.9)},
    "prereg_activation_rate": {"maps_to": "prereg_activation_rate", "range": (0.0, 1.0)},
    "organic_share": {"maps_to": "organic_share_of_total", "range": (0.0, 0.9)},
    "organic_share_of_total": {"maps_to": "organic_share_of_total", "range": (0.0, 0.9)},
}
CSV_COLUMNS = ["metric", "value", "status", "source", "sample_n", "date"]

def validate_actuals(actuals: List[Dict]) -> Dict[str, Any]:
    valid, rejected = [], []
    for a in actuals:
        var = a.get("variable") or a.get("metric")
        if var not in SUPPORTED_VARS:
            rejected.append({"variable": var, "reason": f"미지원 변수 (지원: {list(SUPPORTED_VARS)})"})
            continue
        spec = SUPPORTED_VARS[var]
        try:
            v = float(a["value"])
        except Exception:
            rejected.append({"variable": var, "reason": "value 숫자 아님"}); continue
        lo, hi = spec["range"]
        if not (lo <= v <= hi):
            rejected.append({"variable": var, "reason": f"범위 위반 [{lo},{hi}]: {v}"}); continue
        if a.get("status") == "measured" and not a.get("sample_n"):
            rejected.append({"variable": var, "reason": "measured에는 sample_n 필수"}); continue
        valid.append({"variable": spec["maps_to"], "value": v,
                      "status": a.get("status", "measured"), "source": a.get("source"),
                      "sample_n": a.get("sample_n"), "date": a.get("date")})
    return {"valid": valid, "rejected": rejected}

def csv_templates() -> Dict[str, str]:
    return {
        "actual_retention.csv": "metric,value,status,source,sample_n,date\n"
            "target_d1,0.44,measured,GW Alpha Cohort,32418,2029-01-15\n",
        "actual_prereg_activation.csv": "metric,value,status,source,sample_n,date\n"
            "prereg_activation_rate,0.37,measured,GW Pre-reg Tracking,5000000,2029-03-10\n",
        "actual_monetization.csv": "metric,value,status,source,sample_n,date,platform,region\n"
            "organic_share,0.33,measured,Soft Launch Attribution,180000,2029-04-01,Mobile,KR\n",
    }
