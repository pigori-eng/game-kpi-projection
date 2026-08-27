# -*- coding: utf-8 -*-
"""
V13 P2.5: External Evidence Layer — 물리 분리 모듈
원칙 (Freeze 사양):
  - 이 모듈의 어떤 출력도 절대값 계산(P50/Conformal/BEP)에 진입하지 않는다
  - 산출물: Peer Percentile / Tail Class / Lifecycle Envelope Warning / Reliability Evidence
  - Isolation Test A/B가 이 격리를 회귀 검증한다
"""
import json
import os
from typing import List, Dict, Any, Optional
from bisect import bisect_left

_EV_PATH = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data", "external_evidence.json")
_EV_CACHE = None


def load_evidence(force: bool = False) -> Dict[str, Any]:
    global _EV_CACHE
    if _EV_CACHE is None or force:
        try:
            with open(_EV_PATH, "r", encoding="utf-8") as f:
                _EV_CACHE = json.load(f)
        except FileNotFoundError:
            _EV_CACHE = {}
    return _EV_CACHE


def _percentile_of(sorted_vals: List[float], v: float) -> float:
    if not sorted_vals:
        return 0.5
    return bisect_left(sorted_vals, v) / len(sorted_vals)


GENRE_TO_PEER_SET = {
    "Battle Royale": "shooter_pc_v1",
    "Extraction Shooter": "shooter_pc_v1",
    "FPS/TPS": "shooter_pc_v1",
}


def get_peer_set(genre: str) -> Dict[str, Any]:
    """계층적 fallback: 장르 매핑 peer set → all_games_v1"""
    ev = load_evidence()
    sets = ev.get("peer_sets", {})
    ps_id = GENRE_TO_PEER_SET.get(genre)
    if ps_id and ps_id in sets:
        return sets[ps_id]
    return sets.get("all_games_v1", {"peer_set_id": "none", "sample_n": 0})


def tail_class(genre: str, internal_d28_over_d7: Optional[float]) -> Dict[str, Any]:
    """내부 커브의 tail(D28/D7)이 외부 peer 분포에서 어디쯤인지 — Evidence 표시 전용"""
    ps = get_peer_set(genre)
    q = ps.get("tail_28_7_quartiles")
    out = {"peer_set_id": ps.get("peer_set_id"), "peer_n": ps.get("sample_n", 0),
           "peer_tail_quartiles": q, "internal_tail": internal_d28_over_d7,
           "class": None, "note": "relative evidence only — 절대값 보정 없음"}
    if q and internal_d28_over_d7 is not None:
        if internal_d28_over_d7 >= q["p75"]:
            out["class"] = "Strong"
        elif internal_d28_over_d7 >= q["p25"]:
            out["class"] = "Median"
        else:
            out["class"] = "Weak"
    return out


def lifecycle_envelope_check(daily_dau: List[float], genre: str) -> Dict[str, Any]:
    """
    프로젝션 DAU를 30일 블록 월평균으로 접어 M1=1.0 정규화 후
    Shooter launch envelope(p25~p75)와 shape 비교. WARNING ONLY — 자동보정 금지.
    [V13.1] 정의 정합: 프로젝션은 런칭일 D1부터 시작 → M1=D1~D30이 곧 첫 완전월.
    외부 envelope의 M1은 첫 완전 calendar month (partial-month 편향 제거 완료).
    장르 게이팅: Shooter 계열(peer set 매핑 존재)에만 적용 — 타 장르는 applicable=False.
    """
    ev = load_evidence()
    env = ev.get("lifecycle_envelope", {})
    horizons = env.get("horizons", {})
    genre_applicable = genre in GENRE_TO_PEER_SET  # V13.1: Shooter 계열만
    out = {"peer_set_id": env.get("peer_set_id"),
           "m1_definition": "projection: D1-D30 (launch start = full month) / external: first_full_calendar_month",
           "normalized": {}, "envelope": horizons, "warnings": [],
           "applicable": bool(horizons) and genre_applicable,
           "genre_gated": not genre_applicable}
    if not daily_dau or not horizons or not genre_applicable:
        return out
    months = []
    for m in range(len(daily_dau) // 30):
        block = daily_dau[m * 30:(m + 1) * 30]
        months.append(sum(block) / len(block))
    if not months or months[0] <= 0:
        return out
    norm = [m / months[0] for m in months]
    for i, v in enumerate(norm[:12], 1):
        out["normalized"][f"M{i}"] = round(v, 4)
        h = horizons.get(f"M{i}")
        if h and i >= 3:  # M1~2는 정의상 근접, M3+부터 비교 의미
            if v > h["p75"] * 1.15:
                out["warnings"].append(
                    f"M{i} 정규화 DAU {v:.2f}가 Shooter 런칭 envelope p75({h['p75']:.2f}, n={h['n']}) 대비 높음 — tail 낙관 가능성")
            elif v < h["p25"] * 0.85:
                out["warnings"].append(
                    f"M{i} 정규화 DAU {v:.2f}가 envelope p25({h['p25']:.2f}, n={h['n']}) 대비 낮음 — tail 비관 가능성")
    return out


def peer_percentile_summary(genre: str, d1: Optional[float] = None,
                             d7: Optional[float] = None, d28: Optional[float] = None) -> Dict[str, Any]:
    """
    [V13.1] Peer Percentile 실계산: 예측 커브의 D1/D7/D28이 외부 peer 분포 내 어느 위치인지.
    ⚠ 정의 불일치(내부=first-party cohort vs 외부=panel) → 위치는 참고용 Evidence, 절대 비교 금지.
    """
    ps = get_peer_set(genre)
    out = {"peer_set_id": ps.get("peer_set_id"), "benchmark_version": ps.get("benchmark_version"),
           "sample_n": ps.get("sample_n", 0),
           "definition_caveat": "내부/외부 리텐션 정의 상이 — percentile은 방향성 참고 전용 (RELATIVE_ONLY)",
           "percentiles": {}}
    for label, v in [("d1", d1), ("d7", d7), ("d28", d28)]:
        arr = ps.get(f"{label}_sorted")
        if arr and v is not None:
            out["percentiles"][label] = round(_percentile_of(arr, v), 2)
    return out


def tam_check(genre: str, projected_peak_dau: float) -> Optional[Dict[str, Any]]:
    """TAM sanity check — 상대 비교 전용 (패널 스케일 ≠ 내부 스케일)"""
    ev = load_evidence()
    tam = ev.get("tam_by_genre", {})
    g = tam.get(genre) or tam.get({"Battle Royale": "Shooter", "Extraction Shooter": "Shooter",
                                    "FPS/TPS": "Shooter"}.get(genre, ""), None)
    if not g:
        return None
    return {"genre_panel_mau": g["mau"], "note": "Newzoo 패널 기준 — 절대 비교 금지, 자릿수 sanity 전용"}
