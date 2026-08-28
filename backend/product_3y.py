# -*- coding: utf-8 -*-
"""
V13.7: 3-Year Product Projection Orchestrator (7-1 + 7-2 + 7-3)
================================================================
FREEZE 원칙 10 (피드백11 확정 — 위반 금지):
 1. Mode mix는 Unique DAU를 증가시키지 않는다 (분해만).
 2. Mode synergy 기본 1.00, scenario-only (라벨 강제).
 3. Cross-platform overlap은 DAU dedup에만 사용.
 4. Revenue = platform attributed 합산, overlap 차감 금지.
 5. Aniimo prior는 reference only, auto-apply 금지.
 6. 표본 없는 region proxy 사용 시 반드시 경고.
 7. Y3 tail-dominant warning 강제.
 8. BM UI 선택 = engine recipe contract 1:1 매핑.
 9. Manual/Auto/Hybrid reference mode 의미 명확.
 10. Assumption Set은 모든 결과와 함께 저장.
"""
import json
import os
import copy
import hashlib
from datetime import datetime, timedelta
from typing import List, Dict, Any, Optional, Callable, Awaitable

import numpy as np
import product_timeline as ptl
import v14_engines as v14

DATA_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data")

# ── J. BM Recipe Audit: UI ↔ engine recipe 1:1 (원칙 8) ──────────────
# V14.0.2 #5: BM modifier = 내부 실측 evidence-backed (PR×ARPPU by BM class vs 전체 median, clamp [0.85,1.20])
# 산출: cosmetic_pass raw 0.53→0.85 / gacha raw 3.27→1.20 / consumable raw 1.29→1.20 (n=7/8/3)
# clamp 사유: 장르 효과 혼재(BM 단독 분리 불가) → 방향만 반영, V14.4 3-Layer에서 정밀화
BM_EVIDENCE_MODIFIERS = {
    "F2P Cosmetic + Battle Pass": {"mult": 0.85, "badge": "🔵 Internal benchmark (n=7, clamped, 장르혼재 주의)"},
    "F2P Gacha":                  {"mult": 1.20, "badge": "🔵 Internal benchmark (n=8, clamped)"},
    "F2P Consumable":             {"mult": 1.20, "badge": "🔵 Internal benchmark (n=3, clamped)"},
    "B2P Package":                {"mult": 1.00, "badge": "⚪ 표본 구조 상이 — 중립"},
    "Hybrid F2P + DLC":           {"mult": 1.00, "badge": "⚪ evidence 없음 — 중립"},
    "Subscription":               {"mult": 1.00, "badge": "⚪ evidence 없음 — 중립"},
}
BM_RECIPE_MAP = {
    "F2P Cosmetic + Battle Pass": {"engine_recipe": "launch_f2p_iap", "revenue_basis": "iap", "bm_type": "Midcore"},
    "F2P Gacha":                  {"engine_recipe": "launch_f2p_iap", "revenue_basis": "iap", "bm_type": "Midcore"},
    "F2P Consumable":             {"engine_recipe": "launch_f2p_iap", "revenue_basis": "iap", "bm_type": "Midcore"},
    "B2P Package":                {"engine_recipe": "launch_b2p_package", "revenue_basis": "package", "bm_type": "Midcore"},
    "Hybrid F2P + DLC":           {"engine_recipe": "hybrid_f2p_dlc", "revenue_basis": "iap_plus_dlc", "bm_type": "Midcore"},
    "Subscription":               {"engine_recipe": "live_f2p_iap", "revenue_basis": "subscription", "bm_type": "Midcore"},
}
# 레거시 UI BM 타입 → recipe 매핑 (감사 결과: 기존 Hardcore~Casual은 '과금강도' User scenario로 유지,
# recipe는 별도 축. GW Base: PC/Mobile=F2P Cosmetic+Pass, Console=Hybrid F2P+DLC)

# ── H-core. Region Monetization Factor Contract (원칙 6) ─────────────
# 기준: GLOBAL=1.0. measured=내부 실측(DNDM/PUBGM) 상대비, proxy=인접 추정.
REGION_FACTORS = {
    "NA":    {"factor": 1.60, "source": "measured (DNDM NA ARPDAU ₩574/GLOBAL 대비)", "status": "measured"},
    "KR":    {"factor": 1.30, "source": "measured-adjacent (PUBGM KR+JP)", "status": "measured"},
    "JP":    {"factor": 1.45, "source": "measured-adjacent (PUBGM KR+JP)", "status": "measured"},
    "SEA":   {"factor": 0.25, "source": "measured (DNDM SEA ₩61)", "status": "measured"},
    "SA":    {"factor": 0.15, "source": "measured (DNDM SA ₩36)", "status": "measured"},
    "EU":    {"factor": 1.00, "source": "shrunk (NEW STATE DE/GB/FR 실측 상대비 0.9 + 기존 proxy 1.1 병합, n_families=1)", "status": "shrunk"},
    "OTHER": {"factor": 0.50, "source": "proxy (내부 표본 0)", "status": "proxy"},
    "CN":    {"factor": 1.20, "source": "proxy (내부 표본 0 + 판호/로컬 퍼블리싱 구조 특이 — 별도 검토 필수)", "status": "proxy"},
    "GLOBAL": {"factor": 1.00, "source": "definition", "status": "measured"},
}

DEFAULT_REGION_MIX = {"NA": 0.30, "EU": 0.20, "KR": 0.15, "JP": 0.10, "SEA": 0.20, "OTHER": 0.05}

REGION_MODE_PRESETS = {
    "global_ex_cn": {"label": "글로벌 (중국 본토 제외)", "mix": DEFAULT_REGION_MIX},
    # custom: regions[] 균등 분배 (또는 region_mix 직접 지정 시 그 값 우선)
}

def resolve_region_mix(payload: Dict) -> Dict[str, float]:
    rs = payload.get("region_scope") or {}
    if rs.get("mode") == "custom" and rs.get("regions"):
        regs = [r for r in rs["regions"] if r in REGION_FACTORS]
        w = payload.get("region_mix") if payload.get("region_mix") and set(payload["region_mix"]) <= set(regs) else None
        return w or {r: 1.0 / len(regs) for r in regs}
    if rs.get("mode") == "global_ex_cn":
        return dict(DEFAULT_REGION_MIX)
    return payload.get("region_mix", DEFAULT_REGION_MIX)

def region_revenue_multiplier(mix: Dict[str, float]) -> Dict[str, Any]:
    total = sum(mix.values())
    warnings = []
    if abs(total - 1.0) > 0.01:
        warnings.append(f"Region mix 합계 {total:.2f} ≠ 1.0 — 정규화 적용")
    mult, detail = 0.0, {}
    for r, w in mix.items():
        f = REGION_FACTORS.get(r, {"factor": 0.5, "source": "unknown→proxy", "status": "proxy"})
        mult += (w / total) * f["factor"]
        detail[r] = {"weight": round(w / total, 4), **f}
        if f["status"] == "proxy" and w > 0:
            warnings.append(f"{r} {w*100:.0f}%: 내부 표본 0 → proxy factor {f['factor']} 사용 (원칙 6)")
    return {"multiplier": round(mult, 4), "detail": detail, "warnings": warnings,
            "baseline": "GLOBAL=1.0 (혼합 실측 기준)",
            "scope": "Region Mix는 현재 monetization에만 적용 — CPA/Organic/Retention 지역효과는 미모델링 (V14.2)"}

# ── I. Reference Source 3-Mode (원칙 9) ─────────────────────────────
REFERENCE_MODES = {
    "auto":   {"desc": "내부 호환 pool 분포 P50 자동 사용 (표본 선택 불가)", "weight": 0.0, "benchmark_only": True},
    "manual": {"desc": "사용자 선택 표본만 사용 (벤치마크 미사용)", "weight": 1.0, "benchmark_only": False},
    "hybrid": {"desc": "선택 표본 70% + 내부 분포 벤치마크 30%", "weight": 0.7, "benchmark_only": False},
}

# ── C. Mode Structure(모델) vs Synergy(시나리오) 2층 (원칙 1,2) ──────
DEFAULT_MODE = {"ex_only": {"initial": 0.10, "target": 0.15, "ramp_days": 180},
                "both":    {"initial": 0.08, "target": 0.25, "ramp_days": 180}}
SYNERGY_PRESETS = {"Base": 1.00, "Hypothesis": 1.10, "Aggressive": 1.20}

def decompose_modes(unique_dau: List[float], mode: Dict, synergy: Dict) -> Dict[str, Any]:
    n = len(unique_dau)
    # V13.7.1: retention lift는 DAU 재계산 없이는 mode분해에만 반영되어 혼란 → Orchestrator(V13.9)까지 비활성
    ret_lift = 1.0
    _requested_ret = float(synergy.get("retention_lift", 1.0))
    mon_lift = float(synergy.get("monetization_lift", 1.0))
    ex_c, bo_c = mode["ex_only"], mode["both"]
    ex, bo, br, uq = [], [], [], []
    for t in range(n):
        u = unique_dau[t] * ret_lift  # scenario-only 균등 근사 (라벨 강제)
        e = u * ptl.ramp(t, ex_c["initial"], ex_c["target"], ex_c["ramp_days"])
        b = u * ptl.ramp(t, bo_c["initial"], bo_c["target"], bo_c["ramp_days"])
        e, b = min(e, u), min(b, max(0.0, u - min(e, u)))
        ex.append(e); bo.append(b); br.append(u - e - b); uq.append(u)
    return {"br_only": br, "ex_only": ex, "both": bo, "unique_dau": uq,
            "dau_retention_lift_applied": ret_lift,
            "revenue_monetization_lift": mon_lift,
            "synergy_label": ("Scenario assumption — not calibrated (monetization만 적용)" if mon_lift != 1.0 else "Base (1.00) — 시너지 미적용")
                + (" | retention lift 요청됨(%.2f) → V13.9 Orchestrator까지 비활성" % _requested_ret if _requested_ret != 1.0 else ""),
            "identity_check": all(abs(br[t] + ex[t] + bo[t] - uq[t]) < 1e-6 for t in range(n))}

# ── Identity policy 기본값 (Base 확정치) ─────────────────────────────
DEFAULT_IDENTITY = {
    "PC":      {"adoption": {"initial": 0.0, "target": 0.0, "ramp_days": 1, "source": "anchor"},
                "same_day_overlap": {"initial": 0.0, "target": 0.0, "ramp_days": 1, "source": "anchor"}},
    "Mobile":  {"adoption": {"initial": 0.05, "target": 0.25, "ramp_days": 180, "source": "scenario_prior"},
                "same_day_overlap": {"initial": 0.02, "target": 0.12, "ramp_days": 90, "source": "scenario_prior(Aniimo ref)"}},
    "Console": {"adoption": {"initial": 0.08, "target": 0.30, "ramp_days": 180, "source": "scenario_prior"},
                "same_day_overlap": {"initial": 0.05, "target": 0.18, "ramp_days": 90, "source": "scenario_prior(Aniimo ref 0.2)"}},
}

# ── 시나리오 & Tornado lever 정의 ────────────────────────────────────
SCENARIO_PRESETS = {
    "downside": {"retention_d1": 0.90, "monetization": 0.80, "mobile_scale": 0.70, "console_scale": 0.80, "ex_adoption": 0.60},
    "base":     {"retention_d1": 1.00, "monetization": 1.00, "mobile_scale": 1.00, "console_scale": 1.00, "ex_adoption": 1.00},
    "upside":   {"retention_d1": 1.10, "monetization": 1.20, "mobile_scale": 1.30, "console_scale": 1.30, "ex_adoption": 1.40},
}
TORNADO_LEVERS = ["ua_scale", "retention_d1", "monetization", "mobile_scale", "console_scale", "overlap_target", "ex_adoption"]

NET_RATE = 0.70  # 스토어 수수료 30% 가정 (Assumption 시트 명시)


async def run_official_scenarios(payload: Dict, project_fn, ProjectionInput) -> Dict[str, Any]:
    """[V14.0.1] 공식 3본: D1 40/50/60만 변경, 나머지 전 변수 고정 (내부 보고 기준선)"""
    out = {"label": "Official Scenarios — Worst/Normal/Best (D1 40/50/60, 타 변수 고정)",
           "conditional": "Product Gate 달성 조건부 · This is not a sales commitment", "scenarios": {}}
    for name, d1 in [("worst", 0.40), ("normal", 0.50), ("best", 0.60)]:
        r = await run_product_3y({**payload, "target_d1": d1, "enable_bridge": False, "light": True,
                                   "enable_v14_3": False, "enable_v14_2": False}, project_fn, ProjectionInput)
        out["scenarios"][name] = {
            "assumption_set_id": r["assumption_set"]["assumption_set_id"],
            "annual": r["annual_summary"], "total": r["total"],
            "hurdle_coverage": r.get("strategic_hurdle_coverage")}
    n = out["scenarios"]
    out["headline"] = {
        "range_krw": [n["worst"]["total"]["gross_krw"], n["best"]["total"]["gross_krw"]],
        "planning_case_krw": n["normal"]["total"]["gross_krw"]}
    return out


async def run_v14_delta_bridge(payload: Dict, project_fn, ProjectionInput) -> Dict[str, Any]:
    """[V14.0.1] V14 모듈별 Δ 자동 분해 — 각 모듈 영향의 독립 설명가능성 검증"""
    base_pay = {**payload, "enable_v14_2": False, "enable_v14_3": False, "enable_bridge": False}
    cache: Dict = {}
    b = await _run_pipeline(base_pay, project_fn, ProjectionInput, SCENARIO_PRESETS["base"], cache)
    rows = [{"config": "V13.8 Official Normal", "gross_krw": b["total_gross"], "delta_krw": 0,
             "official": True}]
    # V14.2 only (파이프라인 통합됨)
    r2 = await _run_pipeline({**base_pay, "enable_v14_2": True}, project_fn, ProjectionInput,
                              SCENARIO_PRESETS["base"], cache)
    rows.append({"config": "+ V14.2 Independent Acquisition only", "gross_krw": r2["total_gross"],
                 "delta_krw": r2["total_gross"] - b["total_gross"], "official": False,
                 "badge": v14.BADGE["evidence_informed"]})
    # V14.3 only (PREVIEW 산술 — 공식 미반영 계약 유지)
    total_days = int(payload.get("horizon_years", 3)) * 365
    lc = v14.live_lifecycle(b["combined"]["unique_account_dau"],
                            payload.get("live_events") or [{"day": d, "type": "major"} for d in range(90, total_days, 90)],
                            total_days)
    ratio = sum(lc["dau_with_lifecycle"]) / max(1.0, sum(b["combined"]["unique_account_dau"]))
    rows.append({"config": "+ V14.3 Live Lifecycle only (PREVIEW 산술)", "gross_krw": b["total_gross"] * ratio,
                 "delta_krw": b["total_gross"] * (ratio - 1), "official": False,
                 "badge": v14.BADGE["evidence_informed"], "note": "공식 미반영 — implied uplift"})
    # V14.1 / V14.4: prototype (파이프라인 미통합) — Δ 미산출 명시
    rows.append({"config": "+ V14.1 Retention Anchor only", "gross_krw": None, "delta_krw": None,
                 "official": False, "note": "prototype — retention 엔진 통합 후 산출 가능"})
    rows.append({"config": "+ V14.4 3-Layer Monetization only", "gross_krw": None, "delta_krw": None,
                 "official": False, "note": "prototype — Revenue Owner Gate(Shadow A/B) 통과 후 산출"})
    return {"label": "V14 Module Delta Bridge (vs Official Normal)",
            "contract": "Official 숫자는 V13.8 기준 고정 — V14 Δ는 전부 Preview", "rows": rows}


def build_marketing_ledger(wave_results: List[dict], years: int) -> Dict[str, Any]:
    """단일 Ledger — Acquisition 엔진과 P&L이 같은 비용을 봄 (이중차감/누락 방지)"""
    launch_ua = sum(w["marketing"]["launch_ua"] for w in wave_results)
    launch_brand = sum(w["marketing"]["launch_brand"] for w in wave_results)
    sustain_annual = sum(w["marketing"]["sustain_annual"] for w in wave_results)
    return {"launch": {"performance_ua": launch_ua, "brand": launch_brand, "total": launch_ua + launch_brand},
            "sustain_annual": sustain_annual,
            "sustain_note": "기본 = launch UA의 연 10% (엔진 유입측과 동일 소스). Revenue% 방식은 순환구조라 금지 (피드백15 §16)",
            "total_horizon": launch_ua + launch_brand + sustain_annual * years,
            "per_wave": {w["wave_id"]: w["marketing"] for w in wave_results}}


PNL_RATES = {"platform_fee": 0.30, "vat_payment": 0.10, "infra": 0.03}

def build_pnl_bep(annual: List[dict], monthly_rev: List[float], ledger: Dict,
                  costs: Optional[Dict], total_days: int) -> Dict[str, Any]:
    """
    7 P&L Waterfall + 8 BEP (Marketing BEP / Full Cost BEP) — 결과 최종 레이어.
    costs: {dev_cost_total_krw, annual_hr_cost_krw, sustain_def(검증용)}
    """
    costs = costs or {}
    if (costs.get("sustain_def") or {}).get("type") == "revenue_pct":
        raise ValueError("sustain_def=revenue_pct 금지 — 매출↑→마케팅↑→매출↑ 순환 (피드백15 §16). launch_ua_pct 또는 fixed_annual 사용")
    dev = float(costs.get("dev_cost_total_krw", 0))
    hr_y = float(costs.get("annual_hr_cost_krw", 0))
    years = len(annual)
    net_rate = 1 - PNL_RATES["platform_fee"] - PNL_RATES["vat_payment"] - PNL_RATES["infra"]  # 0.57
    waterfall = []
    for i, a in enumerate(annual):
        g = a["gross_revenue_krw"]
        mkt = (ledger["launch"]["total"] if i == 0 else 0) + ledger["sustain_annual"]
        net = g * net_rate
        contribution = net - mkt
        operating = contribution - hr_y
        waterfall.append({"year": a["year"], "gross_bookings": g,
                          "platform_fee": -g * PNL_RATES["platform_fee"],
                          "vat_payment": -g * PNL_RATES["vat_payment"], "infra": -g * PNL_RATES["infra"],
                          "net_revenue": net, "marketing": -mkt, "contribution_profit": contribution,
                          "hr_cost": -hr_y, "operating_profit": operating})
    # BEP: 월 단위 누적 (launch 마케팅 M1 전액, sustain/HR 균등 월할, dev는 Full에만 t0 반영)
    cum_net = cum_mkt = cum_hr = 0.0
    bep_mkt = bep_full = None
    for m, rev in enumerate(monthly_rev):
        cum_net += rev * net_rate
        cum_mkt += (ledger["launch"]["total"] if m == 0 else 0) + ledger["sustain_annual"] / 12
        cum_hr += hr_y / 12
        if bep_mkt is None and cum_net >= cum_mkt:
            bep_mkt = m + 1
        if bep_full is None and cum_net >= cum_mkt + cum_hr + dev:
            bep_full = m + 1
    horizon_m = len(monthly_rev)
    gap_full = (cum_mkt + cum_hr + dev) - cum_net
    return {"waterfall": waterfall,
            "rates_note": f"Net = Gross × {net_rate:.2f} (수수료 30% + VAT/결제 10% + 인프라 3%) — 3Y 화면의 기존 ×0.70과 다름 주의",
            "bep": {"marketing_bep_month": f"M+{bep_mkt}" if bep_mkt else f"기간 내 미달성 ({horizon_m}개월)",
                    "full_cost_bep_month": f"M+{bep_full}" if bep_full else f"기간 내 미달성 (잔여 {gap_full/1e8:.0f}억)",
                    "definition": "Marketing BEP: 누적 Net ≥ 누적 마케팅 / Full: + 인건비 누적 + 개발비"},
            "cost_inputs": {"dev_cost_total_krw": dev, "annual_hr_cost_krw": hr_y,
                            "status": "미입력 시 0 — BEP는 입력된 비용 범위 내에서만 유효"}}


def _snapshot(payload: Dict) -> Dict[str, Any]:
    body = json.dumps(payload, sort_keys=True, ensure_ascii=False, default=str)
    return {"assumption_set_id": hashlib.sha1(body.encode()).hexdigest()[:12],
            "created_at": datetime.now().isoformat(timespec="seconds"),
            "values": copy.deepcopy(payload)}


async def _run_pipeline(payload: Dict, project_fn: Callable, ProjectionInput,
                        levers: Dict[str, float], engine_cache: Dict) -> Dict[str, Any]:
    """levers를 적용해 waves → combine → mode → region → annual까지 1회 실행"""
    total_days = int(payload.get("horizon_years", 3)) * 365
    anchor = datetime.strptime(payload["anchor_launch_date"], "%Y-%m-%d")
    ref = REFERENCE_MODES[payload.get("reference_mode", "auto")]
    ms = payload.get("manual_samples", {}) or {}
    genre = payload.get("genre", "Battle Royale")
    target_d1 = min(0.9, max(0.05, float(payload.get("target_d1", 0.30)) * levers.get("retention_d1", 1.0)))

    acq_mode = payload.get("acquisition_mode", "hybrid")  # budget_driven | known_reservoir | hybrid
    wave_results = []
    for w in payload["waves"]:
        plat = w["platform"]
        scale = float(w.get("scale_mult", 1.0))
        if plat == "Mobile":
            scale *= levers.get("mobile_scale", 1.0)
        if plat == "Console":
            scale *= levers.get("console_scale", 1.0)
        scale *= levers.get("ua_scale", 1.0)
        offset_days = int(round(float(w.get("offset_months", 0)) * 30.4))
        wave_days = max(90, total_days - offset_days)
        d1n = int(w["d1_nru_normal"] * scale)
        # V13.7.1: 마케팅 wiring 복구 — brand/사전마케팅/서스테인 관통
        brand = w.get("brand_budget", 0) * scale
        pre_ratio = w.get("pre_marketing_ratio", 0.0)
        wl_conv = w.get("wishlist_conversion_rate", 0.15)
        sustain_m = w.get("sustaining_monthly", 0)  # 0 = 엔진 기본 (launch UA의 연 10%)
        # V13.7.2 P0-3: External Reservoir (semantics: size × activation → activated → burst 80/10/10)
        _prereg = w.get("prereg_users", 0)
        _act = w.get("prereg_activation_rate", 0.40)  # assumption informed by NEW STATE launch-scale evidence
        ext_reservoir = int(_prereg * _act)
        if ext_reservoir > 0:
            pre_ratio = 0.0  # budget-derived pre-launch 강제 차단 (이중계산 방지)
        if acq_mode == "known_reservoir":
            pass  # UA는 사용자가 0으로 넣는 것을 전제 (엔진 계약: budget>0이면 budget-driven 우선)
        # V14.2 (opt-in): Brand 단독 유입 — UA=0이어도 install 발생
        v14_brand = None
        if payload.get("enable_v14_2") and brand > 0:
            v14_brand = v14.brand_independent_installs(brand, plat)
            ext_reservoir += v14_brand["installs"]
        # V13.7.2 P0-4: organic_share_of_total → 엔진 ratio 변환 (share/(1-share))
        _oshare = w.get("organic_share_of_total", payload.get("organic_share_of_total", 0.20))
        organic_ratio = min(3.0, _oshare / max(0.05, 1 - _oshare))
        bm_ui = payload.get("bm_ui", "F2P Cosmetic + Battle Pass")
        bm_type = BM_RECIPE_MAP.get(bm_ui, {}).get("bm_type", "Midcore")  # V13.7.2: 전 recipe 중립(1.0)
        if payload.get("__legacy_bm_penalty"):
            bm_type = "F2P_Cosmetic"  # bridge baseline 재현 전용
        key = json.dumps([w["wave_id"], plat, target_d1, d1n, round(w["ua_budget"] * scale), round(brand),
                          pre_ratio, wl_conv, sustain_m, bm_type, ext_reservoir, round(organic_ratio, 3),
                          w.get("target_cpa", 8000), wave_days,
                          payload.get("reference_mode"), sorted(ms.get("retention", []))], default=str)
        if key in engine_cache:
            fd = engine_cache[key]
        else:
            pin = ProjectionInput(
                launch_date=(anchor + timedelta(days=offset_days)).strftime("%Y-%m-%d"),
                projection_days=wave_days,
                retention={"selected_games": ms.get("retention", []),
                           "target_d1_retention": {"best": min(0.9, target_d1 + 0.10), "normal": target_d1,
                                                    "worst": max(0.05, target_d1 - 0.10)}},  # V14.0.2 #6: 60/50/40
                nru={"selected_games": ms.get("nru", []),
                     "d1_nru": {"best": int(d1n * 1.2), "normal": d1n, "worst": int(d1n * 0.8)},
                     "ua_budget": w["ua_budget"] * scale, "brand_budget": int(brand),
                     "target_cpa": w.get("target_cpa", 8000),
                     "pre_marketing_ratio": pre_ratio, "wishlist_conversion_rate": wl_conv,
                     "sustaining_mkt_budget_monthly": sustain_m,
                     "base_organic_ratio": organic_ratio,
                     "external_reservoir_activated": ext_reservoir},
                revenue={"selected_games_pr": ms.get("pr", []), "selected_games_arppu": ms.get("arppu", [])},
                blending={"weight": ref["weight"], "genre": genre, "platforms": [plat],
                          "time_decay": True, "benchmark_only": ref["benchmark_only"]},
                quality_score=payload.get("quality_score", "B"), bm_type=bm_type,
                regions=["global"],
                advanced={"arppu_unit": "daily", "liveops_intensity": payload.get("liveops_intensity", "Medium"),
                          "two_stage_retention": True, "seasonality_regions": ["global"]})
            r = await project_fn(pin)
            fd = {k: list(r["results"]["normal"]["full_data"][k]) for k in ["dau", "nru", "revenue"]}
            fd["nru_analysis"] = (r.get("v85_marketing") or {}).get("nru_analysis")
            fd["bm_applied"] = bm_type
            engine_cache[key] = fd
        idp = copy.deepcopy(w.get("identity_policy") or DEFAULT_IDENTITY.get(plat, DEFAULT_IDENTITY["PC"]))
        ot = levers.get("overlap_target", 1.0)
        idp["same_day_overlap"]["target"] = min(0.95, idp["same_day_overlap"]["target"] * ot)
        _sustain_annual = sustain_m * 12 if sustain_m else round(w["ua_budget"] * scale * 0.1)
        wave_results.append({"wave_id": w["wave_id"], "platform": plat, "offset_days": offset_days,
                             "identity_policy": idp, "dau": fd["dau"], "nru": fd["nru"], "revenue": fd["revenue"],
                             "marketing": {"launch_ua": round(w["ua_budget"] * scale), "launch_brand": round(brand),
                                           "sustain_annual": _sustain_annual,
                                           "sustain_def": "입력값" if sustain_m else "launch UA의 연 10% (엔진 기본)"},
                             "nru_analysis": fd.get("nru_analysis"), "bm_applied": fd.get("bm_applied")})

    combined = ptl.combine_waves(wave_results, total_days)

    # Mode 2층 (원칙 1,2) — ex lever는 target에만
    mode = copy.deepcopy(payload.get("mode", DEFAULT_MODE))
    exl = levers.get("ex_adoption", 1.0)
    mode["ex_only"]["target"] = min(0.6, mode["ex_only"]["target"] * exl)
    mode["both"]["target"] = min(0.6, mode["both"]["target"] * exl)
    synergy = payload.get("synergy", {"retention_lift": 1.0, "monetization_lift": 1.0})
    modes = decompose_modes(combined["unique_account_dau"], mode, synergy)

    # Region (H-core, 원칙 6) + monetization lever + synergy monetization lift
    rmix = resolve_region_mix(payload)  # V14.0.2 #4: global_ex_cn | custom
    reg = region_revenue_multiplier(rmix)
    _bm_ev = BM_EVIDENCE_MODIFIERS.get(payload.get("bm_ui", ""), {"mult": 1.0})
    rev_mult = reg["multiplier"] * levers.get("monetization", 1.0) * modes["revenue_monetization_lift"] * _bm_ev["mult"]
    product_rev = [v * rev_mult for v in combined["product_revenue"]]
    plat_rev = {}
    for wv in wave_results:
        pr = plat_rev.setdefault(wv["platform"], [0.0] * total_days)
        off = wv["offset_days"]
        for t in range(off, total_days):
            wt = t - off
            if wt < len(wv["revenue"]):
                pr[t] += wv["revenue"][wt] * rev_mult

    # Annual summary (launch-relative) + Reliability Horizon (원칙 7)
    years = int(payload.get("horizon_years", 3))
    annual = []
    for y in range(years):
        s, e = y * 365, min((y + 1) * 365, total_days)
        u = combined["unique_account_dau"][s:e]
        vd = td = vr = tr = 0.0
        for wv in wave_results:
            off = wv["offset_days"]
            for t in range(s, e):
                wt = t - off
                if wt < 0 or wt >= len(wv["dau"]):
                    continue
                if wt <= 365:
                    vd += wv["dau"][wt]; vr += wv["revenue"][wt]
                else:
                    td += wv["dau"][wt]; tr += wv["revenue"][wt]
        gross = float(sum(product_rev[s:e]))
        annual.append({
            "year": f"Y{y+1}",
            "unique_nru": int(sum(combined["new_to_product_nru"][s:e])),
            "avg_unique_dau": int(np.mean(u)) if u else 0,
            "peak_unique_dau": int(max(u)) if u else 0,
            "gross_revenue_krw": gross,
            "net_revenue_krw": gross * NET_RATE,
            "tail_share_userdays": round(td / (vd + td), 4) if (vd + td) > 0 else 0.0,
            "tail_share_revenue": round(tr / (vr + tr), 4) if (vr + tr) > 0 else 0.0,
        })
    total_gross = float(sum(product_rev))
    monthly = []
    for m in range(total_days // 30):
        s, e = m * 30, (m + 1) * 30
        row = {"month": f"M{m+1}",
               "unique_dau": int(np.mean(combined["unique_account_dau"][s:e])),
               "revenue_krw": float(sum(product_rev[s:e])),
               "br_only": int(np.mean(modes["br_only"][s:e])),
               "ex_only": int(np.mean(modes["ex_only"][s:e])),
               "both": int(np.mean(modes["both"][s:e]))}
        for p, series in combined["platform_dau"].items():
            row[f"dau_{p}"] = int(np.mean(series[s:e]))
        for p, series in plat_rev.items():
            row[f"rev_{p}"] = float(sum(series[s:e]))
        monthly.append(row)

    # V14.3 계약(A안 확정, 피드백20): PREVIEW ONLY — 공식 annual/monthly/total 절대 불변
    v14_lifecycle = None
    if payload.get("enable_v14_3"):
        evs = payload.get("live_events") or [{"day": d, "type": "major"} for d in range(90, total_days, 90)]
        lc = v14.live_lifecycle(combined["unique_account_dau"], evs, total_days)
        _uplift_dau = float(np.mean(lc["returning_series"]))
        _rev_ratio = (sum(lc["dau_with_lifecycle"]) / max(1.0, sum(combined["unique_account_dau"])))
        v14_lifecycle = {
            "contract": "PREVIEW ONLY — 공식 annual/monthly/total 미반영 (A안, prior 약함)",
            "events": lc["events"], "badge": lc["badge"], "note": lc["note"],
            "preview_effect": {"avg_returning_dau": int(_uplift_dau),
                               "implied_gross_uplift_pct": round((_rev_ratio - 1) * 100, 1)}}

    return {"combined": combined, "modes": modes, "region": reg, "annual": annual,
            "v14_status": {"v14_2_brand": bool(payload.get("enable_v14_2")),
                           "v14_3_lifecycle": v14_lifecycle,
                           "v14_1_anchor": bool(payload.get("retention_anchors")),
                           "v14_4_bm3": bool(payload.get("enable_v14_4"))},
            "wave_results_meta": [{"wave_id": w["wave_id"], "marketing": w["marketing"],
                                    "nru_analysis": w.get("nru_analysis"), "bm_applied": w.get("bm_applied")}
                                   for w in wave_results],
            "monthly": monthly, "total_gross": total_gross,
            "avg_unique_dau_total": float(np.mean(combined["unique_account_dau"])),
            "peak_unique_dau_total": int(max(combined["unique_account_dau"])),
            "per_wave": combined["per_wave"], "revenue_multiplier_applied": rev_mult}


async def run_product_3y(payload: Dict, project_fn, ProjectionInput) -> Dict[str, Any]:
    cache: Dict = {}
    base = await _run_pipeline(payload, project_fn, ProjectionInput, SCENARIO_PRESETS["base"], cache)

    # [V14.0.1 격하] Legacy Lever Envelope — 공식 시나리오 아님 (공식 = Best/Normal/Worst D1 3본)
    scenarios = {}
    _scen = {"base": SCENARIO_PRESETS["base"]} if payload.get("light") else SCENARIO_PRESETS
    for name, lv in _scen.items():
        r = base if name == "base" else await _run_pipeline(payload, project_fn, ProjectionInput, lv, cache)
        scenarios[name] = {"total_gross_krw": r["total_gross"],
                           "annual": [{"year": a["year"], "gross": a["gross_revenue_krw"],
                                       "avg_unique_dau": a["avg_unique_dau"]} for a in r["annual"]],
                           "levers": lv}

    # F. Tornado Sensitivity (±20% 자동, DAU/Revenue 분리) — light 모드 시 스킵 (배포 타임아웃 방어)
    tornado = []
    _levers_run = [] if payload.get("light") else TORNADO_LEVERS
    for lever in _levers_run:
        row = {"lever": lever}
        for d, mult in [("minus20", 0.8), ("plus20", 1.2)]:
            lv = dict(SCENARIO_PRESETS["base"]); lv[lever] = mult
            r = await _run_pipeline(payload, project_fn, ProjectionInput, lv, cache)
            row[f"rev_{d}"] = round(r["total_gross"] / base["total_gross"] - 1, 4) if base["total_gross"] else 0
            row[f"dau_{d}"] = round(r["avg_unique_dau_total"] / base["avg_unique_dau_total"] - 1, 4) if base["avg_unique_dau_total"] else 0
        row["impact"] = max(abs(row["rev_minus20"]), abs(row["rev_plus20"]))
        g = row["impact"]
        row["grade"] = "Very High" if g >= 0.15 else "High" if g >= 0.08 else "Medium" if g >= 0.03 else "Low"
        tornado.append(row)
    tornado.sort(key=lambda x: -x["impact"])

    # D. Top-down Sanity (PUBG stickiness 실측 0.2975)
    stick = 0.2975
    implied_mau_peak = base["peak_unique_dau_total"] / stick
    topdown = {"stickiness_used": stick, "source": "PUBG PC 실측 (Monthly AvgDAU/MAU)",
               "aniimo_reference": {"stickiness": 0.20, "auto_apply": False, "note": "수집RPG 참고치 — 미적용 (원칙 5)"},
               "implied_peak_mau": int(implied_mau_peak),
               "note": "Bottom-up DAU를 MAU로 환산한 sanity 참고값 (자동보정 없음)"}

    warnings = list(base["region"]["warnings"])
    # 원칙 7: D365 이후 외삽이 존재하는 모든 해에 경고 (마지막 해 강제)
    fy = base["annual"][-1] if base["annual"] else None
    if fy and (fy["tail_share_userdays"] > 0 or fy["tail_share_revenue"] > 0):
        warnings.append(f"⚠ {fy['year']} tail-dominant: user-days {fy['tail_share_userdays']*100:.0f}% / revenue {fy['tail_share_revenue']*100:.0f}%가 검증범위(D365) 밖 외삽 — revenue 기준 tail share는 그 자체가 tail 가정 의존 지표 (원칙 7)")
    if payload.get("synergy", {}).get("retention_lift", 1.0) != 1.0 or payload.get("synergy", {}).get("monetization_lift", 1.0) != 1.0:
        warnings.append("⚠ Mode Synergy ≠ 1.00 적용 중 — Scenario assumption, not calibrated (원칙 2)")

    # V13.8: Ordered Projection Bridge — 단계별 실제 재실행 (순서 의존 명시)
    bridge = None
    if payload.get("enable_bridge"):
        steps = [("Generic baseline (D1 28%, BM penalty, no reservoir, organic 20%)",
                  {"target_d1": 0.28, "bm_ui": "__legacy_penalty__", "organic_share_of_total": 0.20, "__no_res": True}),
                 ("+ D1 Gate 28→%d%% 🟠" % round(payload.get("target_d1", 0.5) * 100), {"target_d1": None}),
                 ("+ BM unsupported penalty 제거 🔵", {"bm_ui": None}),
                 ("+ Organic contract 정정 🔵", {"organic_share_of_total": None}),
                 ("+ Known Reservoir (사전등록) 🟡", {"__no_res": False})]
        acc, rows, prev_g = {}, [], None
        for label, delta in steps:
            for k, v in delta.items():
                if v is None:
                    acc.pop(k, None)
                else:
                    acc[k] = v
            p2 = {**payload, **{k: v for k, v in acc.items() if not k.startswith("__")}}
            if acc.get("bm_ui") == "__legacy_penalty__":
                p2["bm_ui"] = "F2P Cosmetic + Battle Pass"
                p2["__legacy_bm_penalty"] = True
            if acc.get("__no_res"):
                p2["waves"] = [{**w, "prereg_users": 0} for w in payload["waves"]]
            r2 = await _run_pipeline(p2, project_fn, ProjectionInput, SCENARIO_PRESETS["base"], cache)
            g = r2["total_gross"]
            rows.append({"step": label, "cumulative_gross_krw": g,
                         "delta_krw": (g - prev_g) if prev_g is not None else 0})
            prev_g = g
        rows.append({"step": "V14 Normal (final)", "cumulative_gross_krw": base["total_gross"],
                     "delta_krw": base["total_gross"] - prev_g})
        bridge = {"label": "Ordered Projection Bridge",
                  "order_note": "Ordered bridge 기준 — D1 → BM → Organic → Reservoir 순 (순서 의존적, Shapley 미적용)",
                  "rows": rows}

    ledger = build_marketing_ledger(
        [{"wave_id": m["wave_id"], "marketing": m["marketing"]} for m in base["wave_results_meta"]],
        int(payload.get("horizon_years", 3)))
    monthly_rev = [m["revenue_krw"] for m in base["monthly"]]
    pnl = build_pnl_bep(base["annual"], monthly_rev, ledger, payload.get("costs"), 
                        int(payload.get("horizon_years", 3)) * 365)

    # V13.7.2: Strategic Hurdle Coverage — 참고선 전용, 엔진 입력에 절대 미전달
    # V14.0.1: Revenue Owner 단일 강제 (V14.4 활성 시 legacy와 동시 사용 금지)
    revenue_owner = "three_layer_bm (V14.4 preview)" if payload.get("enable_v14_4") else "legacy_pr_arppu"
    if payload.get("enable_v14_4"):
        raise ValueError("V14.4 three_layer_bm은 아직 prototype — revenue owner 교체는 Shadow A/B(Gate) 통과 후. "
                         "preview는 /v14-delta-bridge에서 확인")

    hurdle = payload.get("strategic_hurdle") or {}
    coverage = None
    if hurdle:
        fcy_off = int(hurdle.get("fcy_start_year_index", 1))
        cov = []
        for i, key in enumerate(["fcy1", "fcy2", "fcy3"]):
            if hurdle.get(key) and len(base["annual"]) > fcy_off + i:
                g = base["annual"][fcy_off + i]["gross_revenue_krw"]
                cov.append({"period": key.upper(), "projection_krw": g, "hurdle_krw": hurdle[key],
                            "coverage_pct": round(g / hurdle[key] * 100, 1)})
        coverage = {"label": "Strategic Hurdle Coverage",
                    "disclaimer": "Reference only — does not affect projection (No Target Leakage)",
                    "rows": cov}

    # V13.8: Confidence Badge (provenance — 확률 아님)
    ev_state = {
        "target_d1": {"value": payload.get("target_d1"), "badge": v14.BADGE["gate"], "source": "Investment Gate"},
        "prereg_activation": {"value": payload["waves"][0].get("prereg_activation_rate"),
                              "badge": v14.BADGE["evidence_informed"], "source": "NEW STATE launch-scale evidence (individual activation unmeasured)"},
        "organic_share": {"value": payload.get("organic_share_of_total"), "badge": v14.BADGE["benchmark"], "source": "genre/platform prior"},
        "bm_modifier": {"value": 1.0, "badge": v14.BADGE["benchmark"], "source": "중립화 — evidence-backed delta 확보 전"},
        "region_factors": {"value": "mixed", "badge": v14.BADGE["benchmark"], "source": "measured + shrunk + proxy"},
        "tail_y2_y3": {"value": "extrapolated", "badge": v14.BADGE["unvalidated"], "source": "D365 이후 미검증"},
        "mode_synergy": {"value": 1.00, "badge": v14.BADGE["gate"], "source": "CBT 전 중립 고정"},
    }
    if payload.get("enable_v14_3"):
        ev_state["live_reactivation"] = {"value": "stock-flow", "badge": v14.BADGE["evidence_informed"], "source": "V14.3 prior"}
    n_ei = sum(1 for v in ev_state.values() if "Evidence-informed" in v["badge"])
    n_un = sum(1 for v in ev_state.values() if "Unvalidated" in v["badge"])
    evidence_summary = (f"이 프로젝션은 evidence-informed assumption {n_ei}개와 "
                        f"unvalidated assumption {n_un}개를 포함합니다. (Confidence Badge = provenance 표시, 확률 아님)")

    return {
        "status": "success", "engine": "product_3y_v14",
        "strategic_hurdle_coverage": coverage,
        "confidence": {"evidence_state": ev_state, "summary": evidence_summary,
                       "definition": "provenance / evidence maturity — 신뢰도 점수(확률) 아님"},
        "conditional_notice": {
            "headline": "GW Conditional Projection — conditional on Product Gate achievement",
            "disclaimer": "This is not a sales commitment. Projection conditional on product-performance assumptions."},
        "assumption_lineage": [
            v14.lineage_entry("target_d1", payload.get("target_d1"), "gate", "Investment Gate (D1 40/50/60)", _snapshot(payload)["assumption_set_id"]),
            v14.lineage_entry("prereg_activation_rate", payload["waves"][0].get("prereg_activation_rate"), "evidence_informed",
                              "NEW STATE launch-scale evidence (individual unmeasured)", _snapshot(payload)["assumption_set_id"], sample_n=1),
            v14.lineage_entry("organic_share_of_total", payload.get("organic_share_of_total"), "benchmark",
                              "PC BR prior 36.4%", _snapshot(payload)["assumption_set_id"]),
        ],
        "v14_status": base.get("v14_status"),
        "projection_bridge": bridge,
        "marketing_ledger": ledger,
        "nru_breakdown": {m["wave_id"]: m["nru_analysis"] for m in base["wave_results_meta"]},
        "bm_applied": {m["wave_id"]: m["bm_applied"] for m in base["wave_results_meta"]},
        "pnl": pnl,
        "freeze_principles": "1.mode≠DAU증가 2.synergy=scenario 3.overlap=dedup만 4.rev=attributed합산 5.aniimo=ref만 6.proxy경고 7.Y3경고 8.BM=recipe1:1 9.3-mode명확 10.snapshot저장",
        "assumption_set": _snapshot(payload),
        "bm_recipe": BM_RECIPE_MAP.get(payload.get("bm_ui", ""), {"engine_recipe": "launch_f2p_iap", "note": "미매핑 UI BM → 기본 recipe"}),
        "reference_mode": {**REFERENCE_MODES[payload.get("reference_mode", "auto")], "selected": payload.get("reference_mode", "auto")},
        "revenue_engine": {"active": "legacy_pr_arppu (official)",
                           "candidates": {"arpdau": "Shadow A/B 대기", "three_layer_bm": "V14.4 prototype — opt-in integration 대기"}},
        "v14_integration_status": {"v14_1_retention_anchor": "prototype (미통합)", "v14_2_independent_acquisition": "opt-in (brand 단독 유입)",
                                    "v14_3_live_lifecycle": "PREVIEW ONLY (공식 미반영)", "v14_4_three_layer": "prototype (owner gate 대기)"},
        "annual_summary": base["annual"],
        "total": {"gross_krw": base["total_gross"], "net_krw": base["total_gross"] * NET_RATE,
                  "avg_unique_dau": int(base["avg_unique_dau_total"]), "peak_unique_dau": base["peak_unique_dau_total"]},
        "monthly": base["monthly"],
        "mode_summary": {"synergy_label": base["modes"]["synergy_label"], "identity_check": base["modes"]["identity_check"]},
        "region": base["region"],
        "legacy_lever_envelope": {"label": "Legacy Lever Envelope (Advanced Sensitivity)",
            "warning": "Do not use for official GW scenario — 공식 3본은 official_scenarios(D1 40/50/60) 사용",
            "scenarios": scenarios},
        "tornado_sensitivity": tornado,
        "topdown_sanity": topdown,
        "per_wave": base["per_wave"],
        "calibration_status": {"retention_d1": "assumption", "wave_scale": "prior(PUBG)", "overlap": "assumption(Aniimo ref)",
                               "region_factors": "mixed(measured+proxy)", "mode_mix": "assumption", "synergy": "assumption(1.00)"},
        "warnings": warnings,
    }


def build_excel(result: Dict) -> bytes:
    """Excel 10시트 (7-3 완성판)"""
    from openpyxl import Workbook
    from io import BytesIO
    wb = Workbook()
    bold = None

    def sheet(name, rows):
        ws = wb.create_sheet(name)
        for r in rows:
            ws.append(r)
        return ws

    wb.remove(wb.active)
    t = result["total"]
    sheet("01_Executive_Summary", [
        ["Product 3-Year Projection", result["assumption_set"]["assumption_set_id"]],
        [], ["KPI", "Value"],
        ["3Y Gross Revenue (KRW)", t["gross_krw"]], ["3Y Net Revenue (KRW)", t["net_krw"]],
        ["Avg Unique DAU", t["avg_unique_dau"]], ["Peak Unique DAU", t["peak_unique_dau"]],
        [], ["Year", "Unique NRU", "Avg uDAU", "Peak uDAU", "Gross", "Net", "TailShare(UD)", "TailShare(Rev)"],
        *[[a["year"], a["unique_nru"], a["avg_unique_dau"], a["peak_unique_dau"],
           a["gross_revenue_krw"], a["net_revenue_krw"], a["tail_share_userdays"], a["tail_share_revenue"]]
          for a in result["annual_summary"]],
        [], ["Revenue Engine", result["revenue_engine"]["active"]],
        [], ["── P&L Waterfall ──"],
        ["Year", "Gross", "Net(0.57)", "Marketing", "Contribution", "HR", "Operating"],
        *[[w["year"], w["gross_bookings"], w["net_revenue"], w["marketing"],
           w["contribution_profit"], w["hr_cost"], w["operating_profit"]]
          for w in result.get("pnl", {}).get("waterfall", [])],
        [], ["Marketing BEP", result.get("pnl", {}).get("bep", {}).get("marketing_bep_month", "-")],
        ["Full Cost BEP", result.get("pnl", {}).get("bep", {}).get("full_cost_bep_month", "-")],
        ["Marketing Ledger Total", result.get("marketing_ledger", {}).get("total_horizon", 0)],
    ])
    mk = list(result["monthly"][0].keys()) if result["monthly"] else []
    sheet("02_Monthly_Product_KPI", [mk, *[[m.get(k) for k in mk] for m in result["monthly"]]])
    plats = sorted({k[4:] for m in result["monthly"] for k in m if k.startswith("dau_")})
    sheet("03_Platform_Breakdown", [["month", *[f"dau_{p}" for p in plats], *[f"rev_{p}" for p in plats]],
        *[[m["month"], *[m.get(f"dau_{p}", 0) for p in plats], *[m.get(f"rev_{p}", 0) for p in plats]] for m in result["monthly"]]])
    sheet("04_Mode_Breakdown", [["month", "br_only", "ex_only", "both", "synergy"],
        *[[m["month"], m["br_only"], m["ex_only"], m["both"], result["mode_summary"]["synergy_label"]] for m in result["monthly"]]])
    sheet("05_Wave_Breakdown", [["wave_id", "platform", "offset_days", "cumulative_revenue", "new_to_product_nru"],
        *[[k, v["platform"], v["offset_days"], v["cumulative_revenue"], v["total_new_to_product_nru"]]
          for k, v in result["per_wave"].items()]])
    lle = result.get("legacy_lever_envelope", {})
    sheet("06_Legacy_Lever_Envelope", [["⚠ " + lle.get("warning", "")],
        ["scenario", "total_gross_krw", "levers"],
        *[[n, s2["total_gross_krw"], json.dumps(s2["levers"])] for n, s2 in lle.get("scenarios", {}).items()]])
    sheet("07_Sensitivity_Tornado", [["lever", "rev-20%", "rev+20%", "dau-20%", "dau+20%", "grade"],
        *[[r["lever"], r["rev_minus20"], r["rev_plus20"], r["dau_minus20"], r["dau_plus20"], r["grade"]]
          for r in result["tornado_sensitivity"]]])
    sheet("08_Reliability", [["Annual Reliability Horizon"],
        ["Year", "TailShare(UserDays)", "TailShare(Revenue)"],
        *[[a["year"], a["tail_share_userdays"], a["tail_share_revenue"]] for a in result["annual_summary"]],
        [], ["Warnings"], *[[w] for w in result["warnings"]],
        [], ["주의: revenue 기준 tail share는 tail 구간 ARPPU 가정 자체가 미검증이므로 이중으로 가정 의존적임"]])
    av = result["assumption_set"]["values"]
    sheet("09_Assumptions", [["assumption_set_id", result["assumption_set"]["assumption_set_id"]],
        ["created_at", result["assumption_set"]["created_at"]], [],
        *[[k, json.dumps(v, ensure_ascii=False, default=str)] for k, v in av.items()],
        [], ["calibration_status"], *[[k, v] for k, v in result["calibration_status"].items()]])
    sheet("10_Data_Prior_Sources", [["source", "detail"],
        ["wave_scale_prior", "PUBG 실측: Console=PC rev 20.7%/DAU 12.5%, Mobile KR+JP=27.5% (scale-only)"],
        ["overlap reference", "Aniimo cross-platform 중복값 0.8 (reference only, auto-apply 금지)"],
        ["stickiness", "PUBG PC 실측 0.2975 (top-down sanity)"],
        ["region factors", json.dumps({k: v["factor"] for k, v in REGION_FACTORS.items()})],
        ["freeze_principles", result["freeze_principles"]]])
    hc = result.get("strategic_hurdle_coverage") or {}
    sheet("11_Strategic_Hurdle", [[hc.get("label", "Strategic Hurdle Coverage")],
        [hc.get("disclaimer", "Reference only — does not affect projection")],
        ["Period", "Projection(KRW)", "Hurdle(KRW)", "Coverage%"],
        *[[r["period"], r["projection_krw"], r["hurdle_krw"], r["coverage_pct"]] for r in hc.get("rows", [])]])
    br = result.get("projection_bridge") or {}
    sheet("12_Projection_Bridge", [[br.get("label", "Projection Bridge (enable_bridge=true로 생성)")],
        [br.get("order_note", "")], ["Step", "Cumulative Gross", "Delta"],
        *[[r["step"], r["cumulative_gross_krw"], r["delta_krw"]] for r in br.get("rows", [])]])
    cf = result.get("confidence", {})
    sheet("13_Confidence_Badge", [[cf.get("definition", "")], [cf.get("summary", "")],
        ["Variable", "Value", "Badge", "Source"],
        *[[k, str(v.get("value")), v.get("badge"), v.get("source")] for k, v in cf.get("evidence_state", {}).items()],
        [], [result.get("conditional_notice", {}).get("headline", "")],
        [result.get("conditional_notice", {}).get("disclaimer", "")]])
    lin = result.get("assumption_lineage") or []
    sheet("14_Assumption_Lineage", [["Variable", "Value", "Status/Badge", "Source", "SampleN", "Snapshot", "Date"],
        *[[e.get("variable"), str(e.get("value")), e.get("badge", e.get("status")), e.get("source"),
           e.get("sample_n"), e.get("snapshot_id"), e.get("date")] for e in lin],
        [], ["V14 Integration Status"],
        *[[k, str(vv)] for k, vv in (result.get("v14_integration_status") or {}).items()]])
    bio = BytesIO(); wb.save(bio)
    return bio.getvalue()
