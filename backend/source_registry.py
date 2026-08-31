# -*- coding: utf-8 -*-
"""V14.4.0: Input Source Registry — 4단계 근거 언어 (피드백28 검증자 스키마)
Observed > Evidence-informed > Scenario > Derived"""
EVIDENCE_LEVELS = {
    "observed": "🔵 Observed — 실측/외부 패널 관측 (정의 검산 포함)",
    "evidence_informed": "🟡 Evidence-informed — 관측 기반 추정/절충 (직접 실측 아님)",
    "scenario": "🟠 Scenario — 사업 가정/planning 입력 (근거 링크 없음)",
    "derived": "⚫ Derived — 타 값에서 산술 파생 (독립 근거 아님)",
}
INPUT_SOURCE_REGISTRY = {
    "target_d1_50pct": {"level": "scenario", "source": "투자 Gate(D1 40%) 상회 조건부 가정 · peer p98", "owner": "GPD", "validation": "Alpha/CBT cohort"},
    "prereg_activation_40pct": {"level": "evidence_informed", "source": "NEW STATE launch-scale aggregate (개인 전환 미실측)", "owner": "Marketing", "validation": "사전예약→유입 개인 추적"},
    "organic_share_36.4pct": {"level": "evidence_informed", "source": "내부 PC BR prior (원문 링크 보강 필요)", "owner": "UA", "validation": "Soft launch attribution"},
    "cpa_pc_7500": {"level": "scenario", "source": "source_pending — 내부 캠페인 실측 링크 없음", "owner": "UA", "validation": "UA campaign wiki"},
    "cpa_mobile_4000": {"level": "evidence_informed", "source": "NEW STATE KR CPI ₩3,578 실측 앵커", "owner": "UA", "validation": "GW soft launch CPI"},
    "cpa_console_9000": {"level": "scenario", "source": "source_pending", "owner": "UA", "validation": "플랫폼 캠페인 ref"},
    "pur_pc_10pct": {"level": "observed", "source": "Newzoo PC live shooter 패널 n=15 median 15.7% 대비 보수 (정의=ARPU/ARPPU 검산)", "owner": "BI", "validation": "GW payer 실측"},
    "pur_console_7pct": {"level": "observed", "source": "Newzoo Console 패널 n=14 median 5.8% 기준 Base", "owner": "BI", "validation": "동일"},
    "pur_mobile_3pct": {"level": "evidence_informed", "source": "Delta Force ex-CN ARPDAU $0.03~0.04 implied 1.5~3% 상단", "owner": "BI", "validation": "Mobile payer 실측"},
    "arppu_sno": {"level": "derived", "source": "월매출÷(MAU×PUR) 총액불변 파생 — 독립 근거 아님", "owner": "BI", "validation": "패널 ARPPU 대조"},
    "stickiness_0.2975": {"level": "observed", "source": "PUBG PC 실측 — 단 Newzoo core 패널 21~26% 대비 high-side", "owner": "BI", "validation": "GW 실측"},
    "mode_mix_overlap": {"level": "scenario", "source": "유저군 분해/중복 제거용 — 성과 상향 요인 아님", "owner": "GPD", "validation": "CBT 모드 로그"},
    "mode_synergy_lifts": {"level": "evidence_informed", "source": "Delta Force-informed 보수 prior (코호트 uplift 원시값 미확보)", "owner": "BI", "validation": "BR/EX cohort 비교"},
    "bm_modifier_0.85": {"level": "observed", "source": "내부 35종 PR×ARPPU by BM class, clamp [0.85,1.20] (장르혼재 주의)", "owner": "BI", "validation": "CBT store test"},
}
def get_registry():
    return {"levels": EVIDENCE_LEVELS, "registry": INPUT_SOURCE_REGISTRY,
            "note": "모든 핵심 입력의 근거 등급·출처·검증 경로 — 'source pending' 항목이 UA/BI 확인 1순위"}
