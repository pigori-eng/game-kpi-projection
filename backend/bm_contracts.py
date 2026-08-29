# -*- coding: utf-8 -*-
"""
BM Contract (V14.1.0) — Single Wave와 Launch Projection이 공유하는 단일 계약
원칙 (피드백17/23):
 1. Manual/Hybrid에서 유효 PR·ARPPU 표본 존재 → modifier 1.0 (표본에 BM 결과가 이미 포함 — 이중반영 금지)
 2. Benchmark-only → evidence-backed modifier만 [0.85~1.20], 없으면 1.0 + badge
"""
from typing import List, Dict, Any

# 내부 실측 산출 (PR×ARPPU by BM class vs 전체 median, clamp [0.85, 1.20]) — V14.0.2에서 산출
# cosmetic_pass raw 0.53→0.85 (n=7) / gacha raw 3.27→1.20 (n=8) / consumable raw 1.29→1.20 (n=3)
BM_EVIDENCE_MODIFIERS: Dict[str, Dict[str, Any]] = {
    "F2P Cosmetic + Battle Pass": {"mult": 0.85, "pr_mod": 0.92, "arppu_mod": 0.92,
        "badge": "🔵 Internal benchmark (n=7, clamped, 장르혼재 주의)"},
    "F2P Gacha": {"mult": 1.20, "pr_mod": 1.10, "arppu_mod": 1.09,
        "badge": "🔵 Internal benchmark (n=8, clamped)"},
    "F2P Consumable": {"mult": 1.20, "pr_mod": 1.10, "arppu_mod": 1.09,
        "badge": "🔵 Internal benchmark (n=3, clamped)"},
    "B2P Package": {"mult": 1.00, "pr_mod": 1.0, "arppu_mod": 1.0, "badge": "⚪ 표본 구조 상이 — 중립"},
    "Hybrid F2P + DLC": {"mult": 1.00, "pr_mod": 1.0, "arppu_mod": 1.0, "badge": "⚪ evidence 없음 — 중립"},
    "Subscription": {"mult": 1.00, "pr_mod": 1.0, "arppu_mod": 1.0, "badge": "⚪ evidence 없음 — 중립"},
}

# 레거시 bm_type(단일 프로젝션 UI) → evidence class 매핑
LEGACY_BM_TYPE_TO_CLASS = {
    "F2P_Cosmetic": "F2P Cosmetic + Battle Pass",
    "Gacha": "F2P Gacha",
    "Casual": "F2P Consumable",
    "Hardcore": "B2P Package",   # 중립
    "Midcore": None,              # 중립
}


def resolve_bm_modifier(bm_type: str, use_benchmark_only: bool,
                        selected_pr_games: List[str], selected_arppu_games: List[str]) -> Dict[str, Any]:
    """Single Wave용 BM modifier 계약 해석 (Launch Projection과 동일 철학)"""
    has_valid_samples = bool(selected_pr_games) and bool(selected_arppu_games)
    if has_valid_samples and not use_benchmark_only:
        return {"pr_mod": 1.0, "arppu_mod": 1.0, "mult": 1.0,
                "mode": "sample_present_modifier_disabled",
                "badge": "🔵 Sample-based / BM modifier disabled",
                "warning": "표본 PR/ARPPU에는 BM 결과가 이미 포함되어 있어 modifier를 적용하지 않음 (이중반영 방지)"}
    cls = LEGACY_BM_TYPE_TO_CLASS.get(bm_type, bm_type)
    ev = BM_EVIDENCE_MODIFIERS.get(cls) if cls else None
    if ev and ev["mult"] != 1.0:
        return {"pr_mod": ev["pr_mod"], "arppu_mod": ev["arppu_mod"], "mult": ev["mult"],
                "mode": "benchmark_only_evidence_modifier", "badge": ev["badge"],
                "warning": f"benchmark 경로 — evidence-backed modifier ×{ev['mult']} 적용 (clamp [0.85,1.20])"}
    return {"pr_mod": 1.0, "arppu_mod": 1.0, "mult": 1.0, "mode": "neutral_no_evidence",
            "badge": "🟠 Neutral modifier / no evidence",
            "warning": "근거 있는 BM modifier가 없어 1.0 적용"}
