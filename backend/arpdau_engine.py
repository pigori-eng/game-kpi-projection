# -*- coding: utf-8 -*-
"""V13.6 P4a: ARPDAU Engine — P4-G1(Recipe Contract) + P4-G2(region+LOFO) 반영.
상태: Candidate Monetization Engine (Shadow A/B P4-G3 통과 전 /projection 미연결)."""
import json, os
import numpy as np
from typing import List, Dict, Any, Optional

_DATA = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data")
# G1: recipe 분리 — B2P package는 F2P IAP pool에 절대 유입 금지
# G2: region_group 축 추가 + family (LOFO)
_META = {
 "PUBG (PC/F2P/2022)":       ("live_f2p_iap","Battle Royale","PC","GLOBAL","pubg_pc"),
 "PUBGM (KR+JP/Launch-2019)":("launch_f2p_iap","Battle Royale","Mobile","KR_JP","pubgm"),
 "PUBGM (KR+JP/Stable-2022)":("live_f2p_iap","Battle Royale","Mobile","KR_JP","pubgm"),
 "DNDM (NA)":  ("launch_f2p_iap","Extraction Shooter","Mobile","NA","dndm"),
 "DNDM (SEA)": ("launch_f2p_iap","Extraction Shooter","Mobile","SEA","dndm"),
 "DNDM (SA)":  ("launch_f2p_iap","Extraction Shooter","Mobile","SA","dndm"),
 "PUBG (PC/B2P/2018)":  ("launch_b2p_package","Battle Royale","PC","GLOBAL","pubg_pc"),
 "PUBG (Console/2017)": ("launch_b2p_package","Battle Royale","Console","GLOBAL","pubg_console"),
 "inZOI":               ("launch_b2p_package","Simulation","PC","GLOBAL","inzoi"),
}
RECIPE_COMPAT = {"launch_f2p_iap": {"launch_f2p_iap","live_f2p_iap"},
                 "live_f2p_iap": {"live_f2p_iap","launch_f2p_iap"},
                 "launch_b2p_package": {"launch_b2p_package"},
                 # V13.7 J: Hybrid는 IAP 부분만 F2P pool과 호환 (DLC 매출은 별도 basis — 라벨 명시)
                 "hybrid_f2p_dlc": {"hybrid_f2p_dlc","launch_f2p_iap","live_f2p_iap"}}

def build_arpdau_priors(exclude_family: Optional[str] = None) -> Dict[str, Any]:
    raw = json.load(open(os.path.join(_DATA, "raw_game_data.json"), encoding="utf-8"))
    rows = []
    for g, a in raw.get("actuals", {}).items():
        if g not in _META: continue
        recipe, gen, plat, reg, fam = _META[g]
        if exclude_family and fam == exclude_family: continue  # G2: True LOFO
        dau, rev = a["dau"], a["revenue_krw"]
        curve = []
        for m in range(min(len(dau), 365)//30):
            d = sum(dau[m*30:(m+1)*30]); r = sum(rev[m*30:(m+1)*30])
            curve.append(r/d if d > 0 else 0)
        if curve:
            rows.append({"game": g, "recipe": recipe, "genre": gen, "platform": plat,
                         "region": reg, "family": fam, "curve": curve})
    return {"rows": rows, "excluded_family": exclude_family,
            "note": "Observed Calendar ARPDAU Reference (launch-age 정렬은 P4b)"}

def _pool_curve(rows: List[dict], days: int, pct: float) -> Optional[List[float]]:
    if not rows: return None
    n = max(len(r["curve"]) for r in rows)
    out = []
    for d in range(days):
        m = min(d//30, n-1)
        vals = [r["curve"][m] for r in rows if len(r["curve"]) > m]
        vals = vals or [r["curve"][-1] for r in rows]
        out.append(float(np.percentile(vals, pct)))
    return out

def get_arpdau_curve(recipe: str, genre: str, platform: str, region_group: str = "GLOBAL",
                     percentile: str = "p50", days: int = 365,
                     exclude_family: Optional[str] = None) -> Dict[str, Any]:
    """G2 계층 pooled fallback: L0 recipe+genre+platform+region → L1 +platform → L2 +genre → L3 recipe-compat 전체"""
    pri = build_arpdau_priors(exclude_family)
    compat = RECIPE_COMPAT.get(recipe, {recipe})
    base = [r for r in pri["rows"] if r["recipe"] in compat]  # G1: recipe 격리
    pct = {"p25": 25, "p50": 50, "p75": 75}[percentile]
    levels = [
        (0, [r for r in base if r["genre"]==genre and r["platform"]==platform and r["region"]==region_group]),
        (1, [r for r in base if r["genre"]==genre and r["platform"]==platform]),
        (2, [r for r in base if r["genre"]==genre]),
        (3, base)]
    for lvl, rows in levels:
        c = _pool_curve(rows, days, pct)
        if c:
            return {"arpdau_daily_krw": c, "recipe": recipe, "fallback_level": lvl,
                    "n_games": len(rows), "games": [r["game"] for r in rows],
                    "region_group": region_group, "excluded_family": exclude_family,
                    "causal_lifts": {"cross_mode": 1.00, "cross_platform": 1.00}}
    return {"arpdau_daily_krw": [0.0]*days, "recipe": recipe, "fallback_level": 99,
            "n_games": 0, "warning": "compatible pool 없음 — 예측 불가"}

def revenue_forecast(dau: List[float], recipe: str, genre: str, platform: str,
                     region_group: str = "GLOBAL", percentile: str = "p50",
                     exclude_family: Optional[str] = None) -> Dict[str, Any]:
    """F2P: DAU×ARPDAU. B2P recipe는 이 함수 사용 금지 → NRU×price 경로."""
    if recipe == "launch_b2p_package":
        raise ValueError("B2P는 revenue_forecast(DAU×ARPDAU) 사용 금지 — Package(NRU×price) 경로 사용")
    c = get_arpdau_curve(recipe, genre, platform, region_group, percentile, len(dau), exclude_family)
    rev = [d*a for d, a in zip(dau, c["arpdau_daily_krw"])]
    return {"daily_revenue_krw": rev, "cumulative": float(sum(rev)), "arpdau_meta": c,
            "seasonality_note": "ARPDAU 경로는 monetization seasonality 미적용 (double-count 방지, 피드백9 #13)"}

# P4.6 → 정직한 명칭/기능으로 축소 (retention/EX lever는 Orchestrator=P4-G4로 이관)
SCENARIO_LEVERS = {"downside": {"arpdau_pct": "p25", "wave_scale_mult": 0.7},
                   "base": {"arpdau_pct": "p50", "wave_scale_mult": 1.0},
                   "upside": {"arpdau_pct": "p75", "wave_scale_mult": 1.3}}
def monetization_scenario_envelope(dau: List[float], recipe: str, genre: str,
                                    platform: str, region_group: str = "GLOBAL") -> Dict[str, Any]:
    out = {"label": "Monetization Scenario Envelope (ARPDAU pctl × Wave scale — 통계 P10/P90 아님)",
           "scope_note": "retention/EX adoption lever는 Decision Scenario Orchestrator(P4-G4)에서 DAU 재계산으로 적용 예정",
           "region_note": "percentile은 동일 region_group 내 분포 — 지역 믹스와 성과를 혼동 금지 (피드백9 #5)",
           "scenarios": {}}
    for name, lv in SCENARIO_LEVERS.items():
        f = revenue_forecast(dau, recipe, genre, platform, region_group, lv["arpdau_pct"])
        out["scenarios"][name] = {"cumulative_revenue_krw": f["cumulative"]*lv["wave_scale_mult"], "levers": lv}
    return out
