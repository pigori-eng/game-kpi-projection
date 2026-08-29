# -*- coding: utf-8 -*-
"""
V14.2.0 Cycle 3-1: Revenue Owner 3-way Shadow Backtest (피드백25 §1)
공식 owner(legacy_pr_arppu)는 절대 불변 — 이 모듈은 검증 전용(shadow_only).
LOFO = Leave-One-Franchise-Out: 평가 대상 franchise를 calibration에서 완전 제외.
평가 지표: 일별 revenue-per-DAU rate(= PR×ARPPU, daily canonical)의 WMAPE/bias.
"""
import json, os
from typing import Dict, List, Any
import numpy as np

DATA = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "data", "raw_game_data.json")

FRANCHISE = {  # game → franchise family (LOFO 단위)
    "PUBG": ["PUBG (PC/F2P/2022)", "PUBGM (KR+JP/Launch-2019)", "PUBGM (KR+JP/Stable-2022)"],
    "DNDM": ["DNDM (NA)", "DNDM (SEA)", "DNDM (SA)"],
    "MOE": ["MOE(한국)", "MOE(글로벌)"], "AxE": ["AxE(대만)", "AxE(한국)"],
    "메M": ["메M(대만)", "메M(한국)"], "오버히트": ["오버히트(한국)", "오버히트(일본)"],
}

def _family_of(game: str) -> str:
    for fam, games in FRANCHISE.items():
        if game in games:
            return fam
    return game  # 단독 게임 = 자체 family

def _rates(pr: List[float], ar: List[float], n: int = 90) -> np.ndarray:
    m = min(len(pr), len(ar), n)
    return np.array(pr[:m]) * np.array(ar[:m])

def run_owner_prediction(owner: str, pool_pr: List[List[float]], pool_ar: List[List[float]],
                          three_layer_cfg: Dict = None) -> float:
    """LOFO pool로부터 owner별 revenue-rate(일평균 rev/DAU) 예측값 산출"""
    if owner == "legacy_pr_arppu":  # PR P50 × ARPPU P50 (독립 결합 — 현재 공식 방식)
        pr50 = float(np.median([np.mean(p[:90]) for p in pool_pr]))
        ar50 = float(np.median([np.mean(a[:90]) for a in pool_ar]))
        return pr50 * ar50
    if owner == "arpdau":  # 게임별 결합 rate의 P50 (결합분포 보존)
        rates = [float(np.mean(_rates(p, a))) for p, a in zip(pool_pr, pool_ar)]
        return float(np.median(rates))
    if owner == "three_layer_bm":  # Entry+Repeat+High-ARPU 구성 (기본 cfg → rate 환산)
        cfg = three_layer_cfg or {}
        fp, entry = cfg.get("first_purchase_cvr", 0.025), cfg.get("entry_bundle_krw", 12000)
        attach, pp, season = cfg.get("pass_attach_rate", 0.12), cfg.get("pass_price_krw", 15000), 90
        prem_r, prem_m = cfg.get("premium_spender_rate", 0.004), cfg.get("premium_monthly_krw", 90000)
        nru_to_dau = 0.08  # 일 NRU/DAU 비율 가정 (launch 90d 평균 근사)
        return fp * entry * nru_to_dau + attach * pp / season + prem_r * prem_m / 30
    raise ValueError(owner)

GATE_RULES = ("WMAPE legacy 대비 10%+ 개선 / bias ±10% / family별 20%+ 악화 없음 / "
              "n ≥ 5 family / 1~2 franchise가 개선 전부를 만들면 승격 금지")

def shadow_backtest(owners: List[str] = None, horizon_days: int = 90) -> Dict[str, Any]:
    raw = json.load(open(DATA))["games"]
    owners = owners or ["legacy_pr_arppu", "arpdau", "three_layer_bm"]
    games = [g for g in raw["payment_rate"] if g in raw["arppu"]
             and len(raw["payment_rate"][g]) >= 30 and len(raw["arppu"][g]) >= 30]
    per_game, per_family = [], {}
    for g in games:
        fam = _family_of(g)
        pool = [x for x in games if _family_of(x) != fam]  # Leave-One-Franchise-Out
        if len(pool) < 5:
            continue
        actual = float(np.mean(_rates(raw["payment_rate"][g], raw["arppu"][g], horizon_days)))
        row = {"game": g, "family": fam, "actual_rate": actual, "pred": {}}
        for o in owners:
            pred = run_owner_prediction(o, [raw["payment_rate"][x] for x in pool],
                                        [raw["arppu"][x] for x in pool])
            row["pred"][o] = pred
        per_game.append(row)
        per_family.setdefault(fam, []).append(row)

    def _metrics(rows):
        out = {}
        for o in owners:
            errs = [abs(r["pred"][o] - r["actual_rate"]) / r["actual_rate"] for r in rows]
            biases = [(r["pred"][o] - r["actual_rate"]) / r["actual_rate"] for r in rows]
            out[o] = {"wmape": round(float(np.mean(errs)), 4), "bias": round(float(np.mean(biases)), 4)}
        return out

    overall = _metrics(per_game)
    fam_metrics = {f: _metrics(rows) for f, rows in per_family.items()}
    # family-balanced: family별 wmape의 평균 (대가족 과대표집 방지)
    fam_balanced = {o: {"wmape": round(float(np.mean([fam_metrics[f][o]["wmape"] for f in fam_metrics])), 4),
                        "bias": round(float(np.mean([fam_metrics[f][o]["bias"] for f in fam_metrics])), 4)}
                    for o in owners}

    # Gate 평가 (엄격 — 피드백25 표)
    legacy_w = fam_balanced["legacy_pr_arppu"]["wmape"]
    best = min((o for o in owners if o != "legacy_pr_arppu"), key=lambda o: fam_balanced[o]["wmape"])
    improved = (legacy_w - fam_balanced[best]["wmape"]) / legacy_w >= 0.10
    bias_ok = abs(fam_balanced[best]["bias"]) <= 0.10
    no_family_regress = all(fam_metrics[f][best]["wmape"] <= fam_metrics[f]["legacy_pr_arppu"]["wmape"] * 1.20
                            for f in fam_metrics)
    n_ok = len(fam_metrics) >= 5
    # outlier guard: best 후보 개선이 상위 2 family 제외 시에도 유지되는가
    fams_sorted = sorted(fam_metrics, key=lambda f: fam_metrics[f]["legacy_pr_arppu"]["wmape"]
                         - fam_metrics[f][best]["wmape"], reverse=True)
    rest = fams_sorted[2:]
    outlier_ok = (len(rest) >= 3 and
                  float(np.mean([fam_metrics[f][best]["wmape"] for f in rest]))
                  < float(np.mean([fam_metrics[f]["legacy_pr_arppu"]["wmape"] for f in rest])))
    promote = improved and bias_ok and no_family_regress and n_ok and outlier_ok
    reasons = [t for ok, t in [(improved, "WMAPE 10%+ 개선 미달"), (bias_ok, "bias ±10% 초과"),
               (no_family_regress, "특정 family 20%+ 악화"), (n_ok, "n<5 family"),
               (outlier_ok, "상위 1~2 franchise 의존 개선")] if not ok]
    return {"status": "shadow_only", "official_owner": "legacy_pr_arppu",
            "official_result_unchanged": True,
            "lofo_definition": "Leave-One-Franchise-Out — 평가 franchise를 calibration에서 완전 제외",
            "metric_note": "일별 revenue-per-DAU rate(PR×ARPPU daily) 기준 WMAPE/bias — launch 90d",
            "n_games": len(per_game), "n_families": len(fam_metrics),
            "candidates_overall": overall, "candidates_family_balanced": fam_balanced,
            "per_family": fam_metrics,
            "gate_rules": GATE_RULES,
            "gate_result": {"best_candidate": best, "promote_candidate": bool(promote),
                            "reason": "; ".join(reasons) if reasons else "전 조건 통과 — 승격 검토 가능 (수동 승인 필요)"}}
