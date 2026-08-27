# -*- coding: utf-8 -*-
"""P3.5 Freeze vFinal: Product Timeline — Wave/Union Dedup/Identity (피드백6+7 사양)"""
from typing import List, Dict, Any, Optional
import numpy as np

def ramp(t: int, initial: float, target: float, ramp_days: int) -> float:
    if ramp_days <= 0: return target
    return initial + (target - initial) * min(1.0, t / ramp_days)

def validate_identity_policy(ip: Optional[dict], wave_id: str):
    if not ip or "adoption" not in ip or "same_day_overlap" not in ip:
        raise ValueError(f"wave '{wave_id}': identity_policy(adoption/same_day_overlap) 필수 — silent default 금지 (Freeze vFinal ①)")
    for k in ("adoption", "same_day_overlap"):
        for f in ("initial", "target", "ramp_days", "source"):
            if f not in ip[k]:
                raise ValueError(f"wave '{wave_id}': identity_policy.{k}.{f} 누락")

def combine_waves(wave_results: List[Dict[str, Any]], total_days: int) -> Dict[str, Any]:
    """
    wave_results: [{wave_id, launch_date, offset_days, platform, identity_policy,
                    dau[], nru[], revenue[]}] — offset_days = 제품 T0 대비 출시일
    Union: U_k = U_prev + D_k - min(D_k*rho, U_prev, D_k). Revenue = attributed 합산.
    """
    waves = sorted(wave_results, key=lambda w: (w["offset_days"], w["wave_id"]))  # tie-break: wave_id
    unique_dau = [0.0] * total_days
    product_rev = [0.0] * total_days
    new_to_product_nru = [0.0] * total_days
    platform_dau = {}
    per_wave = {}
    upper_bound_flag = False
    for w in waves:
        validate_identity_policy(w.get("identity_policy"), w["wave_id"])
        ip = w["identity_policy"]
        if ip["same_day_overlap"]["target"] == 0 and ip["same_day_overlap"]["initial"] == 0:
            upper_bound_flag = True
        off = w["offset_days"]
        ov_series, ntp_series = [], []
        for t in range(total_days):
            wt = t - off
            if wt < 0:
                ov_series.append(0.0); ntp_series.append(0.0); continue
            d = w["dau"][wt] if wt < len(w["dau"]) else 0.0
            rho = ramp(wt, ip["same_day_overlap"]["initial"], ip["same_day_overlap"]["target"], ip["same_day_overlap"]["ramp_days"])
            o = min(d * rho, unique_dau[t], d)
            unique_dau[t] = unique_dau[t] + d - o
            ov_series.append(o)
            adopt = ramp(wt, ip["adoption"]["initial"], ip["adoption"]["target"], ip["adoption"]["ramp_days"])
            nru_w = w["nru"][wt] if wt < len(w["nru"]) else 0.0
            ntp = nru_w * (1 - adopt)  # existing adopter는 new-to-product 재계상 금지
            new_to_product_nru[t] += ntp; ntp_series.append(ntp)
            rev = w["revenue"][wt] if wt < len(w["revenue"]) else 0.0
            product_rev[t] += rev  # attributed 합산 — DAU overlap으로 dedup 금지
            platform_dau.setdefault(w["platform"], [0.0] * total_days)[t] += d
        per_wave[w["wave_id"]] = {"platform": w["platform"], "offset_days": off,
            "cumulative_revenue": float(sum(w["revenue"])),
            "total_new_to_product_nru": float(sum(ntp_series))}
    return {"unique_account_dau": unique_dau, "platform_dau": platform_dau,
        "product_revenue": product_rev, "new_to_product_nru": new_to_product_nru,
        "per_wave": per_wave,
        "overlap_scenario": "upper_bound_unique_dau" if upper_bound_flag else "scenario_parameterized",
        "reliability_layers": {"base_platform_model": "per-wave grade 참조",
            "sequential_wave_transfer": "Scenario / Uncalibrated",
            "account_adoption": "Prior / Uncalibrated",
            "same_day_overlap": "Policy / Uncalibrated"},
        "product_interval": None,
        "product_interval_note": "Freeze vFinal: Product 전체 P10/P90 미제공 — Scenario Envelope만"}


# ── V13.4 P4.5: Mode State Layer (BR/EX/Both, 상호배타, lift=1.00 고정) ──
def apply_mode_expansion(unique_dau: List[float], event: Dict[str, Any],
                          total_days: int) -> Dict[str, Any]:
    """
    event: {mode_launch_offset_days, new_user_burst[], ex_adoption:{initial,target,ramp_days},
            reactivation:{peak_ratio, decay_days}}
    lift(retention/arpdau) = 1.00 하드고정. Both = adoption된 기존유저.
    """
    off = event["mode_launch_offset_days"]
    ad = event["ex_adoption"]
    ra = event.get("reactivation", {"peak_ratio": 0.0, "decay_days": 30})
    burst = event.get("new_user_burst", [])
    br_only, ex_only, both, react = [], [], [], []
    for t in range(total_days):
        u = unique_dau[t] if t < len(unique_dau) else 0.0
        if t < off:
            br_only.append(u); ex_only.append(0.0); both.append(0.0); react.append(0.0)
            continue
        wt = t - off
        adopt = ramp(wt, ad["initial"], ad["target"], ad["ramp_days"])
        rv = u * ra["peak_ratio"] * max(0.0, 1 - wt / max(1, ra["decay_days"]))
        nb = burst[wt] if wt < len(burst) else 0.0
        b = u * adopt
        eo = nb  # 신규 burst는 EX 유입으로 분류 (시나리오 단순화, lift 없음)
        br_only.append(u - b); both.append(b + rv); ex_only.append(eo); react.append(rv)
    uq = [br_only[t] + ex_only[t] + both[t] for t in range(total_days)]
    pen = [both[t] / uq[t] if uq[t] > 0 else 0.0 for t in range(total_days)]
    return {"br_only": br_only, "ex_only": ex_only, "both": both,
            "reactivated": react, "unique_dau_post_event": uq,
            "cross_mode_penetration": pen,
            "synergy": {"incremental_retention_lift": 1.00, "incremental_arpdau_lift": 1.00,
                        "status": "hypothesis-only — CBT causal calibration 전 P50 중립"}}
