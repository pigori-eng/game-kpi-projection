# -*- coding: utf-8 -*-
"""
V14.1~14.4 Engines — 전부 기본 OFF (opt-in). 활성화 시 badge/warning 강제.
V14.1 Retention Anchor / V14.2 Independent Acquisition / V14.3 Live Lifecycle / V14.4 3-Layer Monetization
"""
from typing import List, Dict, Any, Optional
import numpy as np

# ── Confidence Badge (provenance — 확률 아님, 피드백19 §2) ──────────
BADGE = {"measured": "🟢 Measured", "benchmark": "🔵 Internal benchmark",
         "evidence_informed": "🟡 Evidence-informed assumption",
         "gate": "🟠 Gate/Policy assumption", "unvalidated": "⚪ Unvalidated"}


# ══ V14.1 Retention Anchor ═══════════════════════════════════════════
# D1→D7→D30→D90 anchor 기반 커브. D30 벤치 보정과 이중적용 금지(anchor 우선).
def anchored_retention_curve(anchors: Dict[str, float], days: int) -> Dict[str, Any]:
    """anchors: {d1, d7, d30, d90}. 구간별 power-law 보간 + D90 이후 완만 tail."""
    pts = [(1, anchors["d1"]), (7, anchors["d7"]), (30, anchors["d30"]), (90, anchors["d90"])]
    for i in range(1, len(pts)):
        if pts[i][1] > pts[i - 1][1]:
            raise ValueError(f"retention anchor 단조감소 위반: D{pts[i][0]}={pts[i][1]} > D{pts[i-1][0]}")
    curve = [1.0]
    for d in range(1, days + 1):
        if d >= 90:
            b = np.log(pts[3][1] / pts[2][1]) / np.log(90 / 30)  # D30→D90 기울기 연장
            v = pts[3][1] * (d / 90) ** b
        else:
            for i in range(1, len(pts)):
                if d <= pts[i][0]:
                    x0, y0 = pts[i - 1]; x1, y1 = pts[i]
                    b = np.log(y1 / y0) / np.log(x1 / x0)
                    v = y0 * (d / x0) ** b
                    break
        curve.append(float(max(0.0, min(1.0, v))))
    return {"curve": curve[:days], "anchors": anchors,
            "badge": BADGE["gate"], "note": "anchor 기반 — D30 benchmark 보정 비적용(이중적용 방지)"}


# ══ V14.2 Independent Acquisition ════════════════════════════════════
# Brand 단독 유입(Awareness→Organic install) + 플랫폼별 독립 파라미터
PLATFORM_ACQ_DEFAULTS = {
    "PC":      {"organic_share": 0.364, "cpi_krw": 7500, "brand_reach_cpm": 8000, "badge": "benchmark"},
    "Mobile":  {"organic_share": 0.45, "cpi_krw": 3578, "brand_reach_cpm": 5000, "badge": "measured"},  # KR CPI 실측
    "Console": {"organic_share": 0.30, "cpi_krw": 9000, "brand_reach_cpm": 9000, "badge": "evidence_informed"},
}

def brand_independent_installs(brand_budget: float, platform: str,
                                awareness_to_install: float = 0.02) -> Dict[str, Any]:
    """
    Brand → Reach(CPM) → Awareness → Install. Paid UA=0이어도 유입 발생 (V13 구조 한계 해소).
    수확체감: 도달 중복으로 유효 reach는 log 포화.
    """
    p = PLATFORM_ACQ_DEFAULTS.get(platform, PLATFORM_ACQ_DEFAULTS["PC"])
    if brand_budget <= 0:
        return {"installs": 0, "reach": 0, "badge": BADGE["unvalidated"]}
    raw_reach = brand_budget / p["brand_reach_cpm"] * 1000
    eff_reach = raw_reach / (1 + raw_reach / 5e7)  # 5천만 도달에서 포화
    return {"installs": int(eff_reach * awareness_to_install), "reach": int(eff_reach),
            "awareness_to_install": awareness_to_install,
            "badge": BADGE["evidence_informed"],
            "note": "Brand 단독 유입 (V14.2) — awareness→install 전환은 assumption"}


# ══ V14.3 Live Lifecycle Model (stock-flow, not uplift) ══════════════
def live_lifecycle(base_dau: List[float], events: List[Dict], total_days: int,
                   dormant_window: int = 90) -> Dict[str, Any]:
    """
    Active/Dormant/Churned stock-flow. Major/Minor 업데이트가 Dormant→Active 복귀시킴.
    events: [{day, type: major|minor, reactivation_rate, returning_d30_retention}]
    복귀 코호트는 자체 리텐션으로 감쇠 (영구 가산 금지).
    """
    dau = list(base_dau) + [0.0] * max(0, total_days - len(base_dau))
    dormant = [0.0] * total_days
    returning = [0.0] * total_days
    # Dormant pool 근사: 최근 이탈 누적 (peak 이후 감소분이 dormant로 적재, window 후 churned)
    # 이탈 flow = 전일 대비 감소분 + 정상 이탈(리텐션 감쇠로 매일 빠지는 분, 최소 1%/일 가정)
    for t in range(1, total_days):
        churn_flow = max(0.0, dau[t - 1] - dau[t]) + dau[t] * 0.01
        dormant[t] = dormant[t - 1] + churn_flow
        if t >= dormant_window:
            dormant[t] -= dormant[t - dormant_window] * 0.02  # 일부는 churned로 이탈
        dormant[t] = max(0.0, dormant[t])
    out = [0.0] * total_days
    log = []
    for ev in sorted(events, key=lambda e: e["day"]):
        d0 = int(ev["day"])
        if d0 >= total_days:
            continue
        pool = dormant[d0]
        rate = float(ev.get("reactivation_rate", 0.07 if ev.get("type") == "major" else 0.02))
        ret30 = float(ev.get("returning_d30_retention", 0.31))
        ru = pool * rate
        log.append({"day": d0, "type": ev.get("type", "major"), "dormant_pool": int(pool),
                    "reactivation_rate": rate, "returning_au": int(ru)})
        for t in range(d0, total_days):
            age = t - d0
            decay = ret30 ** (age / 30) if age > 0 else 1.0
            out[t] += ru * decay
    combined = [dau[t] + out[t] for t in range(total_days)]
    return {"dau_with_lifecycle": combined, "returning_series": out, "dormant_series": dormant,
            "events": log, "badge": BADGE["evidence_informed"],
            "note": "Stock-flow 재활성 — reactivation_rate는 NEW STATE/PUBG prior 기반 assumption (실측 Return AU 확보 시 승격)"}


# ══ V14.4 3-Layer Monetization ═══════════════════════════════════════
def three_layer_revenue(nru: List[float], dau: List[float], cfg: Dict) -> Dict[str, Any]:
    """
    Entry(신규 첫구매) + Repeat(패스) + High-ARPU(프리미엄). Legacy PR×ARPPU와 배타 (Revenue Owner Gate).
    cfg: {first_purchase_cvr, entry_bundle_krw, pass_attach_rate, pass_price_krw, season_days,
          premium_spender_rate, premium_monthly_krw}
    """
    n = len(dau)
    fp = cfg.get("first_purchase_cvr", 0.025)      # GW Gate Pay CVR 2.5%
    entry_v = cfg.get("entry_bundle_krw", 12000)
    attach = cfg.get("pass_attach_rate", 0.12)
    pass_p = cfg.get("pass_price_krw", 15000)
    season = int(cfg.get("season_days", 90))
    prem_r = cfg.get("premium_spender_rate", 0.004)
    prem_m = cfg.get("premium_monthly_krw", 90000)
    entry = [nru[t] * fp * entry_v if t < len(nru) else 0.0 for t in range(n)]
    repeat = [(dau[t] * attach * pass_p / season) for t in range(n)]
    high = [(dau[t] * prem_r * prem_m / 30) for t in range(n)]
    total = [entry[t] + repeat[t] + high[t] for t in range(n)]
    return {"daily_revenue": total, "entry": entry, "repeat": repeat, "high_arpu": high,
            "cumulative": {"entry": float(sum(entry)), "repeat": float(sum(repeat)),
                           "high_arpu": float(sum(high)), "total": float(sum(total))},
            "config": cfg, "badge": BADGE["evidence_informed"],
            "revenue_owner": "three_layer_bm (V14.4) — legacy PR×ARPPU와 동시 사용 금지(double count)"}


# ══ V13.8 Assumption Lineage ═════════════════════════════════════════
def lineage_entry(variable: str, value: Any, status: str, source: str,
                  snapshot_id: str, sample_n: Optional[int] = None,
                  date: Optional[str] = None) -> Dict[str, Any]:
    from datetime import datetime
    return {"variable": variable, "value": value, "status": status, "badge": BADGE.get(status, status),
            "source": source, "sample_n": sample_n, "snapshot_id": snapshot_id,
            "date": date or datetime.now().strftime("%Y-%m-%d")}


def diff_assumption_sets(prev: Dict, curr: Dict) -> List[Dict[str, Any]]:
    """스냅샷 diff 자동 생성 (사람은 status/source/sample_n만 보강)"""
    out = []
    for k in set(list(prev.keys()) + list(curr.keys())):
        a, b = prev.get(k), curr.get(k)
        if a != b:
            out.append({"variable": k, "from": a, "to": b, "status": "unlabeled — evidence type 보강 필요"})
    return out
