# -*- coding: utf-8 -*-
"""
P0: Metric Contract — 직교 분해 스키마 + 4단계 호환성 + 변환 레지스트리
설계 Freeze 사양 (피드백 라운드 1~3 반영):
  - metric_semantics는 자유텍스트 금지, 폐쇄형 enum
  - 호환성은 semantics 단독이 아니라 contract 전체 조합으로 판정
  - Conformal calibration은 COMPATIBLE only
  - TRANSFORMABLE은 등록된 변환함수 + 왕복 테스트 통과 후 canonical form으로만
"""
from enum import Enum
from typing import Dict, Any, Optional, Callable


# ── 직교 차원 enum (폐쇄형) ─────────────────────────────────
class MetricSemantics(str, Enum):
    NEW_INSTALL_COHORT_RETENTION = "new_install_cohort_retention"
    ACTIVE_USER_RETURN_RATE = "active_user_return_rate"
    DAILY_PAYMENT_RATE = "daily_payment_rate"
    DAILY_ARPPU = "daily_arppu"
    MONTHLY_ARPPU = "monthly_arppu"
    DAILY_NRU = "daily_nru"
    MONTHLY_AVG_DAU_PROXY = "panel_estimated_monthly_avg_dau_proxy"


class CohortScope(str, Enum):
    ALL = "all"
    PAID = "paid"
    ORGANIC = "organic"


class MeasurementMethod(str, Enum):
    FIRST_PARTY_OBSERVED = "first_party_observed"
    PANEL_ESTIMATED = "panel_estimated"
    RECONSTRUCTED = "reconstructed"


class ActivityDefinition(str, Enum):
    LOGIN = "login"
    SESSION = "session"
    GAMEPLAY = "gameplay"
    UNKNOWN = "unknown"


class WindowDefinition(str, Enum):
    EXACT_DAY = "exact_day"
    ROLLING_WINDOW = "rolling_window"
    UNKNOWN = "unknown"


class Compatibility(str, Enum):
    COMPATIBLE = "COMPATIBLE"          # 절대값 블렌딩/회귀/Conformal 허용
    TRANSFORMABLE = "TRANSFORMABLE"    # 등록 변환 후 canonical form으로만 허용
    RELATIVE_ONLY = "RELATIVE_ONLY"    # percentile/rank/shape만 허용
    FORBIDDEN = "FORBIDDEN"            # 어떤 계산에도 사용 금지


REQUIRED_FIELDS = ["metric_name", "metric_semantics", "measurement_method"]


_ENUM_FIELDS = {
    "metric_semantics": MetricSemantics,
    "measurement_method": MeasurementMethod,
    "cohort_scope": CohortScope,
    "activity_definition": ActivityDefinition,
    "window_definition": WindowDefinition,
}

def validate_contract(c: Dict[str, Any], strict: bool = True) -> Dict[str, Any]:
    """[V13.1] 6차원 전체 enum 검증. 필수필드 누락/미등록 값 → strict 시 예외."""
    errors = []
    for f in REQUIRED_FIELDS:
        if f not in c or c[f] in (None, ""):
            errors.append(f"missing required field: {f}")
    for field, enum_cls in _ENUM_FIELDS.items():
        if field in c and c[field] not in (None, ""):
            if c[field] not in [e.value for e in enum_cls]:
                errors.append(f"unknown {field}: {c.get(field)} (enum 등록 필요)")
    if errors and strict:
        raise ValueError("MetricContract violation: " + "; ".join(errors))
    return {"valid": not errors, "errors": errors}


# ── 변환 레지스트리 (TRANSFORMABLE 자격 = 등록 + 왕복 항등) ──
def _monthly_to_daily_arppu(v: float) -> float:
    return v / 30.0


def _daily_to_monthly_arppu(v: float) -> float:
    return v * 30.0


TRANSFORM_REGISTRY: Dict[tuple, Dict[str, Callable]] = {
    (MetricSemantics.MONTHLY_ARPPU.value, MetricSemantics.DAILY_ARPPU.value): {
        "forward": _monthly_to_daily_arppu, "inverse": _daily_to_monthly_arppu,
    },
    (MetricSemantics.DAILY_ARPPU.value, MetricSemantics.MONTHLY_ARPPU.value): {
        "forward": _daily_to_monthly_arppu, "inverse": _monthly_to_daily_arppu,
    },
}


def check_compatibility(a: Dict[str, Any], b: Dict[str, Any],
                        purpose: str = "blend") -> Compatibility:
    """
    contract 전체 조합으로 판정.
    purpose: "blend" | "regression" | "conformal" | "relative"
    규칙:
      - 어느 쪽이든 semantics 불명 → FORBIDDEN
      - metric_name 다름 → FORBIDDEN
      - semantics 동일 + measurement 동일(또는 둘 다 first-party 계열) → COMPATIBLE
      - semantics는 변환 레지스트리에 존재 → TRANSFORMABLE
      - semantics 동일하나 measurement 다름 (first_party vs panel) → RELATIVE_ONLY
      - semantics 다름 (install cohort vs return rate 등) → RELATIVE_ONLY
      - Conformal은 COMPATIBLE only (TRANSFORMABLE도 canonical 변환 후 재판정)
    """
    for c in (a, b):
        if not c.get("metric_semantics") or not c.get("measurement_method"):
            return Compatibility.FORBIDDEN
    if a.get("metric_name") != b.get("metric_name"):
        return Compatibility.FORBIDDEN

    sem_a, sem_b = a["metric_semantics"], b["metric_semantics"]
    mm_a, mm_b = a["measurement_method"], b["measurement_method"]
    scope_a = a.get("cohort_scope", CohortScope.ALL.value)
    scope_b = b.get("cohort_scope", CohortScope.ALL.value)

    # V13.1: activity/window 차원도 비교 (양쪽 모두 명시 & 상이 → RELATIVE_ONLY 강등)
    def _dim_conflict(field):
        va, vb = a.get(field), b.get(field)
        return (va and vb and va != "unknown" and vb != "unknown" and va != vb)
    dim_conflict = _dim_conflict("activity_definition") or _dim_conflict("window_definition")

    if sem_a == sem_b and mm_a == mm_b and scope_a == scope_b and not dim_conflict:
        result = Compatibility.COMPATIBLE
    elif (sem_a, sem_b) in TRANSFORM_REGISTRY and mm_a == mm_b and scope_a == scope_b and not dim_conflict:
        result = Compatibility.TRANSFORMABLE
    else:
        result = Compatibility.RELATIVE_ONLY

    if purpose == "conformal" and result != Compatibility.COMPATIBLE:
        # Conformal은 exchangeability 전제 → COMPATIBLE only
        return (Compatibility.FORBIDDEN if result == Compatibility.RELATIVE_ONLY
                else Compatibility.TRANSFORMABLE)  # 변환 완료 후 canonical로 재판정 필요
    return result


def transform_value(v: float, from_sem: str, to_sem: str) -> float:
    key = (from_sem, to_sem)
    if key not in TRANSFORM_REGISTRY:
        raise ValueError(f"unregistered transform: {from_sem} → {to_sem}")
    return TRANSFORM_REGISTRY[key]["forward"](v)


def roundtrip_ok(from_sem: str, to_sem: str, probe: float = 30000.0, tol: float = 1e-9) -> bool:
    key = (from_sem, to_sem)
    if key not in TRANSFORM_REGISTRY:
        return False
    t = TRANSFORM_REGISTRY[key]
    return abs(t["inverse"](t["forward"](probe)) - probe) < tol


# ── 내부 데이터 표준 계약 (raw_game_data.json 태그) ──────────
INTERNAL_CONTRACTS = {
    "retention": {
        "metric_name": "retention",
        "metric_semantics": MetricSemantics.NEW_INSTALL_COHORT_RETENTION.value,
        "cohort_scope": CohortScope.ALL.value,
        "measurement_method": MeasurementMethod.FIRST_PARTY_OBSERVED.value,
        "activity_definition": ActivityDefinition.LOGIN.value,
        "window_definition": WindowDefinition.EXACT_DAY.value,
    },
    "nru": {
        "metric_name": "nru",
        "metric_semantics": MetricSemantics.DAILY_NRU.value,
        "cohort_scope": CohortScope.ALL.value,
        "measurement_method": MeasurementMethod.FIRST_PARTY_OBSERVED.value,
    },
    "payment_rate": {
        "metric_name": "payment_rate",
        "metric_semantics": MetricSemantics.DAILY_PAYMENT_RATE.value,
        "cohort_scope": CohortScope.ALL.value,
        "measurement_method": MeasurementMethod.FIRST_PARTY_OBSERVED.value,
    },
    "arppu": {
        "metric_name": "arppu",
        "metric_semantics": MetricSemantics.DAILY_ARPPU.value,  # 전 표본 daily 확정 (Kyle 결정)
        "cohort_scope": CohortScope.ALL.value,
        "measurement_method": MeasurementMethod.FIRST_PARTY_OBSERVED.value,
        "unit": "daily", "currency": "KRW",
    },
}

# Newzoo 계약 (External Evidence 전용 — 절대값 경로 진입 금지)
NEWZOO_RETENTION_CONTRACT = {
    "metric_name": "retention",
    "metric_semantics": MetricSemantics.NEW_INSTALL_COHORT_RETENTION.value,
    "cohort_scope": CohortScope.ALL.value,
    "measurement_method": MeasurementMethod.PANEL_ESTIMATED.value,
    "activity_definition": ActivityDefinition.UNKNOWN.value,
}
