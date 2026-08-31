from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware import Middleware
from pydantic import BaseModel
from typing import List, Dict, Optional, Any
import numpy as np
from scipy.optimize import curve_fit
import external_evidence as ext_ev  # V13 P2.5: 물리 분리 모듈
import contracts  # V13 P0: Metric Contract
import product_timeline as ptl  # V13.3 P3.5
import arpdau_engine as arp  # V13.5 P4a/P4.6
import product_3y as p3y  # V13.7
import bm_contracts  # V14.1.0
import pdf_export  # V14.1.0
import revenue_owner  # V14.2.0
import acquisition_response  # V14.2.0
import actual_import  # V14.2.0
import source_registry  # V14.4.0: Single Wave ↔ Launch Projection 공통 BM 계약
import json
import os
import httpx

# ============================================
# V12.3.2: 게임명 익명화 맵 (엑셀 다운로드용)
# ============================================
GAME_ANONYMIZE_MAP = {
    # 내부 표본 게임 (익명화)
    "메M(대만)": "MMORPG (Mobile / 2018 / TW)",
    "메M(한국)": "MMORPG (Mobile / 2018 / KR)",
    "AxE(대만)": "MMORPG (Mobile / 2017 / TW)",
    "AxE(한국)": "MMORPG (Mobile / 2017 / KR)",
    "AxE(일본)": "MMORPG (Mobile / 2017 / JP)",
    "V4(한국)": "MMORPG (Mobile / 2019 / KR)",
    "MOE(한국)": "SRPG (Mobile / 2019 / KR)",
    "MOE(글로벌)": "SRPG (Mobile / 2019 / Global)",
    "MOE(일본대만)": "SRPG (Mobile / 2019 / JP)",
    "다크어벤져3(한국)": "Action RPG (Mobile / 2016 / KR)",
    "다크어벤져3(글로벌)": "Action RPG (Mobile / 2016 / Global)",
    "다크어벤져3(일본)": "Action RPG (Mobile / 2016 / JP)",
    "오버히트(한국)": "Collector RPG (Mobile / 2018 / KR)",
    "오버히트(일본)": "Collector RPG (Mobile / 2018 / JP)",
    "오버히트(글로벌)": "Collector RPG (Mobile / 2018 / Global)",
    "조조전(한국)": "SRPG (Mobile / 2016 / KR)",
    "조조전(일본)": "SRPG (Mobile / 2016 / JP)",
    "조조전(대만)": "SRPG (Mobile / 2016 / TW)",
    "조조전(글로벌)": "SRPG (Mobile / 2016 / Global)",
    "카이저(한국)": "MMORPG (Mobile / 2019 / KR)",
    "트라하(한국)": "MMORPG (Mobile / 2019 / KR)",
    "트라하(일본)": "MMORPG (Mobile / 2019 / JP)",
    "나이트워커(중국)": "Action RPG (PC / 2022 / CN)",
    "슈퍼피플(글로벌)": "Battle Royale (PC / 2022 / Global)",
    "라플라스M(앱애니)": "MMORPG (Mobile / 2018 / Global)",
    # GROUP B: 신규 추가 게임
    "PUBG (PC/B2P/2018)": "PUBG PC (B2P / Battle Royale / 2018 / Global)",
    "PUBG (PC/F2P/2022)": "PUBG PC (F2P / Battle Royale / 2022 / Global)",
    "PUBGM (KR+JP/Launch-2019)": "PUBG Mobile (Launch / 2019 / KR+JP)",
    "PUBGM (KR+JP/Stable-2022)": "PUBG Mobile (Stable / 2022 / KR+JP)",
    "DNDM (NA)": "DNDM (Mobile / F2P / 2025 / NA)",
    "DNDM (SEA)": "DNDM (Mobile / F2P / 2025 / SEA)",
    "DNDM (SA)": "DNDM (Mobile / F2P / 2025 / SA)",
    "inZOI": "inZOI (PC / B2P / 2025)",
    "Arena Breakout(글로벌-벤치마크)": "Arena Breakout (Global - Benchmark)",
    "PUBG (Console/2017)": "PUBG Console (B2P / Battle Royale / 2017 / Global)",
}

def get_anonymized_game_name(game_name: str) -> str:
    """게임명을 익명화된 이름으로 변환"""
    return GAME_ANONYMIZE_MAP.get(game_name, game_name)

# ============================================
# numpy 타입 → Python native 타입 변환 헬퍼
# ============================================
def sanitize_for_json(obj):
    """numpy 타입을 Python native 타입으로 재귀적으로 변환"""
    if isinstance(obj, dict):
        return {k: sanitize_for_json(v) for k, v in obj.items()}
    elif isinstance(obj, list):
        return [sanitize_for_json(item) for item in obj]
    elif isinstance(obj, (np.integer, np.int64, np.int32)):
        return int(obj)
    elif isinstance(obj, (np.floating, np.float64, np.float32)):
        return float(obj)
    elif isinstance(obj, (np.bool_, np.bool)):
        return bool(obj)
    elif isinstance(obj, np.ndarray):
        return sanitize_for_json(obj.tolist())  # tolist 후에도 재귀 적용
    else:
        return obj

app = FastAPI(title="Game KPI Projection API", version="2.0.0")

# CORS 설정 - 모든 origin 허용
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"],
)

# 글로벌 에러 핸들러 - 모든 에러를 잡아서 상세 로깅
from fastapi import Request
from fastapi.responses import JSONResponse
import traceback

@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    error_detail = traceback.format_exc()
    print(f"❌ Global Error: {type(exc).__name__}: {str(exc)}")
    print(f"❌ Traceback:\n{error_detail}")
    return JSONResponse(
        status_code=500,
        content={
            "status": "error",
            "error_type": type(exc).__name__,
            "error_message": str(exc),
            "detail": error_detail[:2000]  # 처음 2000자만
        }
    )

# Data paths
DATA_DIR = os.path.join(os.path.dirname(__file__), "..", "data")
RAW_DATA_PATH = os.path.join(DATA_DIR, "raw_game_data.json")
CONFIG_PATH = os.path.join(DATA_DIR, "default_config.json")

# OpenAI API Configuration
# API Keys (환경변수에서만 읽어옴 - 코드에 키 포함 금지!)
OPENAI_API_KEY = os.environ.get("OPENAI_API_KEY", "")
OPENAI_API_URL = "https://api.openai.com/v1/chat/completions"

def load_raw_data():
    with open(RAW_DATA_PATH, 'r', encoding='utf-8') as f:
        return json.load(f)

def load_config():
    with open(CONFIG_PATH, 'r', encoding='utf-8') as f:
        return json.load(f)

# Pydantic Models
class RetentionInput(BaseModel):
    selected_games: List[str] = []
    target_d1_retention: Dict[str, float] = {"best": 0.45, "normal": 0.40, "worst": 0.35}

class NRUInput(BaseModel):
    selected_games: List[str] = []
    d1_nru: Dict[str, int] = {"best": 0, "normal": 0, "worst": 0}
    paid_organic_ratio: float = 0.5
    nvr: float = 0.7
    adjustment: Dict[str, float] = {"best_vs_normal": 0.1, "worst_vs_normal": -0.1}
    # V8.5: UA/Brand 예산 분리
    ua_budget: Optional[int] = 0              # 퍼포먼스 마케팅 예산 (직접 유입)
    brand_budget: Optional[int] = 0           # 브랜딩 예산 (Organic Boost)
    target_cpa: Optional[int] = 2000          # CPI/CPA (ua_budget에만 적용)
    base_organic_ratio: Optional[float] = 0.2 # 기본 자연 유입 비율
    # V8.5+: Pre-Launch & CPA Saturation
    pre_marketing_ratio: Optional[float] = 0.0    # 사전 마케팅 비중 (0~1, 예: 0.3 = 30%)
    wishlist_conversion_rate: Optional[float] = 0.15  # 위시리스트/사전예약 → 실제 유입 전환율 (PC: 10~20%)
    cpa_saturation_enabled: Optional[bool] = True     # CPA 상승 계수 활성화
    # V13.7.2 P0-3: External Reservoir (사전등록 등 — budget-derived와 이중계산 금지)
    external_reservoir_activated: Optional[int] = 0   # activated 총량 (size×activation은 상위에서)
    brand_time_lag_enabled: Optional[bool] = True     # 브랜딩 지연 효과 활성화
    # V12.3: Sustaining Budget (별도 추가 월 예산)
    sustaining_mkt_budget_monthly: Optional[int] = 0  # 월간 유지 마케팅 예산 (기본값: UA의 10%)

class RevenueInput(BaseModel):
    selected_games_pr: List[str] = []
    selected_games_arppu: List[str] = []
    pr_adjustment: Dict[str, float] = {"best_vs_normal": 0.05, "worst_vs_normal": -0.05}
    arppu_adjustment: Dict[str, float] = {"best_vs_normal": 0.05, "worst_vs_normal": -0.05}
    # V12.1: 사용자 직접 입력 필드 (None이면 벤치마크 사용)
    custom_pr: Optional[float] = None           # 사용자 입력 PR (0~1, 예: 0.05 = 5%)
    custom_arppu: Optional[float] = None        # 사용자 입력 ARPPU (원화)
    package_price: Optional[float] = None       # PC/Console 패키지 가격 (원화)

class ProjectionInput(BaseModel):
    launch_date: str
    projection_days: int = 365
    retention: RetentionInput
    nru: NRUInput
    revenue: RevenueInput
    basic_settings: Optional[Dict[str, Any]] = None
    # 블렌딩 설정
    blending: Optional[Dict[str, Any]] = None  # { weight: 0.7, genre: "MMORPG", platforms: ["PC"] }
    # V7 추가: 품질 점수, BM 타입, 지역
    quality_score: Optional[str] = "B"  # S/A/B/C/D
    bm_type: Optional[str] = "Midcore"  # Hardcore/Midcore/Casual/F2P_Cosmetic/Gacha
    regions: Optional[List[str]] = None  # ["korea", "japan", "global", ...]
    # V12 추가: 고급 옵션
    advanced: Optional[Dict[str, Any]] = None  # { liveops_intensity, arppu_unit, two_stage_retention, seasonality_regions }
    exclude_family: Optional[str] = None  # V13.1 P2: LOFO 시 내부 벤치마크에서도 family 제외

# V12: LiveOps 강도별 설정
LIVEOPS_CONFIG = {
    "Strong": {"decay_rate": -0.3, "floor_ratio": 0.40, "cost_multiplier": 1.20},
    "Medium": {"decay_rate": -0.5, "floor_ratio": 0.20, "cost_multiplier": 1.00},
    "Weak": {"decay_rate": -0.8, "floor_ratio": 0.05, "cost_multiplier": 0.85}
}

# V12.1: 장르/플랫폼별 벤치마크 D30 Retention (%)
BENCHMARK_D30_RETENTION = {
    "MMORPG": {"Mobile": 0.08, "PC": 0.12, "Console": 0.10},
    "Action RPG": {"Mobile": 0.07, "PC": 0.10, "Console": 0.09},
    "Extraction Shooter": {"Mobile": 0.06, "PC": 0.11, "Console": 0.10},
    "FPS": {"Mobile": 0.06, "PC": 0.09, "Console": 0.08},
    "FPS/TPS": {"Mobile": 0.06, "PC": 0.09, "Console": 0.08},
    "Battle Royale": {"Mobile": 0.07, "PC": 0.08, "Console": 0.07},
    "Strategy": {"Mobile": 0.10, "PC": 0.12, "Console": 0.10},
    "Casual": {"Mobile": 0.12, "PC": 0.08, "Console": 0.06},
    "Puzzle": {"Mobile": 0.15, "PC": 0.10, "Console": 0.08},
    "Sports": {"Mobile": 0.06, "PC": 0.08, "Console": 0.09},
    "Racing": {"Mobile": 0.05, "PC": 0.07, "Console": 0.08},
    "Default": {"Mobile": 0.07, "PC": 0.10, "Console": 0.08}
}

# V12.1: 플랫폼별 CPW 가중치 (Pre-launch 계산용)
PLATFORM_CPW_RATIO = {
    "Mobile": 0.2,      # 사전예약 모으기 쉬움
    "PC": 0.3,          # 위시리스트 모으기 어려움
    "Console": 0.3      # 위시리스트 모으기 어려움
}

# V12.2: 플랫폼별 Sustaining NRU 절대 하한선
MIN_SUSTAINING_NRU = {
    "PC": 300,          # PC는 최소 일 300명
    "Mobile": 500,      # 모바일은 최소 일 500명
    "Console": 200      # 콘솔은 최소 일 200명
}

# V12.3: CPA Saturation 상수
CPA_SATURATION_THRESHOLD = 500_000_000  # 기본 임계값: 5억원
CPA_SATURATION_COEFFICIENT = 0.15        # 로그 스케일 계수

def calculate_marketing_efficiency(
    ua_budget: float,
    brand_budget: float,
    target_cpa: float
) -> dict:
    """
    V12.3: CPA Saturation (Marketing Efficiency) 계산
    
    UA 예산이 임계값을 초과하면 CPA가 로그 스케일로 상승
    Brand 예산이 임계값을 높여서 효율 저하를 방어
    
    Returns:
        dict: {
            "effective_cpa": 실제 적용 CPA,
            "saturation_factor": CPA 상승 배수,
            "adjusted_threshold": 브랜드 보정된 임계값,
            "budget_scale": 예산/임계값 비율
        }
    """
    import math
    
    # 1. 브랜드 예산 비율로 임계값 상향 (브랜딩 = 효율 방어)
    brand_ratio = brand_budget / max(1, ua_budget)
    adjusted_threshold = CPA_SATURATION_THRESHOLD * (1 + min(1.0, brand_ratio))
    
    # 2. 예산 스케일 계산
    budget_scale = ua_budget / max(1, adjusted_threshold)
    
    # 3. Saturation Factor (로그 함수)
    # 예산이 임계값 이하면 1.0 (효율 저하 없음)
    # 임계값 초과 시 로그 스케일로 단가 상승
    if budget_scale > 1.0:
        saturation_factor = 1.0 + (math.log(budget_scale) * CPA_SATURATION_COEFFICIENT)
    else:
        saturation_factor = 1.0
    
    # 4. 최종 CPA
    effective_cpa = target_cpa * saturation_factor
    
    return {
        "effective_cpa": effective_cpa,
        "saturation_factor": round(saturation_factor, 3),
        "adjusted_threshold": adjusted_threshold,
        "budget_scale": round(budget_scale, 3),
        "brand_efficiency_bonus": round(brand_ratio * 100, 1)  # %로 표시
    }

# ============================================
# V12: 글로벌 계절성 팩터 (지역별 월간 가중치) - 2026 캘린더 기반
# ============================================
SEASONALITY_BY_REGION = {
    "korea": {1: 1.15, 2: 1.25, 3: 0.85, 4: 0.95, 5: 1.10, 6: 0.90, 7: 1.15, 8: 1.20, 9: 1.10, 10: 1.05, 11: 1.10, 12: 1.25},
    "china": {1: 1.10, 2: 1.30, 3: 0.95, 4: 1.05, 5: 1.20, 6: 1.00, 7: 1.10, 8: 1.15, 9: 1.10, 10: 1.25, 11: 1.20, 12: 1.15},
    "japan": {1: 1.05, 2: 1.10, 3: 1.00, 4: 1.00, 5: 1.25, 6: 0.95, 7: 1.10, 8: 1.15, 9: 1.05, 10: 1.05, 11: 1.05, 12: 1.15},
    "global": {1: 1.10, 2: 1.05, 3: 1.00, 4: 1.00, 5: 1.00, 6: 0.85, 7: 1.05, 8: 1.10, 9: 1.00, 10: 1.05, 11: 1.15, 12: 1.25},
    "sea": {1: 1.05, 2: 1.10, 3: 1.00, 4: 1.00, 5: 1.00, 6: 1.05, 7: 1.05, 8: 1.00, 9: 1.00, 10: 1.00, 11: 1.05, 12: 1.15},
    "na": {1: 0.90, 2: 0.90, 3: 0.95, 4: 1.00, 5: 1.00, 6: 0.85, 7: 1.05, 8: 1.10, 9: 0.95, 10: 1.05, 11: 1.15, 12: 1.25},
    "sa": {1: 1.10, 2: 1.05, 3: 1.00, 4: 0.95, 5: 0.95, 6: 1.00, 7: 1.05, 8: 1.00, 9: 1.00, 10: 1.05, 11: 1.10, 12: 1.15},
    "eu": {1: 0.90, 2: 0.90, 3: 0.95, 4: 1.05, 5: 1.00, 6: 0.85, 7: 1.00, 8: 0.95, 9: 1.00, 10: 1.05, 11: 1.15, 12: 1.25},
}

def calculate_seasonality(regions: List[str], launch_date: str, days: int = 365) -> List[float]:
    """
    [V13.2 PROMOTED] 계절성 = PUBG PC 6개년 실측 월계수(internal prior) × 결정적 주말계수(+10%).
    - 합성 랜덤 스파이크/노이즈 제거 (관측근거: 피드백4 #15)
    - 적용은 Revenue(ARPPU) 경로 1회만 — NRU 이중적용 제거
    - 실측 prior 부재 시 1.0 (중립)
    """
    from datetime import datetime, timedelta
    try:
        start_date = datetime.strptime(launch_date, "%Y-%m-%d")
    except Exception:
        start_date = datetime(2026, 11, 12)
    try:
        pri = json.load(open(os.path.join(DATA_DIR, "internal_priors.json"), encoding="utf-8"))
        monthly = pri.get("seasonality_monthly_pubg_pc", {}).get("factors", {})
    except Exception:
        monthly = {}
    factors = []
    for d in range(days):
        cur = start_date + timedelta(days=d)
        mf = float(monthly.get(f"{cur.month:02d}", 1.0))
        wf = 1.10 if cur.weekday() >= 5 else 1.0  # 결정적 주말계수 (policy assumption, 문서화)
        factors.append(mf * wf)
    # 정규화: 평균 1.0 (총량 보존 — 계절성은 분포 이동만)
    m = float(np.mean(factors)) if factors else 1.0
    return [f / m for f in factors]

def calculate_time_decay_weight(day: int, days: int = 365) -> float:
    """
    시간 가중치 계산 (Time-Decay)
    
    D1: 내부 90% : 벤치마크 10%
    D180: 내부 50% : 벤치마크 50%
    D365: 내부 10% : 벤치마크 90%
    
    선형 보간으로 매일 가중치 변경
    """
    # D1 = 0.9, D365 = 0.1 (선형 감소)
    weight_internal = 0.9 - (0.8 * (day - 1) / (days - 1)) if days > 1 else 0.9
    return max(min(weight_internal, 0.9), 0.1)

def calculate_time_decay_blended_retention(
    internal_curve: List[float],
    benchmark_curve: List[float],
    days: int = 365,
    quality_score: float = 1.0
) -> List[float]:
    """
    Time-Decay 블렌딩 리텐션 커브 생성
    
    Args:
        internal_curve: 내부 표본 리텐션 커브
        benchmark_curve: 벤치마크 리텐션 커브
        days: 프로젝션 기간
        quality_score: 품질 점수 (S=1.2, A=1.1, B=1.0, C=0.9, D=0.8)
    """
    blended = []
    for day in range(days):
        weight_internal = calculate_time_decay_weight(day + 1, days)
        weight_benchmark = 1 - weight_internal
        
        internal_val = internal_curve[day] if day < len(internal_curve) else internal_curve[-1]
        benchmark_val = benchmark_curve[day] if day < len(benchmark_curve) else benchmark_curve[-1]
        
        # 벤치마크에 품질 점수 적용
        adjusted_benchmark = benchmark_val * quality_score
        
        blended_val = (internal_val * weight_internal) + (adjusted_benchmark * weight_benchmark)
        blended.append(max(min(blended_val, 1.0), 0.001))
    
    return blended

# ============================================
# Quality Score 정의
# ============================================
QUALITY_SCORES = {
    "S": 1.2,   # 최상급 (FGT/CBT 결과 매우 우수)
    "A": 1.1,   # 우수
    "B": 1.0,   # 보통 (기본값)
    "C": 0.9,   # 미흡
    "D": 0.8,   # 부진
}

# ============================================
# BM 타입별 세분화 벤치마크
# ============================================
BM_TYPE_MODIFIERS = {
    "Hardcore": {"pr_mod": 0.5, "arppu_mod": 2.0},    # 낮은 PR, 고액 ARPPU
    "Midcore": {"pr_mod": 1.0, "arppu_mod": 1.0},     # 기본
    "Casual": {"pr_mod": 2.0, "arppu_mod": 0.4},      # 높은 PR, 소액 ARPPU
    "F2P_Cosmetic": {"pr_mod": 0.8, "arppu_mod": 0.6}, # 무료+꾸미기 중심
    "Gacha": {"pr_mod": 1.5, "arppu_mod": 1.8},       # 가챠 중심
}
BENCHMARK_DATA = {
    "PC": {
        "MMORPG": {"d1": 0.32, "d7": 0.20, "d30": 0.11, "d90": 0.06, "pr": 0.06, "arppu": 78000},
        "Action RPG": {"d1": 0.30, "d7": 0.18, "d30": 0.09, "d90": 0.04, "pr": 0.05, "arppu": 65000},
        "Battle Royale": {"d1": 0.35, "d7": 0.22, "d30": 0.12, "d90": 0.07, "pr": 0.03, "arppu": 45000},
        "Extraction Shooter": {"d1": 0.28, "d7": 0.16, "d30": 0.08, "d90": 0.04, "pr": 0.04, "arppu": 55000},
        "FPS/TPS": {"d1": 0.33, "d7": 0.20, "d30": 0.10, "d90": 0.05, "pr": 0.04, "arppu": 50000},
        "Strategy": {"d1": 0.25, "d7": 0.15, "d30": 0.08, "d90": 0.04, "pr": 0.07, "arppu": 85000},
        "Casual": {"d1": 0.40, "d7": 0.20, "d30": 0.08, "d90": 0.03, "pr": 0.02, "arppu": 25000},
        "Sports": {"d1": 0.30, "d7": 0.18, "d30": 0.09, "d90": 0.04, "pr": 0.05, "arppu": 60000},
    },
    "Mobile": {
        "MMORPG": {"d1": 0.42, "d7": 0.18, "d30": 0.07, "d90": 0.03, "pr": 0.05, "arppu": 52000},
        "Action RPG": {"d1": 0.38, "d7": 0.15, "d30": 0.06, "d90": 0.02, "pr": 0.04, "arppu": 45000},
        "Battle Royale": {"d1": 0.45, "d7": 0.20, "d30": 0.08, "d90": 0.04, "pr": 0.02, "arppu": 35000},
        "Extraction Shooter": {"d1": 0.35, "d7": 0.14, "d30": 0.05, "d90": 0.02, "pr": 0.03, "arppu": 40000},
        "FPS/TPS": {"d1": 0.40, "d7": 0.17, "d30": 0.07, "d90": 0.03, "pr": 0.03, "arppu": 38000},
        "Strategy": {"d1": 0.35, "d7": 0.16, "d30": 0.07, "d90": 0.03, "pr": 0.06, "arppu": 68000},
        "Casual": {"d1": 0.50, "d7": 0.22, "d30": 0.09, "d90": 0.04, "pr": 0.02, "arppu": 18000},
        "Sports": {"d1": 0.38, "d7": 0.16, "d30": 0.06, "d90": 0.02, "pr": 0.04, "arppu": 42000},
    },
    "Console": {
        "MMORPG": {"d1": 0.35, "d7": 0.22, "d30": 0.12, "d90": 0.06, "pr": 0.05, "arppu": 70000},
        "Action RPG": {"d1": 0.33, "d7": 0.20, "d30": 0.10, "d90": 0.05, "pr": 0.04, "arppu": 60000},
        "Battle Royale": {"d1": 0.38, "d7": 0.24, "d30": 0.13, "d90": 0.07, "pr": 0.02, "arppu": 40000},
        "Extraction Shooter": {"d1": 0.30, "d7": 0.18, "d30": 0.09, "d90": 0.04, "pr": 0.03, "arppu": 50000},
        "FPS/TPS": {"d1": 0.36, "d7": 0.22, "d30": 0.11, "d90": 0.06, "pr": 0.03, "arppu": 48000},
        "Strategy": {"d1": 0.28, "d7": 0.17, "d30": 0.09, "d90": 0.04, "pr": 0.06, "arppu": 75000},
        "Casual": {"d1": 0.42, "d7": 0.20, "d30": 0.08, "d90": 0.03, "pr": 0.02, "arppu": 22000},
        "Sports": {"d1": 0.35, "d7": 0.20, "d30": 0.10, "d90": 0.05, "pr": 0.05, "arppu": 55000},
    }
}

# ============================================================
# V13 P1: Absolute Metric Re-sourcing
# 절대값 벤치마크의 소스를 외부 하드코딩(BENCHMARK_DATA/BENCHMARK_D30_RETENTION)
# → 내부 Pool A/B 장르 분포로 교체. 외부 데이터는 External Evidence Layer에서
# relative/shape 전용 (Isolation Test A/B로 보장).
# BENCHMARK_DATA/BENCHMARK_D30_RETENTION 상수는 DEPRECATED (참조 제거됨).
# ============================================================
GAME_META_V13 = {
    "메M(대만)": ("MMORPG", "Mobile"), "메M(한국)": ("MMORPG", "Mobile"),
    "AxE(대만)": ("MMORPG", "Mobile"), "AxE(한국)": ("MMORPG", "Mobile"), "AxE(일본)": ("MMORPG", "Mobile"),
    "V4(한국)": ("MMORPG", "Mobile"), "카이저(한국)": ("MMORPG", "Mobile"),
    "트라하(한국)": ("MMORPG", "Mobile"), "트라하(일본)": ("MMORPG", "Mobile"),
    "라플라스M(앱애니)": ("MMORPG", "Mobile"),
    "MOE(한국)": ("SRPG", "Mobile"), "MOE(글로벌)": ("SRPG", "Mobile"), "MOE(일본대만)": ("SRPG", "Mobile"),
    "조조전(한국)": ("SRPG", "Mobile"), "조조전(일본)": ("SRPG", "Mobile"),
    "조조전(대만)": ("SRPG", "Mobile"), "조조전(글로벌)": ("SRPG", "Mobile"),
    "다크어벤져3(한국)": ("Action RPG", "Mobile"), "다크어벤져3(글로벌)": ("Action RPG", "Mobile"),
    "다크어벤져3(일본)": ("Action RPG", "Mobile"),
    "오버히트(한국)": ("Collector RPG", "Mobile"), "오버히트(일본)": ("Collector RPG", "Mobile"),
    "오버히트(글로벌)": ("Collector RPG", "Mobile"),
    "나이트워커(중국)": ("Action RPG", "PC"),
    "슈퍼피플(글로벌)": ("Battle Royale", "PC"),
    "PUBG (PC/B2P/2018)": ("Battle Royale", "PC"), "PUBG (PC/F2P/2022)": ("Battle Royale", "PC"),
    "PUBGM (KR+JP/Launch-2019)": ("Battle Royale", "Mobile"), "PUBGM (KR+JP/Stable-2022)": ("Battle Royale", "Mobile"),
    "DNDM (NA)": ("Extraction Shooter", "Mobile"), "DNDM (SEA)": ("Extraction Shooter", "Mobile"),
    "DNDM (SA)": ("Extraction Shooter", "Mobile"),
    "inZOI": ("Simulation", "PC"),
    "Arena Breakout(글로벌-벤치마크)": ("Extraction Shooter", "Mobile"),
    "PUBG (Console/2017)": ("Battle Royale", "Console"),
}

_INTERNAL_BENCH_CACHE = None

def _median(vals):
    return float(np.median(vals)) if vals else None

# V13.1 P1: 리텐션 semantics 필터 — live-slice 성격 리텐션은 런칭 벤치마크에서 제외
# (PUBG PC/PUBGM 코호트 리텐션 = 성숙기 active_user_return_rate 성격 → Newzoo와 동일한 정의 문제)
RETENTION_LIVE_SLICE_GAMES = {"PUBG (PC/B2P/2018)", "PUBG (PC/F2P/2022)",
                               "PUBGM (KR+JP/Launch-2019)", "PUBGM (KR+JP/Stable-2022)"}
GAME_FAMILY_MAP_V13 = {
    "메M(대만)": "mem", "메M(한국)": "mem", "AxE(대만)": "axe", "AxE(한국)": "axe", "AxE(일본)": "axe",
    "V4(한국)": "v4", "카이저(한국)": "kaiser", "트라하(한국)": "traha", "트라하(일본)": "traha",
    "라플라스M(앱애니)": "laplace", "MOE(한국)": "moe", "MOE(글로벌)": "moe", "MOE(일본대만)": "moe",
    "조조전(한국)": "jojo", "조조전(일본)": "jojo", "조조전(대만)": "jojo", "조조전(글로벌)": "jojo",
    "다크어벤져3(한국)": "da3", "다크어벤져3(글로벌)": "da3", "다크어벤져3(일본)": "da3",
    "오버히트(한국)": "overhit", "오버히트(일본)": "overhit", "오버히트(글로벌)": "overhit",
    "나이트워커(중국)": "nightwalker", "슈퍼피플(글로벌)": "superpeople",
    "PUBG (PC/B2P/2018)": "pubg_pc", "PUBG (PC/F2P/2022)": "pubg_pc",
    "PUBGM (KR+JP/Launch-2019)": "pubgm", "PUBGM (KR+JP/Stable-2022)": "pubgm",
    "DNDM (NA)": "dndm", "DNDM (SEA)": "dndm", "DNDM (SA)": "dndm",
    "inZOI": "inzoi", "Arena Breakout(글로벌-벤치마크)": "arena", "PUBG (Console/2017)": "pubg_console",
}

def build_internal_benchmarks(exclude_family: Optional[str] = None) -> Dict[str, Dict]:
    """내부 Pool A/B 분포 (P1). exclude_family 지정 시 해당 family 전체 제외 (LOFO 무누수)."""
    global _INTERNAL_BENCH_CACHE
    if exclude_family is None and _INTERNAL_BENCH_CACHE is not None:
        return _INTERNAL_BENCH_CACHE
    raw = load_raw_data()
    dist = {}
    for game, (genre, platform) in GAME_META_V13.items():
        if exclude_family and GAME_FAMILY_MAP_V13.get(game) == exclude_family:
            continue
        key = f"{genre}|{platform}"
        e = dist.setdefault(key, {"d1": [], "d7": [], "d30": [], "d90": [], "pr": [], "arppu": [], "games": []})
        ret = raw['games']['retention'].get(game)
        if ret and game not in RETENTION_LIVE_SLICE_GAMES:  # semantics 필터
            if len(ret) >= 1: e["d1"].append(ret[0])
            if len(ret) >= 7: e["d7"].append(ret[6])
            if len(ret) >= 30: e["d30"].append(ret[29])
            if len(ret) >= 90: e["d90"].append(ret[89])
        pr = raw['games']['payment_rate'].get(game)
        if pr: e["pr"].append(float(np.mean(pr[:90])))
        ar = raw['games']['arppu'].get(game)
        if ar: e["arppu"].append(float(np.mean(ar[:90])))
        e["games"].append(game)
    if exclude_family is None:
        _INTERNAL_BENCH_CACHE = dist
    return dist

_GLOBAL_DEFAULT_BENCH = {"d1": 0.40, "d7": 0.18, "d30": 0.08, "d90": 0.035, "pr": 0.04, "arppu": 50000}

def get_internal_benchmark(genre: str, platforms: List[str],
                            exclude_family: Optional[str] = None) -> Dict[str, Any]:
    """
    V13.1: 지표별 독립 fallback (retention/pr/arppu 각각 L0→L1→L2).
    exclude_family 지정 시 LOFO 무누수 벤치마크.
    """
    dist = build_internal_benchmarks(exclude_family)
    if not platforms:
        platforms = ["PC"]

    def collect(keys, metrics):
        agg = {m: [] for m in metrics}
        n_games = 0
        for k in keys:
            if k in dist:
                for m in metrics:
                    agg[m].extend(dist[k][m])
                n_games += len(dist[k]["games"])
        return agg, n_games

    keys0 = [f"{genre}|{p}" for p in platforms]
    keys1 = [k for k in dist if k.startswith(f"{genre}|")]
    keys2 = list(dist.keys())

    def resolve(metrics, need):
        for lvl, keys in [(0, keys0), (1, keys1), (2, keys2)]:
            agg, n = collect(keys, metrics)
            if all(agg[m] for m in need):
                return agg, lvl, n
        return {m: [] for m in metrics}, 2, 0

    ret_agg, ret_lvl, ret_n = resolve(["d1", "d7", "d30", "d90"], ["d1", "d30"])
    pr_agg, pr_lvl, pr_n = resolve(["pr"], ["pr"])
    ar_agg, ar_lvl, ar_n = resolve(["arppu"], ["arppu"])

    result = {
        "d1": _median(ret_agg["d1"]) or _GLOBAL_DEFAULT_BENCH["d1"],
        "d7": _median(ret_agg["d7"]) or _GLOBAL_DEFAULT_BENCH["d7"],
        "d30": _median(ret_agg["d30"]) or _GLOBAL_DEFAULT_BENCH["d30"],
        "d90": _median(ret_agg["d90"]) or (_median(ret_agg["d30"]) or _GLOBAL_DEFAULT_BENCH["d30"]) * 0.45,
        "pr": _median(pr_agg["pr"]) or _GLOBAL_DEFAULT_BENCH["pr"],
        "arppu": _median(ar_agg["arppu"]) or _GLOBAL_DEFAULT_BENCH["arppu"],
        "source": "internal_pool_ab",
        "excluded_family": exclude_family,
        "fallback_level": max(ret_lvl, pr_lvl, ar_lvl),  # 하위호환 (최악치)
        "fallback_levels": {"retention": ret_lvl, "pr": pr_lvl, "arppu": ar_lvl},
        "n_games": ret_n,
        "n_games_by_metric": {"retention": ret_n, "pr": pr_n, "arppu": ar_n},
    }
    result["d7"] = min(result["d7"], result["d1"])
    result["d30"] = min(result["d30"], result["d7"])
    result["d90"] = min(result["d90"], result["d30"])
    return result

def get_benchmark_data(genre: str, platforms: List[str], exclude_family: Optional[str] = None) -> Dict[str, float]:
    """[V13 P1] 벤치마크 = 내부 Pool A/B 분포 (외부 절대값 사용 금지)"""
    return get_internal_benchmark(genre, platforms, exclude_family)

def generate_benchmark_retention_curve(benchmark: Dict[str, float], days: int = 365) -> List[float]:
    """벤치마크 데이터로 Power Law 리텐션 커브 생성"""
    # D1, D7, D30, D90 데이터로 회귀분석
    x_data = np.array([1, 7, 30, 90])
    y_data = np.array([benchmark["d1"], benchmark["d7"], benchmark["d30"], benchmark["d90"]])
    
    try:
        popt, _ = curve_fit(retention_curve, x_data, y_data, p0=[0.5, -0.3], maxfev=5000)
        a, b = popt
    except:
        a, b = benchmark["d1"], -0.5  # 기본값
    
    curve = []
    for day in range(1, days + 1):
        ret = a * np.power(day, b)
        ret = max(min(ret, 1.0), 0.001)
        curve.append(ret)
    
    return curve

def calculate_blended_retention(
    internal_curve: List[float],
    benchmark_curve: List[float],
    weight_internal: float
) -> List[float]:
    """내부 표본과 벤치마크를 블렌딩한 리텐션 커브 생성"""
    weight_benchmark = 1 - weight_internal
    
    blended = []
    for i in range(len(internal_curve)):
        internal_val = internal_curve[i] if i < len(internal_curve) else internal_curve[-1]
        benchmark_val = benchmark_curve[i] if i < len(benchmark_curve) else benchmark_curve[-1]
        blended_val = (internal_val * weight_internal) + (benchmark_val * weight_benchmark)
        blended.append(max(min(blended_val, 1.0), 0.001))
    
    return blended

def calculate_blended_pr(
    internal_pr: List[float],
    benchmark_pr: float,
    weight_internal: float,
    days: int = 365
) -> List[float]:
    """PR 블렌딩"""
    weight_benchmark = 1 - weight_internal
    
    blended = []
    for i in range(days):
        internal_val = internal_pr[i] if i < len(internal_pr) else internal_pr[-1]
        blended_val = (internal_val * weight_internal) + (benchmark_pr * weight_benchmark)
        blended.append(max(min(blended_val, 1.0), 0.001))
    
    return blended

def calculate_blended_arppu(
    internal_arppu: List[float],
    benchmark_arppu: float,
    weight_internal: float,
    days: int = 365
) -> List[float]:
    """ARPPU 블렌딩"""
    weight_benchmark = 1 - weight_internal
    
    blended = []
    for i in range(days):
        internal_val = internal_arppu[i] if i < len(internal_arppu) else internal_arppu[-1]
        blended_val = (internal_val * weight_internal) + (benchmark_arppu * weight_benchmark)
        blended.append(max(blended_val, 1000))
    
    return blended

class AIInsightRequest(BaseModel):
    projection_summary: Dict[str, Any]
    analysis_type: str = "general"  # general, retention, nru, revenue, risk

# Retention Curve: a * (day)^b
def retention_curve(x, a, b):
    return a * np.power(x, b)

def fit_retention_curve(retention_data: List[float]):
    days = np.arange(1, len(retention_data) + 1)
    retention = np.array(retention_data)
    
    valid_mask = (retention > 0) & (retention <= 1)
    if np.sum(valid_mask) < 3:
        return None, None
    
    try:
        popt, _ = curve_fit(
            retention_curve, 
            days[valid_mask], 
            retention[valid_mask],
            p0=[retention_data[0], -0.5],
            bounds=([0, -2], [2, 0]),
            maxfev=5000
        )
        return popt[0], popt[1]
    except:
        return retention_data[0], -0.5

def calculate_retention_coefficients(selected_games: List[str], raw_data: dict):
    retention_games = raw_data['games']['retention']
    
    a_values = []
    b_values = []
    
    for game in selected_games:
        if game in retention_games:
            a, b = fit_retention_curve(retention_games[game])
            if a is not None:
                a_values.append(a)
                b_values.append(b)
    
    if not a_values:
        return 1.0, -0.5
    
    return np.mean(a_values), np.mean(b_values)

def generate_retention_curve(a: float, b: float, target_d1: float, days: int = 365):
    base_d1 = retention_curve(1, a, b)
    if base_d1 > 0:
        scale_factor = target_d1 / base_d1
    else:
        scale_factor = 1.0
    
    curve = []
    for day in range(1, days + 1):
        ret = retention_curve(day, a, b) * scale_factor
        curve.append(min(max(ret, 0.001), 1))
    
    return curve


def generate_retention_curve_v12(
    a: float, b: float, target_d1: float, days: int = 365,
    two_stage_enabled: bool = False, liveops_intensity: str = "Medium",
    genre: str = "Default", platform: str = "Mobile",
    exclude_family: Optional[str] = None
):
    """
    V12.2: 2-Stage Retention + D30 앵커 강력 보정
    
    Stage 1 (D1~D30): Power Law (D30 앵커 보정 적용)
    Stage 2 (D31~D365): LiveOps 강도별 완만한 Decay
    
    [V12.2 Fix] D30 앵커 강화:
    - 벤치마크의 70% 미만이면 문제로 판단
    - 85% 수준까지 b값 역산으로 강제 보정
    
    Returns:
        tuple: (retention_curve: List[float], adjusted_b: float)
    """
    import math
    
    # 벤치마크 D30 가져오기
    benchmark_d30 = get_internal_benchmark(genre, [platform], exclude_family)["d30"]  # V13.1: LOFO 무누수
    
    # 기본 Power Law로 D30 계산
    calculated_d30 = target_d1 * (30 ** b) if b < 0 else target_d1 * 0.1
    
    # [V12.2 Fix] 강력 D30 앵커 보정
    threshold_ratio = 0.7   # 벤치마크의 70% 미만이면 문제
    target_ratio = 0.85     # 85% 수준까지 강제 보정
    
    adjusted_b = b
    if calculated_d30 < benchmark_d30 * threshold_ratio:
        target_d30 = benchmark_d30 * target_ratio
        # b값 역산: target = d1 * 30^b  ->  b = log(target/d1) / log(30)
        if target_d1 > 0.001:
            new_b = math.log(target_d30 / target_d1) / math.log(30)
            # 기울기 제한 (너무 평평해지지 않도록, 최소 -0.15)
            adjusted_b = min(new_b, -0.15)
    
    # 기본 커브 생성 (Stage 1) - 조정된 b 사용
    base_d1 = retention_curve(1, a, adjusted_b)
    scale_factor = target_d1 / base_d1 if base_d1 > 0 else 1.0
    
    curve = []
    for day in range(1, days + 1):
        ret = retention_curve(day, a, adjusted_b) * scale_factor
        curve.append(min(max(ret, 0.001), 1))
    
    # D0 = 1.0 보장 (첫날 리텐션)
    if len(curve) > 0:
        curve[0] = target_d1
    
    # 2-Stage Retention 적용 (D31~D365)
    if two_stage_enabled and len(curve) > 30:
        d30_retention = curve[29]
        liveops_config = LIVEOPS_CONFIG.get(liveops_intensity, LIVEOPS_CONFIG["Medium"])
        stage2_decay = liveops_config["decay_rate"]
        floor_ratio = liveops_config["floor_ratio"]
        
        # D30 기준 Floor 값
        retention_floor = d30_retention * floor_ratio
        
        for day in range(30, days):
            months_after_d30 = (day - 30) / 30
            # Stage 2: 완만한 Decay (LiveOps 강도에 따라)
            decay = math.exp(stage2_decay * months_after_d30)
            new_ret = d30_retention * decay
            
            # Floor 보장
            curve[day] = max(new_ret, retention_floor, 0.001)
    
    return curve, adjusted_b  # 조정된 b값도 반환

def calculate_nru_pattern(selected_games: List[str], raw_data: dict):
    nru_games = raw_data['games']['nru']
    
    valid_games = [g for g in selected_games if g in nru_games]
    if not valid_games:
        return [0.98 ** i for i in range(365)]
    
    min_len = min(len(nru_games[g]) for g in valid_games)
    min_len = min(min_len, 365)
    
    daily_ratios = []
    for day in range(1, min_len):
        day_ratios = []
        for game in valid_games:
            data = nru_games[game]
            if day < len(data) and data[day-1] > 0:
                ratio = data[day] / data[day-1]
                if 0 < ratio < 2:
                    day_ratios.append(ratio)
        if day_ratios:
            daily_ratios.append(np.mean(day_ratios))
        else:
            daily_ratios.append(0.98)
    
    while len(daily_ratios) < 364:
        daily_ratios.append(daily_ratios[-1] if daily_ratios else 0.98)
    
    return daily_ratios

def generate_nru_series(total_nru: int, daily_ratios: List[float], days: int = 365, 
                         launch_period: int = 30, sustaining_ratio: float = 0.1):
    """
    NRU 시리즈 생성 - 런칭 마케팅은 D1~D30에 집중
    
    🔥 V8.3 수정: Area Normalization 적용
    - total_nru: 런칭 기간 동안의 "총 모객 수" (예산/CPI로 계산된 값)
    - 이 총량을 30일 패턴의 면적(Area)으로 나누어 D1 높이(Scale)를 산출
    - 결과: 예산 범위 내에서 유저가 분산 유입됨
    
    Args:
        total_nru: 런칭 기간 총 모객 수 (🔥 기존 d1_nru → total_nru로 해석 변경)
        daily_ratios: 일별 감소 비율 (현재 미사용, 확장용)
        days: 프로젝션 기간
        launch_period: 런칭 마케팅 집중 기간 (기본 30일)
        sustaining_ratio: 런칭 후 유지 NRU 비율 (기본 10%)
    
    Returns:
        일별 NRU 리스트
    """
    nru_series = []
    
    # 🔥 핵심 수정: Area Normalization
    # Step 1: 런칭 기간 NRU 패턴 생성 (Power Law Decay: 1/t^0.8)
    nru_decay_pattern = []
    for t in range(1, launch_period + 1):
        decay_value = 1.0 / (t ** 0.8)  # D1=1.0, D2=0.57, D3=0.44, ...
        nru_decay_pattern.append(decay_value)
    
    # Step 2: 패턴의 면적(Area) 계산 - 총량 보존의 법칙!
    pattern_area = sum(nru_decay_pattern)
    
    # Step 3: D1 Scale Factor = 총 유저 수 / 패턴 면적
    # 이렇게 하면 런칭 기간 NRU의 합 = total_nru가 됨
    d1_scale = total_nru / pattern_area if pattern_area > 0 else 0
    
    # Phase 1: 런칭 기간 (D1~D30) - 정규화된 패턴 적용
    for day in range(min(launch_period, days)):
        # 정규화된 NRU = Scale × 패턴값
        daily_nru = int(d1_scale * nru_decay_pattern[day])
        nru_series.append(max(daily_nru, 10))  # 최소값 10으로 설정
    
    # Phase 2: 런칭 후 유지 기간 (D31~D365)
    # D30의 NRU를 기준으로 sustaining_ratio만큼 유지
    d30_nru = nru_series[-1] if nru_series else 100
    sustaining_nru = int(d30_nru * sustaining_ratio * 10)  # D30의 ~100% 수준에서 시작
    
    for day in range(launch_period, days):
        # 유지 기간에도 서서히 감소 (월 5% 감소)
        months_after_launch = (day - launch_period) / 30
        decay = np.exp(-0.05 * months_after_launch)
        daily_nru = int(sustaining_nru * decay)
        nru_series.append(max(daily_nru, 10))
    
    return nru_series[:days]


# ============================================
# V8.5: UA/Brand 분리 NRU 계산 (Organic Boost)
# ============================================
def calculate_organic_boost(brand_budget: int, ua_budget: int) -> float:
    """
    브랜딩 예산에 따른 Organic Ratio 증폭 계수 계산
    
    로직:
    - brand_budget이 ua_budget의 0%일 때: 1.0배 (증폭 없음)
    - brand_budget이 ua_budget의 50%일 때: 1.5배
    - brand_budget이 ua_budget의 100%일 때: 2.0배
    - brand_budget이 ua_budget의 200%일 때: 2.5배 (수확체감)
    
    Logarithmic 함수를 사용해 수확체감 효과 적용
    """
    if ua_budget <= 0:
        return 1.0
    
    ratio = brand_budget / ua_budget
    # Logarithmic boost: 1 + ln(1 + ratio) * 0.7
    # ratio=0.5 → 1.28배, ratio=1.0 → 1.49배, ratio=2.0 → 1.77배
    boost = 1.0 + np.log(1 + ratio) * 0.7
    return min(boost, 3.0)  # 최대 3배로 캡


def generate_nru_series_v85(
    ua_budget: int,
    brand_budget: int, 
    target_cpa: int,
    base_organic_ratio: float,
    days: int = 365,
    launch_period: int = 30,
    sustaining_budget_monthly: int = 0,
    # V8.5+ 신규 파라미터
    pre_marketing_ratio: float = 0.0,        # 사전 마케팅 비중
    wishlist_conversion_rate: float = 0.15,  # 위시리스트 전환율
    cpa_saturation_enabled: bool = True,     # CPA 포화 효과
    brand_time_lag_enabled: bool = True,     # 브랜딩 지연 효과
    platforms: List[str] = None,             # [V11.0] 플랫폼 정보 추가
    liveops_intensity: str = "Medium"        # [V12.0] LiveOps 강도
, external_reservoir_activated: int = 0) -> tuple:
    """
    V8.5+ NRU 시리즈 생성 - UA/Brand 분리 + Pre-Launch + CPA Saturation
    
    🔥 핵심 로직:
    1. CPA Saturation: 예산 규모에 따라 CPA 상승 (시장 포화 효과)
    2. Pre-Launch Reservoir: 사전예약/위시리스트 유저를 D1에 폭발적 유입
    3. Brand Time-Lag: 브랜딩 효과가 서서히 나타나고 잔존
    4. [V12] LiveOps 강도별 Sustaining Decay
    
    Args:
        ua_budget: 퍼포먼스 마케팅 예산 (직접 유입)
        brand_budget: 브랜딩 예산 (Organic Boost)
        target_cpa: CPI/CPA 단가
        base_organic_ratio: 기본 자연 유입 비율
        days: 프로젝션 기간
        launch_period: 런칭 마케팅 집중 기간
        sustaining_budget_monthly: 월간 유지 마케팅 예산
        pre_marketing_ratio: 사전 마케팅 비중 (0~1)
        wishlist_conversion_rate: 위시리스트/사전예약 전환율
        cpa_saturation_enabled: CPA 상승 계수 활성화
        brand_time_lag_enabled: 브랜딩 지연 효과 활성화
        platforms: 플랫폼 리스트 (CPW 계산에 사용)
        liveops_intensity: LiveOps 강도 (Strong/Medium/Weak)
    
    Returns:
        (nru_series, paid_nru_total, organic_nru_total, organic_boost, meta_info)
    """
    import math
    
    # ============================================
    # 1. CPA Saturation Effect (시장 포화) - V12.3 개선
    # ============================================
    # 예산이 클수록 효율 좋은 유저가 고갈되어 CPA 상승
    # Brand 예산이 임계값을 높여서 효율 저하를 방어
    if cpa_saturation_enabled and ua_budget > 0:
        efficiency = calculate_marketing_efficiency(ua_budget, brand_budget, target_cpa)
        effective_cpa = efficiency["effective_cpa"]
        saturation_factor = efficiency["saturation_factor"]
        adjusted_threshold = efficiency["adjusted_threshold"]
        budget_scale = efficiency["budget_scale"]
        brand_efficiency_bonus = efficiency["brand_efficiency_bonus"]
    else:
        saturation_factor = 1.0
        effective_cpa = target_cpa
        adjusted_threshold = CPA_SATURATION_THRESHOLD
        budget_scale = 0
        brand_efficiency_bonus = 0
    
    # ============================================
    # 2. UA/Brand 예산 분리 및 NRU 계산
    # ============================================
    # 2-1. Pre-Launch 예산과 Post-Launch 예산 분리
    pre_launch_ua = int(ua_budget * pre_marketing_ratio)
    post_launch_ua = ua_budget - pre_launch_ua
    
    # 2-2. Paid NRU 계산 (Effective CPA 적용)
    pre_launch_paid_nru = pre_launch_ua // effective_cpa if effective_cpa > 0 else 0
    post_launch_paid_nru = post_launch_ua // effective_cpa if effective_cpa > 0 else 0
    
    # 2-3. Organic Boost Factor 계산 (Brand Budget 기반)
    organic_boost = calculate_organic_boost(brand_budget, ua_budget)
    
    # 2-4. Organic NRU 계산
    total_paid_nru = pre_launch_paid_nru + post_launch_paid_nru
    effective_organic_ratio = base_organic_ratio * organic_boost
    organic_nru_total = int(total_paid_nru * effective_organic_ratio)
    
    # ============================================
    # 3. Pre-Launch Reservoir (사전예약/위시리스트)
    # ============================================
    # [V11.0 Fix] 상쇄 버그 제거 - CPW(Cost Per Wishlist) 기반으로 변경
    # 기존: wishlist = paid_nru / conversion_rate → d1 = wishlist * conversion_rate (상쇄됨!)
    # 수정: wishlist = budget / cpw → d1 = wishlist * conversion_rate (정상 작동)
    
    # V12.1: CPW 플랫폼별 차등 적용 (상수 활용)
    if platforms is None:
        platforms = ["PC"]
    is_pc_console = any(p in ["PC", "Console"] for p in platforms)
    primary_platform = "PC" if "PC" in platforms else ("Console" if "Console" in platforms else "Mobile")
    cpw_ratio = PLATFORM_CPW_RATIO.get(primary_platform, 0.2)  # 상수에서 가져옴
    cpw = effective_cpa * cpw_ratio
    
    # 1. 예산 기반 위시리스트 모수 산출 (상쇄 버그 해결!)
    wishlist_pool_paid = int(pre_launch_ua / cpw) if cpw > 0 else 0
    wishlist_pool_organic = int(wishlist_pool_paid * effective_organic_ratio * 1.5)  # 위시리스트 단계 바이럴
    wishlist_users = wishlist_pool_paid + wishlist_pool_organic
    
    # 2. 전환율 적용 (이제 전환율을 높이면 D1이 증가함!)
    # V13.7.2: external reservoir 존재 시 budget-derived pre-launch 비활성 (이중계산 방지)
    if external_reservoir_activated > 0:
        pre_launch_paid_nru, wishlist_users = 0, 0
    d1_burst_users = int(wishlist_users * wishlist_conversion_rate) + external_reservoir_activated
    
    # D1~D3 버스트 분배: D1=80%, D2=10%, D3=10%
    burst_distribution = [0.80, 0.10, 0.10]
    
    # ============================================
    # 4. Brand Time-Lag Effect (브랜딩 지연 효과)
    # ============================================
    # 브랜딩 효과는 Bell Curve로 서서히 나타나고 잔존
    # D-30 ~ D+60 구간에 정규분포로 분산
    brand_effect_curve = []
    if brand_time_lag_enabled and brand_budget > 0:
        # 정규분포 (평균=15, 표준편차=20) → D1~D60 구간에 효과 분포
        for day in range(days):
            # Bell curve centered at D15 with spread of 20 days
            effect = math.exp(-0.5 * ((day - 15) / 20) ** 2)
            brand_effect_curve.append(effect)
        # 정규화
        total_effect = sum(brand_effect_curve)
        brand_effect_curve = [e / total_effect for e in brand_effect_curve] if total_effect > 0 else [0] * days
    else:
        # Time-Lag 비활성화 시 즉시 효과
        brand_effect_curve = [1.0 / 30 if i < 30 else 0 for i in range(days)]
    
    # ============================================
    # 5. NRU 시리즈 생성 (통합)
    # ============================================
    nru_series = [0] * days
    
    # 5-1. Pre-Launch Burst (D1~D3 폭발)
    for i, ratio in enumerate(burst_distribution):
        if i < days:
            nru_series[i] += int(d1_burst_users * ratio)
    
    # 5-2. Post-Launch UA (런칭 후 퍼포먼스 마케팅)
    # Area Normalization으로 30일간 분배
    nru_decay_pattern = [1.0 / (t ** 0.8) for t in range(1, launch_period + 1)]
    pattern_area = sum(nru_decay_pattern)
    d1_scale = post_launch_paid_nru / pattern_area if pattern_area > 0 else 0
    
    for day in range(min(launch_period, days)):
        daily_nru = int(d1_scale * nru_decay_pattern[day])
        nru_series[day] += max(daily_nru, 0)
    
    # 5-3. Organic NRU (Brand Time-Lag 적용)
    for day in range(days):
        organic_daily = int(organic_nru_total * brand_effect_curve[day])
        nru_series[day] += organic_daily
    
    # 5-4. Sustaining 기간 (D31~D365)
    # [V12] LiveOps 강도별 Decay Rate 및 Floor 적용
    d30_nru = nru_series[29] if len(nru_series) > 29 else 100
    
    # V12: LiveOps 강도별 설정 적용
    liveops_config = LIVEOPS_CONFIG.get(liveops_intensity, LIVEOPS_CONFIG["Medium"])
    floor_ratio = liveops_config["floor_ratio"]
    decay_rate = abs(liveops_config["decay_rate"]) / 10  # 월간 decay rate로 변환
    
    # [V12.2 Fix] 절대 하한선 적용
    primary_platform = "PC" if platforms and any(p in ["PC", "Console"] for p in platforms) else "Mobile"
    if platforms and "Console" in platforms and "PC" not in platforms:
        primary_platform = "Console"
    min_absolute_nru = MIN_SUSTAINING_NRU.get(primary_platform, 300)
    
    # ============================================
    # [V12.3 Fix] Sustaining NRU = 예산 기반 Paid + Organic Floor
    # ============================================
    # 1. 예산 기반 Paid NRU 계산
    if sustaining_budget_monthly > 0 and effective_cpa > 0:
        monthly_sustaining_paid = sustaining_budget_monthly / effective_cpa
        daily_sustaining_paid = int(monthly_sustaining_paid / 30)
    else:
        monthly_sustaining_paid = 0
        daily_sustaining_paid = 0
    
    # 2. Organic Floor (기존 로직 유지 - D30 기반)
    base_organic_floor = int(d30_nru * floor_ratio)
    ratio_based_floor = int(d30_nru * floor_ratio * 0.5)
    organic_floor = max(ratio_based_floor, min_absolute_nru)
    
    # 3. Sustaining NRU = Paid + Organic (예산 기반 능동적 유입)
    for day in range(launch_period, days):
        months_after_launch = (day - launch_period) / 30
        
        # Organic Decay (LiveOps 강도별)
        decay = np.exp(-decay_rate * months_after_launch)
        daily_organic = int(base_organic_floor * decay)
        
        # 최종 Sustaining NRU = Paid(예산 기반) + Organic(Floor 보장)
        daily_sustaining = daily_sustaining_paid + max(daily_organic, organic_floor)
        nru_series[day] += daily_sustaining
    
    # 최소값 보장 (절대 하한선 적용)
    nru_series = [max(nru, min_absolute_nru) for nru in nru_series]
    
    # ============================================
    # 6. 메타 정보 반환
    # ============================================
    meta_info = {
        "effective_cpa": effective_cpa,
        "cpa_saturation_factor": round(saturation_factor, 3),
        "adjusted_threshold": adjusted_threshold if 'adjusted_threshold' in dir() else CPA_SATURATION_THRESHOLD,
        "budget_scale": budget_scale if 'budget_scale' in dir() else 0,
        "brand_efficiency_bonus": brand_efficiency_bonus if 'brand_efficiency_bonus' in dir() else 0,
        "pre_launch_users": pre_launch_paid_nru,
        "wishlist_users": wishlist_users,
        "d1_burst_users": d1_burst_users,
        "post_launch_paid_nru": post_launch_paid_nru,
        "organic_boost_factor": round(organic_boost, 2),
        "brand_time_lag_peak_day": 15 if brand_time_lag_enabled else 1,
        # V12: LiveOps 정보
        "liveops_intensity": liveops_intensity,
        "liveops_decay_rate": liveops_config["decay_rate"],
        "liveops_floor_ratio": floor_ratio,
        # V12.3: Sustaining 정보
        "sustaining_budget_monthly": sustaining_budget_monthly,
        "sustaining_paid_nru_daily": daily_sustaining_paid,
        "sustaining_organic_floor": organic_floor,
    }
    
    return nru_series[:days], total_paid_nru, organic_nru_total, organic_boost, meta_info

def calculate_pr_pattern(selected_games: List[str], raw_data: dict):
    pr_games = raw_data['games']['payment_rate']
    
    valid_games = [g for g in selected_games if g in pr_games]
    if not valid_games:
        return [0.02] * 365
    
    min_len = min(len(pr_games[g]) for g in valid_games)
    min_len = min(min_len, 365)
    
    pattern = []
    for day in range(min_len):
        day_values = [pr_games[g][day] for g in valid_games if day < len(pr_games[g]) and pr_games[g][day] > 0]
        avg_pr = np.mean(day_values) if day_values else 0.02
        pattern.append(max(avg_pr, 0.001))
    
    while len(pattern) < 365:
        pattern.append(pattern[-1] if pattern else 0.02)
    
    return pattern[:365]

def calculate_arppu_pattern(selected_games: List[str], raw_data: dict):
    arppu_games = raw_data['games']['arppu']
    
    valid_games = [g for g in selected_games if g in arppu_games]
    if not valid_games:
        return [50000] * 365
    
    min_len = min(len(arppu_games[g]) for g in valid_games)
    min_len = min(min_len, 365)
    
    pattern = []
    for day in range(min_len):
        day_values = [arppu_games[g][day] for g in valid_games if day < len(arppu_games[g]) and arppu_games[g][day] > 0]
        avg_arppu = np.mean(day_values) if day_values else 50000
        pattern.append(max(avg_arppu, 1000))
    
    while len(pattern) < 365:
        pattern.append(pattern[-1] if pattern else 50000)
    
    return pattern[:365]

def calculate_dau_matrix(nru_series: List[int], retention_curve: List[float], days: int = 365):
    """
    [R1 Fix] DAU 코호트 계산
    - D0 (설치 당일): 리텐션 = 1.0 (100%)
    - D1 이후: retention_curve[days_since_install - 1]
    """
    daily_dau = []
    
    for active_day in range(days):
        total_dau = 0
        for cohort_day in range(active_day + 1):
            days_since_install = active_day - cohort_day
            
            if cohort_day < len(nru_series):
                nru = nru_series[cohort_day]
                
                if days_since_install == 0:
                    retention = 1.0
                else:
                    idx = days_since_install - 1
                    retention = retention_curve[idx] if idx < len(retention_curve) else 0
                
                total_dau += nru * retention
        daily_dau.append(int(total_dau))
    
    return daily_dau

def calculate_revenue(dau: List[float], pr: List[float], arppu: List[float], 
                      arppu_unit: str = "monthly", nru: List[float] = None, 
                      package_price: float = 0, platforms: List[str] = None):
    """
    일별 매출 계산 (V12.1)
    
    IAP Revenue = DAU × PR × Daily_ARPPU
    Package Revenue = NRU × Package_Price (PC/Console only)
    Total Revenue = IAP + Package
    
    Args:
        dau: 일별 DAU
        pr: 일별 결제율
        arppu: ARPPU (월간 또는 일간)
        arppu_unit: "monthly" 또는 "daily"
        nru: 일별 NRU (패키지 매출 계산용)
        package_price: 패키지 가격 (PC/Console)
        platforms: 플랫폼 리스트
    """
    revenue = []
    package_revenue_total = 0
    
    # PC/Console 플랫폼 체크
    is_pc_console = platforms and any(p in ["PC", "Console"] for p in platforms)
    
    for i in range(len(dau)):
        pr_val = pr[i] if i < len(pr) else pr[-1]
        arppu_val = arppu[i] if i < len(arppu) else arppu[-1]
        
        # V12.1: ARPPU 단위 변환
        if arppu_unit == "daily":
            daily_arppu = arppu_val  # 일간이면 그대로
        else:
            daily_arppu = arppu_val / 30  # 월간이면 /30
        
        # IAP 매출 = DAU × PR × 일별 ARPPU
        iap_revenue = dau[i] * pr_val * daily_arppu
        
        # V12.3.2: 패키지 매출 (PC/Console - 모든 NRU에 적용)
        # B2P 게임은 신규 유저가 구매 시 패키지 가격을 지불하므로 365일 내내 적용
        pkg_revenue = 0
        if is_pc_console and package_price > 0 and nru:
            nru_val = nru[i] if i < len(nru) else 0
            pkg_revenue = nru_val * package_price
            package_revenue_total += pkg_revenue
        
        daily_revenue = iap_revenue + pkg_revenue
        revenue.append(daily_revenue)
    
    return revenue

# OpenAI AI Integration
CURRENT_MODEL = "gpt-4o"

async def get_ai_insight(prompt: str) -> tuple:
    """Call OpenAI API for AI insights with Mock Fallback
    Returns: (insight_text, error_message) - error_message is None if successful
    """
    if not OPENAI_API_KEY:
        print("💡 API Key가 없습니다. Mock 데이터를 반환합니다.")
        return (None, "OPENAI_API_KEY 환경변수가 설정되지 않았습니다.")
    
    try:
        async with httpx.AsyncClient(timeout=60.0) as client:
            response = await client.post(
                OPENAI_API_URL,
                headers={
                    "Authorization": f"Bearer {OPENAI_API_KEY}",
                    "Content-Type": "application/json"
                },
                json={
                    "model": CURRENT_MODEL,
                    "max_tokens": 2000,
                    "messages": [
                        {"role": "system", "content": "You are a game industry expert analyst."},
                        {"role": "user", "content": prompt}
                    ]
                }
            )
            
            response.raise_for_status()
            
            data = response.json()
            return (data["choices"][0]["message"]["content"], None)
                
    except httpx.HTTPStatusError as e:
        error_msg = f"OpenAI API HTTP 에러: {e.response.status_code}"
        print(f"❌ {error_msg}")
        return (None, error_msg)
    except httpx.TimeoutException:
        error_msg = "OpenAI API 타임아웃 (60초 초과)"
        print(f"❌ {error_msg}")
        return (None, error_msg)
    except Exception as e:
        error_msg = f"AI 호출 에러: {str(e)}"
        print(f"❌ {error_msg}")
        print("🔄 안전하게 Mock 데이터로 전환합니다.")
        return (None, error_msg)

def create_insight_prompt(summary: Dict[str, Any], analysis_type: str) -> str:
    """Create prompt for AI based on analysis type with Multi-Persona approach"""
    
    # V7 설정 정보 추출
    v7_settings = summary.get('v7_settings', {})
    blending = summary.get('blending', {})
    
    # V12.3.1: Best-Worst 편차 미리 계산 (f-string 내 dict 오류 방지)
    best_revenue = summary.get('best', {}).get('gross_revenue', 1)
    worst_revenue = summary.get('worst', {}).get('gross_revenue', 1)
    best_worst_variance = ((best_revenue / max(worst_revenue, 1)) - 1) * 100
    
    # V9.2: 플랫폼별 용어 동적 설정
    platforms = blending.get('platforms', ['PC'])
    cost_metric = "CPI" if "Mobile" in platforms else "CPA"
    is_pc_console = any(p in ['PC', 'Console'] for p in platforms)
    
    # V9.2: BEP 상태 계산
    bep_day = summary.get('bep_day', -1)
    bep_status = ""
    if bep_day <= 0:
        bep_status = f"""
[⚠️ Critical Issue: BEP 미달성]
현재 구조로는 1년 내 투자 회수가 어렵습니다. 분석 시 다음 전략을 반드시 포함하세요:
1. {cost_metric} 절감 방안: 타겟팅 최적화 또는 오가닉 비중 확대
2. LTV 개선: 리텐션 D30을 5%p 올리거나 ARPPU를 15% 상향하는 시뮬레이션 제안
3. BM 재검토: 패키지 가격 또는 인게임 결제 모델 조정"""
    else:
        bep_status = f"BEP는 D+{bep_day}에 달성될 것으로 예상됩니다. 안정적인 현금 흐름이 기대됩니다."
    
    base_context = f"""당신은 게임 KPI 프로젝션 분석을 수행하는 4명의 전문가 패널입니다.

[전문가 패널 구성]
1. UA 및 브랜딩 마케터 전문가: {cost_metric} 적정성, 모객 효율, UA 전략, CAC/LTV 분석, Organic Boost 평가
2. 데이터 사이언스 전문가: 지표 건전성, 리텐션 패턴, 통계적 신뢰도, 예측 정확도
3. 퍼블리싱 전문가: BM 구조, 시장 경쟁력, 장르 특성, 글로벌 트렌드, 런칭 타이밍
4. 라이브 서비스 전문가: BEP, ROAS, 투자 회수, Sustaining 전략, 콘텐츠 운영

[플랫폼 컨텍스트]
- 플랫폼: {', '.join(platforms)}
- 비용 지표: {cost_metric} ({'PC/Console은 설치당 비용이 아닌 전환당 비용 기준' if is_pc_console else '모바일 설치당 비용 기준'})
{'- 참고: PC/Console 플랫폼은 CPI 기반 UA가 제한적이므로 Steam 노출, 미디어 리뷰, 커뮤니티 바이럴 등 Organic 중심으로 평가하세요.' if is_pc_console else ''}

[BEP 상태]
{bep_status}

[프로젝션 결과 요약]
프로젝션 기간: {summary.get('projection_days', 365)}일
런칭일: {summary.get('launch_date', 'N/A')}

Best 시나리오:
- 총 Gross Revenue: {summary.get('best', {}).get('gross_revenue', 0):,.0f}원
- 총 NRU: {summary.get('best', {}).get('total_nru', 0):,}명
- Peak DAU: {summary.get('best', {}).get('peak_dau', 0):,}명
- 평균 DAU: {summary.get('best', {}).get('average_dau', 0):,}명

Normal 시나리오:
- 총 Gross Revenue: {summary.get('normal', {}).get('gross_revenue', 0):,.0f}원
- 총 NRU: {summary.get('normal', {}).get('total_nru', 0):,}명
- Peak DAU: {summary.get('normal', {}).get('peak_dau', 0):,}명
- 평균 DAU: {summary.get('normal', {}).get('average_dau', 0):,}명

Worst 시나리오:
- 총 Gross Revenue: {summary.get('worst', {}).get('gross_revenue', 0):,.0f}원
- 총 NRU: {summary.get('worst', {}).get('total_nru', 0):,}명
- Peak DAU: {summary.get('worst', {}).get('peak_dau', 0):,}명
- 평균 DAU: {summary.get('worst', {}).get('average_dau', 0):,}명

[V7 산술 근거 - 이 결과가 어떻게 도출되었는지]
- 블렌딩 비율: 내부 표본 {blending.get('weight_internal', 0.7)*100:.0f}% + 벤치마크 {blending.get('weight_benchmark', 0.3)*100:.0f}%
- Time-Decay: {blending.get('time_decay', True)} (D1:내부90% → D365:벤치마크90%)
- 품질 등급: {v7_settings.get('quality_score', 'B')}급 (승수 ×{v7_settings.get('quality_multiplier', 1.0)})
- BM 타입: {v7_settings.get('bm_type', 'Midcore')}
- 적용 지역: {', '.join(v7_settings.get('regions', ['global']))}
- 계절성 적용: {v7_settings.get('seasonality_applied', True)}
- 벤치마크 기준: {blending.get('genre', 'N/A')} / {', '.join(platforms)}

[중요 지시사항]
- 마크다운 문법(###, **, -, * 등)을 절대 사용하지 마세요
- 일반 텍스트로만 작성하세요
- 번호는 1. 2. 3. 형식으로 사용하세요
- 강조는 따옴표나 괄호로 표현하세요
- 의사결정 지원용으로 전문적이고 간결하게 작성하세요
- 장르 컨텍스트를 정확히 반영하세요 (입력된 장르: {blending.get('genre', 'N/A')})
- BEP 미달성 시 반드시 개선 전략을 포함하세요
"""
    
    type_prompts = {
        "executive_report": f"""
[분석 요청: 종합분석 보고서]
4명의 전문가가 각자의 관점에서 분석하고, 최종 의사결정을 위한 종합 보고서를 작성해주세요.

플랫폼: {', '.join(blending.get('platforms', ['PC']))}
{'- PC/Console 플랫폼: CPI/CPA 기반 UA가 제한적이므로 Steam 노출, 미디어 리뷰, 커뮤니티 바이럴 등 Organic 중심으로 평가하세요.' if any(p in ['PC', 'Console'] for p in blending.get('platforms', ['PC'])) else ''}

응답 형식:

[1. Executive Summary - 핵심 요약]
Normal 시나리오 기준 1년 예상 매출과 핵심 지표를 한 문장으로 요약

[2. 산술 근거 및 가정]
- 이 프로젝션이 어떤 가정과 로직으로 도출되었는지 설명
- 블렌딩 비율, 품질 등급, BM 타입이 결과에 미친 영향

[3. 전문가 통합 분석]
UA&브랜딩 마케터, 퍼블리싱, 데이터 사이언스, 라이브 서비스 4명의 전문가 관점을 종합하여 다음 사항을 하나의 통합된 분석으로 작성:
- 모객 효율 및 {'Organic 중심 마케팅 전략' if any(p in ['PC', 'Console'] for p in blending.get('platforms', ['PC'])) else 'UA 전략'}
- {blending.get('genre', 'N/A')} 장르 시장 경쟁력 및 BM 구조 적합성
- 리텐션 커브 건전성 및 Best-Worst 편차 ({best_worst_variance:.0f}%)
- ROAS, 손익분기점, Sustaining 전략

각 전문가의 의견을 나열하지 말고, 하나의 통합된 문단으로 자연스럽게 연결하여 작성하세요.

[4. 프로젝션 신뢰도 평가]
- 데이터 신뢰도: (표본 수, 벤치마크 정합성)
- 가정의 현실성: ({'Organic 비율' if any(p in ['PC', 'Console'] for p in blending.get('platforms', ['PC'])) else 'CPI'}, 리텐션, ARPU 가정 적정성)
- 편차 분석: Best-Worst 시나리오 간 편차 분석

[5. 리스크 분석 및 BEP 달성 전략]
- 핵심 리스크 3가지와 완화 전략
- BEP(손익분기점) 달성이 어려운 경우: 달성을 위한 구체적 개선 방안 제시 (마케팅 효율화, 리텐션 개선, ARPU 향상 등)

[6. 경쟁력 분석]
- {blending.get('genre', 'N/A')} 장르 시장 내 예상 포지셔닝

[7. Go/No-Go 권고]
- 최종 권고: (Go / Conditional Go / No-Go 중 하나)
- 권고 이유: 한 문장
- 권장 액션 3가지

총 1200자 이내로 작성하세요.
""",
        "general": """
[분석 요청: 종합 분석]
4명의 전문가(UA&브랜딩 마케터, 퍼블리싱, 데이터 사이언스, 라이브 서비스)의 관점을 종합한 통합 분석을 작성해주세요.

응답 형식:
1. 통합 분석: 모객 효율, 시장 경쟁력, 지표 건전성, 운영 및 투자 회수 관점을 하나의 문단으로 통합하여 작성 (각 전문가 의견을 나열하지 말고 자연스럽게 연결)
2. 핵심 강점 2가지
3. 핵심 리스크 2가지
4. 권장 액션 3가지

총 400자 이내로 작성하세요.
""",
        "reliability": f"""
[분석 요청: 신뢰도 평가]
4명의 전문가(UA&브랜딩 마케터, 퍼블리싱, 데이터 사이언스, 라이브 서비스)가 이 프로젝션의 신뢰도를 종합적으로 평가해주세요.

플랫폼: {', '.join(blending.get('platforms', ['PC']))}
{'- PC/Console 플랫폼은 모바일과 달리 CPI/CPA 기반 UA가 제한적이므로, Steam/스토어 노출, 미디어 리뷰, 커뮤니티 바이럴 등 Organic 중심 모객을 기준으로 평가하세요.' if any(p in ['PC', 'Console'] for p in blending.get('platforms', ['PC'])) else '- 모바일 플랫폼은 CPI/CPA 기반 UA 효율을 중심으로 평가하세요.'}

응답 형식:
1. 신뢰도 점수: 입력에 reliability_card가 포함된 경우 그 지표별 등급을 근거로 해석하고, 직접 창작하지 말 것. 카드가 없으면 "카드 미제공"이라고 답할 것.
2. 신뢰도 등급: reliability_card.metrics의 등급을 인용·해석 (백엔드 계산값이 유일한 근거)
3. 통합 신뢰도 평가: {'모객 목표 현실성 (Organic 중심), ' if any(p in ['PC', 'Console'] for p in blending.get('platforms', ['PC'])) else 'NRU/CPI 목표 현실성, '}표본 데이터 품질, 시장 벤치마크 적정성, 수익 예측 현실성을 하나의 통합된 문단으로 분석
4. 신뢰도 향상 제안: 구체적인 개선 방안 3가지

총 500자 이내로 작성하세요.
""",
        "retention": """
[분석 요청: 리텐션 분석]
4명의 전문가(UA&브랜딩 마케터, 퍼블리싱, 데이터 사이언스, 라이브 서비스)가 리텐션 및 DAU 패턴을 종합적으로 분석해주세요.

응답 형식:
1. DAU 패턴 건강도: (좋음/보통/우려 중 하나와 이유)
2. 통합 리텐션 분석: 리텐션 커브 분석, 장르 대비 수준, UA 효율 영향을 하나의 통합된 문단으로 분석 (각 전문가 의견을 나열하지 말 것)
3. 리텐션 개선 액션 플랜: 우선순위별 3가지

총 400자 이내로 작성하세요.
""",
        "revenue": """
[분석 요청: 매출 분석]
4명의 전문가(UA&브랜딩 마케터, 퍼블리싱, 데이터 사이언스, 라이브 서비스)가 매출 예측을 종합적으로 분석해주세요.

응답 형식:
1. 매출 예측 현실성: (낙관적/적정/보수적 중 하나와 이유)
2. 통합 매출 분석: 손익분기점, ARPU, 과금 전환율, 시장 점유율을 하나의 통합된 문단으로 분석 (각 전문가 의견을 나열하지 말 것)
3. 매출 극대화 전략: 우선순위별 3가지

총 400자 이내로 작성하세요.
""",
        "risk": """
[분석 요청: 리스크 분석]
4명의 전문가(UA&브랜딩 마케터, 퍼블리싱, 데이터 사이언스, 라이브 서비스)가 리스크 요인을 종합적으로 분석해주세요.

응답 형식:
1. 전체 리스크 수준: (높음/중간/낮음 중 하나)
2. Best-Worst 편차 분석: (편차 비율과 의미)
3. 통합 리스크 분석: 재무 리스크, UA 리스크, 예측 불확실성, 시장/경쟁 리스크를 하나의 통합된 문단으로 분석 (각 전문가 의견을 나열하지 말 것)
4. 리스크 완화 전략: 우선순위별 3가지

총 450자 이내로 작성하세요.
""",
        "competitive": """
[분석 요청: 경쟁력 분석]
4명의 전문가(UA&브랜딩 마케터, 퍼블리싱, 데이터 사이언스, 라이브 서비스)가 시장 경쟁력을 종합적으로 분석해주세요.

응답 형식:
1. 시장 경쟁력 등급: (상/중/하 중 하나와 이유)
2. 통합 경쟁력 분석: 장르 내 포지셔닝, 차별화 포인트, 수익 모델 경쟁력을 하나의 통합된 문단으로 분석 (각 전문가 의견을 나열하지 말 것)
3. 경쟁력 강화 전략: 우선순위별 3가지

총 400자 이내로 작성하세요.
"""
    }
    
    return base_context + type_prompts.get(analysis_type, type_prompts["general"])

# API Endpoints
@app.get("/")
async def root():
    return {"message": "Game KPI Projection API", "version": "2.0.0", "ai_enabled": bool(OPENAI_API_KEY)}

@app.get("/api/health")
async def health():
    """배포 자가진단 — 신규 모듈 로드 확인 (출력 안 될 때 최우선 확인)"""
    mods = {}
    for name in ["contracts", "external_evidence", "product_timeline", "product_3y", "arpdau_engine", "v14_engines"]:
        try:
            __import__(name); mods[name] = "loaded"
        except Exception as e:
            mods[name] = f"FAIL: {e}"
    import os as _os
    data_ok = {f: _os.path.exists(_os.path.join(DATA_DIR, f)) for f in
               ["raw_game_data.json", "internal_priors.json", "external_evidence.json"]}
    return {"status": "ok" if all(v == "loaded" for v in mods.values()) else "MODULE_MISSING",
            "version": "v14.0.2", "modules": mods, "data_files": data_ok,
            "hint": "MODULE_MISSING이면 backend 폴더 전체(신규 .py 6개)가 배포됐는지 확인"}

@app.get("/api/games")
async def get_available_games():
    raw_data = load_raw_data()
    return {
        "retention": list(raw_data['games']['retention'].keys()),
        "nru": list(raw_data['games']['nru'].keys()),
        "payment_rate": list(raw_data['games']['payment_rate'].keys()),
        "arppu": list(raw_data['games']['arppu'].keys())
    }

@app.get("/api/games/metadata")
async def get_games_metadata():
    """Get metadata for all games (release date, genre, platform, etc.)"""
    raw_data = load_raw_data()
    return raw_data.get('game_metadata', {})

@app.get("/api/games/{metric}/{game_name}")
async def get_game_data(metric: str, game_name: str):
    raw_data = load_raw_data()
    
    if metric not in raw_data['games']:
        raise HTTPException(status_code=404, detail=f"Metric '{metric}' not found")
    
    if game_name not in raw_data['games'][metric]:
        raise HTTPException(status_code=404, detail=f"Game '{game_name}' not found in {metric}")
    
    return {
        "game": game_name,
        "metric": metric,
        "data": raw_data['games'][metric][game_name]
    }

@app.get("/api/config")
async def get_default_config():
    return load_config()

@app.post("/api/projection")
async def calculate_projection(input_data: ProjectionInput):
    raw_data = load_raw_data()
    
    days = input_data.projection_days
    results = {"best": {}, "normal": {}, "worst": {}}
    
    # ============================================
    # V7: 블렌딩 설정 추출
    # ============================================
    blending = input_data.blending or {}
    base_weight = blending.get("weight", 0.7)  # 기본값: 내부 70%
    genre = blending.get("genre", "MMORPG")
    platforms = blending.get("platforms", ["PC"])
    use_benchmark_only = blending.get("benchmark_only", False)
    use_time_decay = blending.get("time_decay", True)  # V7: Time-Decay 기본 활성화
    
    # V7: Quality Score & BM Type
    quality_grade = input_data.quality_score or "B"
    quality_multiplier = QUALITY_SCORES.get(quality_grade, 1.0)
    bm_type = input_data.bm_type or "Midcore"
    # V14.1.0: 공통 BM 계약 — Manual/Hybrid 표본 존재 시 modifier 1.0 (이중반영 방지), benchmark-only는 evidence-backed만
    bm_modifier = bm_contracts.resolve_bm_modifier(
        bm_type, blending.get("benchmark_only", False),
        input_data.revenue.selected_games_pr or [], input_data.revenue.selected_games_arppu or [])
    
    # V7: 계절성 팩터
    regions = input_data.regions or ["global"]
    seasonality_factors = calculate_seasonality(regions, input_data.launch_date, days)
    
    # 표본 게임이 없으면 벤치마크 100% 사용
    has_sample_games = len(input_data.retention.selected_games) > 0
    if not has_sample_games:
        base_weight = 0.0
        use_benchmark_only = True
    
    # 벤치마크 데이터 가져오기 (BM Type 적용)
    benchmark = get_benchmark_data(genre, platforms, input_data.exclude_family)
    benchmark["pr"] = benchmark["pr"] * bm_modifier["pr_mod"]
    benchmark["arppu"] = benchmark["arppu"] * bm_modifier["arppu_mod"]
    benchmark_ret_curve = generate_benchmark_retention_curve(benchmark, days)
    
    # 내부 표본 기반 계수 계산
    a, b = calculate_retention_coefficients(input_data.retention.selected_games, raw_data)
    pr_pattern = calculate_pr_pattern(input_data.revenue.selected_games_pr, raw_data)
    arppu_pattern = calculate_arppu_pattern(input_data.revenue.selected_games_arppu, raw_data)
    
    # V12.1: 고급 옵션 추출
    advanced = input_data.advanced or {}
    two_stage_enabled = advanced.get("two_stage_retention", False)
    liveops_intensity = advanced.get("liveops_intensity", "Medium")
    arppu_unit_input = advanced.get("arppu_unit", "daily")  # V13.1 P0: default=daily
    # P0 canonicalization: 내부 표본 ARPPU는 계약상 daily 확정 → UI 설정과 무관하게 daily
    # custom_arppu(사용자 입력)에만 사용자 지정 unit 적용
    _uses_custom_arppu = bool(input_data.revenue.custom_arppu and input_data.revenue.custom_arppu > 0)
    arppu_unit = arppu_unit_input if _uses_custom_arppu else "daily"
    seasonality_regions = advanced.get("seasonality_regions", [])
    
    # V12.1: 사용자 직접 입력값 확인 (우선순위: 사용자 > 벤치마크)
    custom_pr = input_data.revenue.custom_pr
    custom_arppu = input_data.revenue.custom_arppu
    package_price = input_data.revenue.package_price or 0
    
    # 플랫폼에서 주요 플랫폼 추출 (첫 번째 또는 PC 우선)
    primary_platform = "PC" if "PC" in platforms else (platforms[0] if platforms else "Mobile")
    
    # V12.2: 조정된 b값 추적용
    adjusted_b_value = b
    
    for scenario in ["best", "normal", "worst"]:
        target_d1 = input_data.retention.target_d1_retention[scenario]
        
        # V12.2: 2-Stage Retention + D30 앵커 강력 보정
        if two_stage_enabled:
            internal_ret_curve, adjusted_b_value = generate_retention_curve_v12(
                a, b, target_d1, days,
                two_stage_enabled=True,
                liveops_intensity=liveops_intensity,
                genre=genre,
                platform=primary_platform, exclude_family=input_data.exclude_family
            )
        else:
            # D30 앵커 보정만 적용
            internal_ret_curve, adjusted_b_value = generate_retention_curve_v12(
                a, b, target_d1, days,
                two_stage_enabled=False,
                liveops_intensity=liveops_intensity,
                genre=genre,
                platform=primary_platform, exclude_family=input_data.exclude_family
            )
        
        # V7: Time-Decay 블렌딩 적용
        if use_time_decay and not use_benchmark_only:
            # 벤치마크 커브를 target_d1에 맞게 스케일링
            benchmark_scale = target_d1 / benchmark["d1"] if benchmark["d1"] > 0 else 1.0
            scaled_benchmark_curve = [min(r * benchmark_scale, 1.0) for r in benchmark_ret_curve]
            ret_curve = calculate_time_decay_blended_retention(
                internal_ret_curve, scaled_benchmark_curve, days, quality_multiplier
            )
        elif not use_benchmark_only:
            # 기존 고정 블렌딩
            benchmark_scale = target_d1 / benchmark["d1"] if benchmark["d1"] > 0 else 1.0
            scaled_benchmark_curve = [min(r * benchmark_scale, 1.0) for r in benchmark_ret_curve]
            ret_curve = calculate_blended_retention(internal_ret_curve, scaled_benchmark_curve, base_weight)
        else:
            # 벤치마크만 사용
            benchmark_scale = target_d1 / benchmark["d1"] if benchmark["d1"] > 0 else 1.0
            ret_curve = [min(r * benchmark_scale * quality_multiplier, 1.0) for r in benchmark_ret_curve]
        
        # V7: NRU 시리즈 생성 (런칭 마케팅 D1~D30 집중)
        d1_nru = input_data.nru.d1_nru[scenario]
        
        # 시나리오별 NRU 보정
        nru_adj = input_data.nru.adjustment.get("best_vs_normal", 0) if scenario == "best" else \
                  input_data.nru.adjustment.get("worst_vs_normal", 0) if scenario == "worst" else 0
        adjusted_d1_nru = int(d1_nru * (1 + nru_adj))
        
        # V8.5: UA/Brand 분리 지원
        ua_budget = input_data.nru.ua_budget or 0
        brand_budget = input_data.nru.brand_budget or 0
        target_cpa = input_data.nru.target_cpa or 2000
        base_organic_ratio = input_data.nru.base_organic_ratio or 0.2
        
        # UA/Brand 예산이 설정되어 있으면 V8.5 로직 사용
        if ua_budget > 0:
            # 시나리오별 예산 조정
            scenario_mult = 1.1 if scenario == "best" else (0.9 if scenario == "worst" else 1.0)
            adj_ua = int(ua_budget * scenario_mult)
            adj_brand = int(brand_budget * scenario_mult)
            
            sustaining_monthly = input_data.nru.sustaining_mkt_budget_monthly or 0
            # V12.3: 기본값 = UA 예산의 10%
            if sustaining_monthly == 0:
                sustaining_monthly = int(ua_budget * 0.1 / 12)  # 연간의 10%를 월간으로 환산
            
            # V8.5+ 신규 파라미터
            pre_marketing_ratio = input_data.nru.pre_marketing_ratio or 0.0
            wishlist_conversion_rate = input_data.nru.wishlist_conversion_rate or 0.15
            cpa_saturation_enabled = input_data.nru.cpa_saturation_enabled if input_data.nru.cpa_saturation_enabled is not None else True
            brand_time_lag_enabled = input_data.nru.brand_time_lag_enabled if input_data.nru.brand_time_lag_enabled is not None else True
            
            # [V11.0] 플랫폼 정보 추출
            platforms = input_data.blending.get("platforms", ["PC"]) if input_data.blending else ["PC"]
            
            # [V12.0] LiveOps 강도 추출
            liveops_intensity = "Medium"
            if input_data.advanced:
                liveops_intensity = input_data.advanced.get("liveops_intensity", "Medium")
            
            nru_series, paid_nru, organic_nru, organic_boost, nru_meta = generate_nru_series_v85(
                adj_ua, adj_brand, target_cpa, base_organic_ratio, days, 30, sustaining_monthly,
                pre_marketing_ratio, wishlist_conversion_rate, cpa_saturation_enabled, brand_time_lag_enabled,
                platforms, liveops_intensity,
                external_reservoir_activated=int((input_data.nru.external_reservoir_activated or 0) * scenario_mult)
            )
            
            # 시나리오별 메타 정보 저장
            if scenario == "normal":
                v85_nru_meta = {
                    "paid_nru": paid_nru,
                    "organic_nru": organic_nru,
                    "organic_boost_factor": round(organic_boost, 2),
                    "total_nru": paid_nru + organic_nru,
                    # V8.5+ 추가 메타
                    "effective_cpa": nru_meta["effective_cpa"],
                    "cpa_saturation_factor": nru_meta["cpa_saturation_factor"],
                    "pre_launch_users": nru_meta["pre_launch_users"],
                    "wishlist_users": nru_meta["wishlist_users"],
                    "d1_burst_users": nru_meta["d1_burst_users"],
                    "brand_time_lag_peak_day": nru_meta["brand_time_lag_peak_day"],
                    # V12.3: 누락된 필드들 추가
                    "post_launch_paid_nru": nru_meta["post_launch_paid_nru"],
                    "sustaining_paid_nru_daily": nru_meta["sustaining_paid_nru_daily"],
                    "sustaining_organic_floor": nru_meta["sustaining_organic_floor"],
                    "sustaining_budget_monthly": nru_meta["sustaining_budget_monthly"],
                    "brand_efficiency_bonus": nru_meta["brand_efficiency_bonus"],
                }
        else:
            # 기존 로직 (d1_nru 직접 입력)
            nru_series = generate_nru_series(adjusted_d1_nru, [], days)
            v85_nru_meta = None
        
        # V7: 계절성 적용 (NRU에 반영)
        # V13.2: 계절성 이중적용 제거 — Revenue 경로 1회만 적용 (피드백4 #15)
        pass
        
        # DAU 계산
        dau_series = calculate_dau_matrix(nru_series, ret_curve, days)
        
        # PR 보정
        pr_adj = input_data.revenue.pr_adjustment.get("best_vs_normal", 0) if scenario == "best" else \
                 input_data.revenue.pr_adjustment.get("worst_vs_normal", 0) if scenario == "worst" else 0
        
        # PR 블렌딩 (BM Type 적용됨) + V7: Quality Score도 적용
        if not use_benchmark_only:
            weight_internal = base_weight
            # 벤치마크 PR에 Quality Score 적용
            adjusted_benchmark_pr = benchmark["pr"] * quality_multiplier
            pr_series = calculate_blended_pr(pr_pattern, adjusted_benchmark_pr, weight_internal, days)
        else:
            # 벤치마크만 사용 시에도 Quality Score 적용
            pr_series = [benchmark["pr"] * quality_multiplier] * days
        pr_series = [p * (1 + pr_adj) for p in pr_series]
        
        # V12.1: 사용자 직접 PR 입력값 우선 적용
        if custom_pr is not None and custom_pr > 0:
            pr_series = [custom_pr * (1 + pr_adj)] * days
        
        # ARPPU 보정
        arppu_adj = input_data.revenue.arppu_adjustment.get("best_vs_normal", 0) if scenario == "best" else \
                    input_data.revenue.arppu_adjustment.get("worst_vs_normal", 0) if scenario == "worst" else 0
        
        # ARPPU 블렌딩 (BM Type 적용됨) + V7: Quality Score도 적용
        if not use_benchmark_only:
            # 벤치마크 ARPPU에 Quality Score 적용
            adjusted_benchmark_arppu = benchmark["arppu"] * quality_multiplier
            arppu_series = calculate_blended_arppu(arppu_pattern, adjusted_benchmark_arppu, base_weight, days)
        else:
            # 벤치마크만 사용 시에도 Quality Score 적용
            arppu_series = [benchmark["arppu"] * quality_multiplier] * days
        arppu_series = [a * (1 + arppu_adj) for a in arppu_series]
        
        # V12.1: 사용자 직접 ARPPU 입력값 우선 적용
        if custom_arppu is not None and custom_arppu > 0:
            arppu_series = [custom_arppu * (1 + arppu_adj)] * days
        
        # V7: 계절성을 ARPPU에도 반영
        arppu_series = [arppu * sf for arppu, sf in zip(arppu_series, seasonality_factors)]
        
        # V12.1: Revenue 계산 (ARPPU 단위 + 패키지 매출 적용)
        revenue_series = calculate_revenue(
            dau_series, pr_series, arppu_series,
            arppu_unit=arppu_unit,
            nru=nru_series,
            package_price=package_price,
            platforms=platforms
        )
        
        results[scenario] = {
            "retention": {
                "coefficients": {"a": float(a), "b": float(b)},
                "target_d1": target_d1,
                "curve": ret_curve[:90]
            },
            "nru": {
                "d1_nru": d1_nru,
                "series": nru_series[:90],
                "total": sum(nru_series),
                "paid": paid_nru if ua_budget > 0 else sum(nru_series),
                "organic": organic_nru if ua_budget > 0 else 0
            },
            "dau": {
                "series": dau_series[:90],
                "peak": int(max(dau_series)),
                "average": int(np.mean(dau_series))
            },
            "revenue": {
                "pr_series": pr_series[:90],
                "arppu_series": arppu_series[:90],
                "daily_revenue": revenue_series[:90],
                "total_gross": sum(revenue_series),
                "average_daily": float(np.mean(revenue_series))
            },
            "full_data": {
                "nru": nru_series,
                "dau": dau_series,
                "revenue": revenue_series,
                "retention": ret_curve,
                "pr": pr_series,
                "arppu": arppu_series
            }
        }
    
    # Calculate summary
    summary = {}
    
    # V8.5: 마케팅 예산 총합 계산
    ua_budget = input_data.nru.ua_budget or 0
    brand_budget = input_data.nru.brand_budget or 0
    basic = input_data.basic_settings or load_config()["basic_settings"]
    # V12.3: sustaining_monthly를 NRUInput에서 가져옴
    sustaining_monthly = input_data.nru.sustaining_mkt_budget_monthly or 0
    if sustaining_monthly == 0:
        sustaining_monthly = int(ua_budget * 0.1 / 12)  # 기본값: UA의 10%를 월간으로
    total_sustaining = sustaining_monthly * 12  # 연간 유지 예산
    
    total_marketing_budget = ua_budget + brand_budget + total_sustaining
    
    for scenario in ["best", "normal", "worst"]:
        gross = results[scenario]["revenue"]["total_gross"]
        
        market_fee = basic.get("market_fee_ratio", 0.3)
        vat = basic.get("vat_ratio", 0.1)
        infra = basic.get("infrastructure_cost_ratio", 0.03)
        
        net = gross * (1 - market_fee - vat - infra)
        
        # V8.5: ROAS 계산 분리
        # Paid ROAS: 퍼포먼스 마케팅(UA) 효율 (마케터용)
        paid_roas = (gross / ua_budget * 100) if ua_budget > 0 else 0
        
        # Blended ROAS: 전체 마케팅 효율 (경영진 보고용)
        blended_roas = (gross / total_marketing_budget * 100) if total_marketing_budget > 0 else 0
        
        # LTV, CAC 계산
        total_nru = results[scenario]["nru"]["total"]
        paid_nru_count = results[scenario]["nru"].get("paid", total_nru)
        
        ltv = gross / total_nru if total_nru > 0 else 0
        cac_paid = ua_budget / paid_nru_count if paid_nru_count > 0 else 0
        cac_blended = total_marketing_budget / total_nru if total_nru > 0 else 0
        
        summary[scenario] = {
            "gross_revenue": gross,
            "net_revenue": net,
            "total_nru": total_nru,
            "peak_dau": results[scenario]["dau"]["peak"],
            "average_dau": results[scenario]["dau"]["average"],
            "average_daily_revenue": results[scenario]["revenue"]["average_daily"],
            # V8.5: ROAS 분리
            "paid_roas": round(paid_roas, 1),      # UA 효율 (마케터용)
            "blended_roas": round(blended_roas, 1), # 전체 효율 (경영진용)
            "ltv": round(ltv, 0),
            "cac_paid": round(cac_paid, 0),
            "cac_blended": round(cac_blended, 0),
            # V12.3: Total Cost (BEP 계산용)
            "total_cost": total_marketing_budget + (basic.get("hr_cost_monthly", 0) * 12),
            "marketing_cost": total_marketing_budget,
            "hr_cost_annual": basic.get("hr_cost_monthly", 0) * 12
        }
    
    # V8.5: 마케팅 예산 분석 정보
    v85_marketing_analysis = {
        "ua_budget": ua_budget,
        "brand_budget": brand_budget,
        "sustaining_budget_annual": total_sustaining,
        "total_marketing_budget": total_marketing_budget,
        "organic_boost_factor": round(calculate_organic_boost(brand_budget, ua_budget), 2) if ua_budget > 0 else 1.0,
        "budget_breakdown": {
            "ua_ratio": round(ua_budget / total_marketing_budget * 100, 1) if total_marketing_budget > 0 else 0,
            "brand_ratio": round(brand_budget / total_marketing_budget * 100, 1) if total_marketing_budget > 0 else 0,
            "sustaining_ratio": round(total_sustaining / total_marketing_budget * 100, 1) if total_marketing_budget > 0 else 0
        },
        # V8.5+ 신규 메타 정보
        "pre_launch_settings": {
            "pre_marketing_ratio": input_data.nru.pre_marketing_ratio or 0.0,
            "wishlist_conversion_rate": input_data.nru.wishlist_conversion_rate or 0.15,
            "cpa_saturation_enabled": input_data.nru.cpa_saturation_enabled if input_data.nru.cpa_saturation_enabled is not None else True,
            "brand_time_lag_enabled": input_data.nru.brand_time_lag_enabled if input_data.nru.brand_time_lag_enabled is not None else True
        },
        "nru_analysis": v85_nru_meta if 'v85_nru_meta' in dir() and v85_nru_meta else None
    }
    
    # V12.1: Debug 정보 생성 (더 상세하게)
    advanced = input_data.advanced or {}
    liveops_intensity_val = advanced.get("liveops_intensity", "Medium")
    liveops_config = LIVEOPS_CONFIG.get(liveops_intensity_val, LIVEOPS_CONFIG["Medium"])
    
    # D30 Retention 계산 (Normal 시나리오 기준)
    normal_d30_retention = results.get("normal", {}).get("retention", {}).get("curve", [0]*30)
    d30_ret_value = normal_d30_retention[29] if len(normal_d30_retention) > 29 else 0
    
    # 벤치마크 D30 가져오기
    benchmark_d30 = get_internal_benchmark(genre, platforms, input_data.exclude_family)["d30"]  # V13.1
    
    debug_info = {
        # 단위 정보
        "unit_conversion": "daily_arppu_raw" if arppu_unit == "daily" else "monthly_arppu_divided_by_30",
        "arppu_unit": arppu_unit,
        
        # 사용자 직접 입력 여부
        "custom_pr_used": input_data.revenue.custom_pr is not None and input_data.revenue.custom_pr > 0,
        "custom_arppu_used": input_data.revenue.custom_arppu is not None and input_data.revenue.custom_arppu > 0,
        "custom_pr_value": input_data.revenue.custom_pr,
        "custom_arppu_value": input_data.revenue.custom_arppu,
        "package_price": input_data.revenue.package_price or 0,
        
        # V12.3: CPA Saturation 정보
        "saturation_factor": v85_nru_meta.get("cpa_saturation_factor", 1.0) if v85_nru_meta else 1.0,
        "effective_cpa": v85_nru_meta.get("effective_cpa", target_cpa) if v85_nru_meta else target_cpa,
        "brand_efficiency_bonus": v85_nru_meta.get("brand_efficiency_bonus", 0) if v85_nru_meta else 0,
        
        # V12.3: Sustaining 정보
        "sustaining_budget_monthly": sustaining_monthly,
        "sustaining_paid_nru_daily": v85_nru_meta.get("sustaining_paid_nru_daily", 0) if v85_nru_meta else 0,
        "sustaining_organic_floor": v85_nru_meta.get("sustaining_organic_floor", 0) if v85_nru_meta else 0,
        
        # LiveOps 설정
        "liveops_intensity": liveops_intensity_val,
        "liveops_decay_rate": liveops_config["decay_rate"],
        "liveops_floor_ratio": liveops_config["floor_ratio"],
        "liveops_cost_multiplier": liveops_config["cost_multiplier"],
        
        # Floor 정보
        "floor_activated": True,
        "floor_value": liveops_config["floor_ratio"],
        "min_sustaining_nru": MIN_SUSTAINING_NRU.get("PC" if "PC" in platforms else "Mobile", 300),
        
        # Pre-launch 정보
        "prelaunch_mode": "cpw_based",
        "cpw_ratio": PLATFORM_CPW_RATIO.get("PC" if "PC" in platforms else "Mobile", 0.2),
        
        # Retention 정보
        "two_stage_retention": advanced.get("two_stage_retention", False),
        "stage2_decay_rate": liveops_config["decay_rate"] if advanced.get("two_stage_retention", False) else 0,
        "calculated_d30_retention": round(d30_ret_value * 100, 2),
        "benchmark_d30_retention": round(benchmark_d30 * 100, 2),
        "d30_vs_benchmark": "OK" if d30_ret_value >= benchmark_d30 * 0.7 else "LOW (adjusted)",
        "original_b": round(b, 4),
        "adjusted_b": round(adjusted_b_value, 4),
        "b_was_adjusted": abs(b - adjusted_b_value) > 0.01,
        
        # 계절성 정보
        "seasonality_applied": len(advanced.get("seasonality_regions", [])) > 0,
        "seasonality_regions": advanced.get("seasonality_regions", []),
        
        # 플랫폼 정보
        "platforms": platforms,
        "primary_platform": "PC" if "PC" in platforms else (platforms[0] if platforms else "Mobile"),
    }
    
    # V12.2: NRU Gap 계산
    ua_budget_val = input_data.nru.ua_budget or 0
    target_cpa_val = input_data.nru.target_cpa or 2000
    ui_expected_paid_nru = ua_budget_val / max(1, target_cpa_val)
    actual_paid_nru = v85_nru_meta.get("post_launch_paid_nru", 0) if v85_nru_meta else 0
    nru_gap_pct = (1 - (actual_paid_nru / max(1, ui_expected_paid_nru))) * 100 if ui_expected_paid_nru > 0 else 0
    
    debug_info["ui_expected_paid_nru"] = int(ui_expected_paid_nru)
    debug_info["actual_paid_nru"] = int(actual_paid_nru)
    debug_info["nru_gap_percent"] = round(nru_gap_pct, 1)
    
    # V12.2: BEP 역산 (필요 DAU 계산)
    total_cost = summary.get("normal", {}).get("total_cost", 0)
    avg_dau = results.get("normal", {}).get("dau", {}).get("average", 1)
    
    # 평균 PR, ARPPU 계산
    normal_pr_series = results.get("normal", {}).get("revenue", {}).get("pr_series", [0.05])
    normal_arppu_series = results.get("normal", {}).get("revenue", {}).get("arppu_series", [50000])
    avg_pr = np.mean(normal_pr_series) if normal_pr_series else 0.05
    avg_arppu = np.mean(normal_arppu_series) if normal_arppu_series else 50000
    
    # 일간 ARPPU (단위 변환 고려)
    if arppu_unit == "daily":
        daily_arppu = avg_arppu
    else:
        daily_arppu = avg_arppu / 30
    
    # Daily ARPU = ARPPU × PR
    daily_arpu = daily_arppu * avg_pr
    
    # 필요 DAU = 연간 비용 / 365 / Daily ARPU
    required_daily_revenue = total_cost / days if total_cost > 0 else 0
    required_dau = int(required_daily_revenue / daily_arpu) if daily_arpu > 0 else 0
    
    debug_info["required_dau_for_bep"] = required_dau
    debug_info["current_avg_dau"] = int(avg_dau)
    debug_info["dau_gap_ratio"] = round(required_dau / max(1, avg_dau), 1)
    
    # numpy 타입을 Python native 타입으로 변환 (JSON 직렬화 오류 방지)
    result = {
        "status": "success",
        "input": {
            "launch_date": input_data.launch_date,
            "projection_days": days,
            "retention_games": input_data.retention.selected_games,
            "nru_games": input_data.nru.selected_games,
            "pr_games": input_data.revenue.selected_games_pr,
            "arppu_games": input_data.revenue.selected_games_arppu
        },
        "blending": {
            "weight_internal": base_weight,
            "weight_benchmark": 1 - base_weight,
            "time_decay": use_time_decay,
            "genre": genre,
            "platforms": platforms,
            "benchmark_only": use_benchmark_only,
            "benchmark_data": benchmark
        },
        "v7_settings": {
            "quality_score": quality_grade,
            "quality_multiplier": quality_multiplier,
            "bm_type": bm_type,
            "bm_modifier": bm_modifier,
            "regions": regions,
            "seasonality_applied": True
        },
        "v85_marketing": v85_marketing_analysis,  # V8.5: 마케팅 분석 추가
        # V14.1.0: Single Wave 신뢰도 언어 (피드백23 §1)
        "bm_adjustment": bm_modifier,
        "confidence": {
            "definition": "provenance, not probability",
            "evidence_state": {
                "d1": {"value": input_data.retention.target_d1_retention.get("normal"),
                       "badge": ("🔵 Sample" if input_data.retention.selected_games else "🔵 Benchmark"),
                       "source": ("selected retention samples" if input_data.retention.selected_games else "genre|platform internal benchmark")},
                "pr": {"badge": ("🔵 Sample" if input_data.revenue.selected_games_pr else "🔵 Benchmark"),
                       "source": ("selected PR samples" if input_data.revenue.selected_games_pr else "internal benchmark")},
                "arppu": {"badge": ("🔵 Sample" if input_data.revenue.selected_games_arppu else "🔵 Benchmark"),
                          "source": ("selected ARPPU samples" if input_data.revenue.selected_games_arppu else "internal benchmark")},
                "bm_modifier": {"value": bm_modifier["mult"], "badge": bm_modifier["badge"], "source": bm_modifier["warning"]},
                "nru": {"badge": "🟠 User input / budget-derived", "source": "UA budget ÷ CPA + organic + reservoir"},
            }},
        "mini_revenue_bridge": (lambda fd: {
            "label": "Revenue Driver Bridge (NRU → Retention → DAU → Monetization)",
            "rows": [
                {"driver": "Total NRU", "value": int(sum(fd["nru"]))},
                {"driver": "Retained User-Days", "value": int(sum(fd["dau"]))},
                {"driver": "Avg DAU", "value": int(np.mean(fd["dau"]))},
                {"driver": "Avg Daily Revenue", "value": round(float(np.mean(fd["revenue"])))},
                {"driver": "Gross Revenue", "value": round(float(sum(fd["revenue"])))},
            ]})(results["normal"]["full_data"]),
        "debug_info": debug_info,  # V12: Debug 정보 추가
        "summary": summary,
        "results": results
    }

    # ── V13.2 P3b: Provisional 80% Prediction Interval (residual store 기반) ──
    try:
        result["provisional_interval"] = build_provisional_interval(
            result["summary"]["normal"].get("total_gross_revenue")
            or result["summary"]["normal"].get("gross_revenue")
            or sum(results["normal"]["full_data"]["revenue"]))
    except Exception as _pe:
        result["provisional_interval"] = {"error": str(_pe)}

    # ── V13 P2.5/P3a: External Evidence + Metric-level Reliability Card ──
    # Evidence는 여기서만 계산되며 위 절대값 결과(results/summary)에 역주입되지 않는다 (Isolation).
    try:
        normal_dau_series = results["normal"]["full_data"]["dau"]
        normal_ret = results["normal"]["full_data"].get("retention", [])
        internal_tail = None
        if len(normal_ret) >= 28 and normal_ret[6] > 0:
            internal_tail = round(normal_ret[27] / normal_ret[6], 4)
        envelope = ext_ev.lifecycle_envelope_check(normal_dau_series, genre)
        _d1 = normal_ret[0] if len(normal_ret) >= 1 else None
        _d7 = normal_ret[6] if len(normal_ret) >= 7 else None
        _d28 = normal_ret[27] if len(normal_ret) >= 28 else None
        evidence = {
            "peer": ext_ev.peer_percentile_summary(genre, _d1, _d7, _d28),
            "tail_class": ext_ev.tail_class(genre, internal_tail),
            "lifecycle_envelope": envelope,
            "tam": ext_ev.tam_check(genre, summary.get("normal", {}).get("peak_dau", 0)),
        }
        result["external_evidence"] = evidence
        result["reliability_card"] = build_reliability_card(
            input_data, genre, platforms, benchmark, evidence)
    except Exception as _e:
        result["external_evidence"] = {"error": str(_e)}
        result["reliability_card"] = {"error": str(_e)}

    return sanitize_for_json(result)


def build_provisional_interval(p50_cumulative: float) -> Dict[str, Any]:
    """
    V13.2 P3b: Conformal 전 단계 — residual store(LOFO, launch)의 family-collapsed
    log-residual 분포로 Provisional 80% Prediction Interval 산출.
    Freeze 규칙: Pool A(observed)는 원본, Pool B(pseudo)는 policy inflation 2.0x [1.5,3.0].
    observed families < 5 → 명칭 'provisional' 고정, 통계적 P10/P90 아님을 명시.
    """
    store_path = os.path.join(DATA_DIR, "residual_store.json")
    if not os.path.exists(store_path):
        return {"available": False, "reason": "residual_store 없음 — /api/backtest/run-all 선행 필요"}
    store = json.load(open(store_path, encoding="utf-8"))
    infl = store.get("policy_prior_inflation", {}).get("pseudo_pool_factor", 2.0)
    fam_res = {}
    for e in store.get("entries", []):
        if e.get("category") not in ("launch", "pseudo_launch") or e.get("cumulative_error") is None:
            continue
        lr = float(np.log(1 + e["cumulative_error"]))
        if e.get("actual_pool") == "pseudo":
            lr *= infl  # policy inflation (log-scale 확대)
        fam_res.setdefault((e["game_family"], e["actual_pool"]), []).append(lr)
    fam_points = [float(np.median(v)) for v in fam_res.values()]
    if len(fam_points) < 5:
        return {"available": False, "reason": f"family residual {len(fam_points)}개 — 최소 5 필요"}
    q10, q90 = float(np.percentile(fam_points, 10)), float(np.percentile(fam_points, 90))
    # residual = log(pred/actual) → actual = pred / exp(residual)
    lo_mult, hi_mult = float(np.exp(-q90)), float(np.exp(-q10))
    obs_n = len({k for k in fam_res if k[1] == "observed"})
    return {
        "available": True,
        "label": "Provisional 80% Prediction Interval",
        "p50_cumulative": p50_cumulative,
        "interval_low": p50_cumulative * lo_mult if p50_cumulative else None,
        "interval_high": p50_cumulative * hi_mult if p50_cumulative else None,
        "multipliers": {"low": round(lo_mult, 3), "high": round(hi_mult, 3)},
        "basis": {"families": len(fam_points), "observed_families": obs_n,
                  "pseudo_inflation": infl, "method": "LOFO family-collapsed log-residual q10/q90"},
        "caveat": "observed family 부족 — 통계적 P10/P90 아님, Conformal 확정은 P3b 완료 후",
    }


def build_reliability_card(input_data, genre: str, platforms: List[str],
                            benchmark: Dict, evidence: Dict) -> Dict[str, Any]:
    """
    V13 P3a: Metric-level Reliability Card — 백엔드 계산 (AI는 해석만).
    등급 근거: 동일장르 내부 표본 수 / fallback_level / observed launch family 수.
    """
    raw = load_raw_data()
    dist = build_internal_benchmarks()

    GAME_FAMILY_V13 = {
        "메M(대만)": "mem", "메M(한국)": "mem", "AxE(대만)": "axe", "AxE(한국)": "axe", "AxE(일본)": "axe",
        "V4(한국)": "v4", "카이저(한국)": "kaiser", "트라하(한국)": "traha", "트라하(일본)": "traha",
        "라플라스M(앱애니)": "laplace", "MOE(한국)": "moe", "MOE(글로벌)": "moe", "MOE(일본대만)": "moe",
        "조조전(한국)": "jojo", "조조전(일본)": "jojo", "조조전(대만)": "jojo", "조조전(글로벌)": "jojo",
        "다크어벤져3(한국)": "da3", "다크어벤져3(글로벌)": "da3", "다크어벤져3(일본)": "da3",
        "오버히트(한국)": "overhit", "오버히트(일본)": "overhit", "오버히트(글로벌)": "overhit",
        "나이트워커(중국)": "nightwalker", "슈퍼피플(글로벌)": "superpeople",
        "PUBG (PC/B2P/2018)": "pubg_pc", "PUBG (PC/F2P/2022)": "pubg_pc",
        "PUBGM (KR+JP/Launch-2019)": "pubgm", "PUBGM (KR+JP/Stable-2022)": "pubgm",
        "DNDM (NA)": "dndm", "DNDM (SEA)": "dndm", "DNDM (SA)": "dndm",
        "inZOI": "inzoi", "Arena Breakout(글로벌-벤치마크)": "arena",
        "PUBG (Console/2017)": "pubg_console",
    }

    def same_genre_n(metric_key: str) -> int:
        """동일장르 표본을 family 단위로 카운트 (rows 아님 — Freeze 원칙)"""
        fams = set()
        for game, (g, _p) in GAME_META_V13.items():
            if g == genre and raw['games'].get(metric_key, {}).get(game):
                fams.add(GAME_FAMILY_V13.get(game, game))
        return len(fams)

    def grade_by_n(n: int, fallback: int) -> str:
        if fallback >= 2:
            return "D"
        if n >= 4: return "B"
        if n == 3: return "B-"
        if n == 2: return "C+"
        if n == 1: return "C"
        return "D"

    fb = benchmark.get("fallback_level", 0) if isinstance(benchmark, dict) else 0
    ret_n = same_genre_n('retention')
    pr_n = same_genre_n('payment_rate')
    nru_n = same_genre_n('nru')

    # Calibration 카운트 (Freeze 사양: rows/families 병기)
    actuals = raw.get('actuals', {})
    LAUNCH_FAMS = {"dndm", "inzoi", "pubg_console"}
    fam_of = {"DNDM (NA)": "dndm", "DNDM (SEA)": "dndm", "DNDM (SA)": "dndm", "inZOI": "inzoi",
              "PUBG (PC/B2P/2018)": "pubg_pc", "PUBG (PC/F2P/2022)": "pubg_pc",
              "PUBGM (KR+JP/Launch-2019)": "pubgm", "PUBGM (KR+JP/Stable-2022)": "pubgm",
              "PUBG (Console/2017)": "pubg_console"}
    obs_fams = {fam_of.get(g) for g in actuals if fam_of.get(g)}
    obs_launch = len(obs_fams & LAUNCH_FAMS)
    peer_n = evidence.get("peer", {}).get("sample_n", 0)

    env_warns = evidence.get("lifecycle_envelope", {}).get("warnings", [])
    warnings = list(env_warns)
    if ret_n == 0:
        warnings.append(f"'{genre}' 동일장르 내부 리텐션 표본 0개 — L{fb} fallback 사용 중")
    if obs_launch < 3:
        warnings.append(f"Observed launch family {obs_launch}개 — 예측구간은 provisional")
    warnings.append("Multi-mode incremental synergy = hypothesis-only (P50 중립)")

    lifecycle_grade = "B" if evidence.get("lifecycle_envelope", {}).get("applicable") else "C"

    # V13.1: 실제 validator 호출 (하드코딩 제거)
    schema_status = "PASS"
    try:
        for _mk, _c in contracts.INTERNAL_CONTRACTS.items():
            contracts.validate_contract(_c, strict=True)
    except Exception as _ve:
        schema_status = f"FAIL ({_ve})"
    _arppu_c = contracts.INTERNAL_CONTRACTS.get("arppu", {})
    unit_status = ("PASS (arppu=daily/KRW canonical)"
                   if _arppu_c.get("unit") == "daily" and _arppu_c.get("currency") == "KRW"
                   else "FAIL (unit contract 위반)")

    return {
        "schema_contract": schema_status,
        "unit_contract": unit_status,
        "metrics": {
            "acquisition": grade_by_n(nru_n, fb),
            "absolute_retention": grade_by_n(ret_n, fb),
            "lifecycle_shape": lifecycle_grade,
            "monetization": grade_by_n(pr_n, fb),
            "financial_bep": grade_by_n(min(pr_n, ret_n), fb),
            "multimode_synergy": "D",
        },
        "calibration": {
            "observed_launch_families": obs_launch,
            "observed_rows": len(actuals),
            "pseudo_families": len(set(GAME_FAMILY_MAP_V13.values()) - obs_fams),
            "external_peers": peer_n,
            "benchmark_source": benchmark.get("source", "internal_pool_ab") if isinstance(benchmark, dict) else "internal_pool_ab",
            "benchmark_fallback_level": fb,
            "fallback_levels": benchmark.get("fallback_levels", {}) if isinstance(benchmark, dict) else {},
            "benchmark_n_games": benchmark.get("n_games", 0) if isinstance(benchmark, dict) else 0,
        },
        "external_evidence_methods": {
            "retention": "Relative Only",
            "lifecycle": "Shape Only (warning)",
            "multimode_lift": "Not Calibrated",
        },
        "warnings": warnings,
    }

# V9.8: Mock AI Report Generator (Fallback용)
def generate_mock_ai_report(summary: Dict[str, Any], analysis_type: str) -> str:
    """API 실패 시 사용할 Mock 보고서 생성"""
    genre = summary.get('blending', {}).get('genre', 'N/A')
    platforms = ', '.join(summary.get('blending', {}).get('platforms', ['PC']))
    normal_revenue = summary.get('normal', {}).get('gross_revenue', 0)
    bep_day = summary.get('bep_day', -1)
    
    bep_status = f"D+{bep_day}에 BEP 달성 예상" if bep_day > 0 else "1년 내 BEP 미달성 위험"
    
    if analysis_type == "executive_report":
        return f"""[종합 분석 요약]
{genre} 장르의 {platforms} 플랫폼 프로젝트입니다. 
Normal 시나리오 기준 총 매출 {normal_revenue:,.0f}원이 예상됩니다.
{bep_status}입니다.

[핵심 지표 평가]
1. 매출 전망: Normal 시나리오 기준 적정 수준
2. 리텐션: 장르 평균 대비 검토 필요
3. 마케팅 효율: CPA/CPI 최적화 여지 존재

[리스크 분석]
1. 시장 경쟁: 동일 장르 출시작 모니터링 필요
2. 유저 확보: 런칭 초기 집중 마케팅 권장
3. 수익화: BM 모델 최적화 검토

[전략 제언]
1. 런칭 전 사전 마케팅으로 위시리스트 확보
2. D1 리텐션 확보를 위한 온보딩 최적화
3. 라이브 서비스 준비로 장기 운영 대비

* 이 보고서는 AI 연결 실패로 인한 기본 분석입니다."""
    else:
        return f"[{analysis_type}] {genre} 프로젝트 분석 결과입니다. 상세 AI 분석을 위해 API 연결을 확인해주세요."

# AI Insight Endpoint
@app.post("/api/ai/insight")
async def get_ai_insight_endpoint(request: AIInsightRequest):
    """Get AI-powered insights for projection results with Mock Fallback"""
    prompt = create_insight_prompt(request.projection_summary, request.analysis_type)
    insight, error_msg = await get_ai_insight(prompt)
    
    # V9.8: Mock Fallback
    if insight is None:
        print(f"⚠️ AI API failed ({error_msg}). Using Mock Report.")
        insight = generate_mock_ai_report(request.projection_summary, request.analysis_type)
        ai_model = "mock-fallback"
        # Mock 사용 시 에러 메시지도 함께 전달
        return {
            "status": "fallback",
            "analysis_type": request.analysis_type,
            "insight": f"[⚠️ AI 서버 연결 실패 - Mock 데이터 사용]\n(원인: {error_msg})\n\n{insight}",
            "ai_model": ai_model,
            "error": error_msg
        }
    else:
        ai_model = CURRENT_MODEL
    
    return {
        "status": "success",
        "analysis_type": request.analysis_type,
        "insight": insight,
        "ai_model": ai_model
    }

@app.get("/api/ai/status")
async def get_ai_status():
    """Check AI integration status"""
    api_key_set = bool(OPENAI_API_KEY)
    api_key_preview = f"{OPENAI_API_KEY[:8]}...{OPENAI_API_KEY[-4:]}" if OPENAI_API_KEY and len(OPENAI_API_KEY) > 12 else "not set"
    
    return {
        "enabled": api_key_set,
        "model": CURRENT_MODEL,
        "api_key_preview": api_key_preview,
        "available_types": ["executive_report", "general", "reliability", "retention", "revenue", "risk", "competitive"],
        "fallback_mode": not api_key_set,
        "message": "AI 연동 활성화됨" if api_key_set else "API 키 미설정 - Mock 모드로 작동"
    }

@app.get("/api/raw-data")
async def get_raw_data():
    return load_raw_data()

@app.get("/api/raw-data/download")
async def download_raw_data_excel():
    """Download raw game data as Excel file (same format as original)"""
    import io
    from openpyxl import Workbook
    from openpyxl.styles import Font, PatternFill, Border, Side, Alignment
    from fastapi.responses import StreamingResponse
    
    raw_data = load_raw_data()
    wb = Workbook()
    
    # 스타일 정의
    header_fill = PatternFill(start_color="4472C4", end_color="4472C4", fill_type="solid")
    header_font = Font(color="FFFFFF", bold=True)
    thin_border = Border(
        left=Side(style='thin'),
        right=Side(style='thin'),
        top=Side(style='thin'),
        bottom=Side(style='thin')
    )
    
    def create_raw_sheet(ws, sheet_title, metric_name, description, data_dict):
        """Raw 데이터 시트 생성 (원본 엑셀 형식)"""
        # V12.3.2: Row 1 안내 문구 삭제 (불필요)
        
        # Row 2: 메트릭명 및 설명
        ws['B2'] = metric_name
        ws['B2'].font = Font(bold=True)
        ws['C2'] = description
        
        # Row 3: 헤더 (게임명, 1, 2, 3, ... 365)
        ws['B3'] = '게임명'
        ws['B3'].fill = header_fill
        ws['B3'].font = header_font
        ws['B3'].border = thin_border
        
        max_days = 90 if metric_name == '리텐션' else 365
        for day in range(1, max_days + 1):
            col = day + 2  # C부터 시작
            cell = ws.cell(row=3, column=col, value=day)
            cell.fill = header_fill
            cell.font = header_font
            cell.border = thin_border
        
        # Row 4+: 게임 데이터
        row_idx = 4
        for game_name, values in data_dict.items():
            # V12.3.2: 게임명 익명화 적용
            anonymized_name = get_anonymized_game_name(game_name)
            ws.cell(row=row_idx, column=2, value=anonymized_name).border = thin_border
            for i, val in enumerate(values[:max_days]):
                cell = ws.cell(row=row_idx, column=i + 3, value=val)
                cell.border = thin_border
                if metric_name in ['리텐션', 'PR']:
                    cell.number_format = '0.00%'
            row_idx += 1
        
        # 열 너비 조정
        ws.column_dimensions['B'].width = 20
        for col in range(3, max_days + 3):
            ws.column_dimensions[ws.cell(row=3, column=col).column_letter].width = 8
    
    # Raw_Retention 시트
    ws_retention = wb.active
    ws_retention.title = "Raw_Retention"
    create_raw_sheet(ws_retention, "1. Retention", "리텐션", "론칭 ~ 90일까지의 리텐션 정보 입력", raw_data['games'].get('retention', {}))
    
    # Raw_NRU 시트
    ws_nru = wb.create_sheet("Raw_NRU")
    create_raw_sheet(ws_nru, "2. NRU", "NRU", "론칭 ~ 365일까지의 데이터 입력", raw_data['games'].get('nru', {}))
    
    # Raw_PR 시트
    ws_pr = wb.create_sheet("Raw_PR")
    create_raw_sheet(ws_pr, "3. Revenue", "PR", "론칭 ~ 365일까지의 데이터 입력", raw_data['games'].get('payment_rate', {}))
    
    # Raw_ARPPU 시트
    ws_arppu = wb.create_sheet("Raw_ARPPU")
    create_raw_sheet(ws_arppu, "3. Revenue", "ARPPU", "론칭 ~ 365일까지의 데이터 입력", raw_data['games'].get('arppu', {}))
    
    # 메모리에 저장
    output = io.BytesIO()
    wb.save(output)
    output.seek(0)
    
    return StreamingResponse(
        output,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": "attachment; filename=raw_game_data.xlsx"}
    )

@app.post("/api/raw-data/upload")
async def upload_game_data(file: UploadFile = File(...), metric: str = "retention"):
    if not file.filename.endswith('.csv'):
        raise HTTPException(status_code=400, detail="Only CSV files are supported")
    
    import pandas as pd
    from io import StringIO
    
    content = await file.read()
    df = pd.read_csv(StringIO(content.decode('utf-8')))
    
    raw_data = load_raw_data()
    
    for _, row in df.iterrows():
        game_name = row.iloc[0]
        values = row.iloc[1:].tolist()
        values = [float(v) for v in values if pd.notna(v)]
        
        if metric in raw_data['games']:
            raw_data['games'][metric][game_name] = values
    
    raw_data['metadata'][f'{metric}_games'] = list(raw_data['games'][metric].keys())
    
    with open(RAW_DATA_PATH, 'w', encoding='utf-8') as f:
        json.dump(raw_data, f, ensure_ascii=False, indent=2)
    
    # V13.1 P0: 업로드 데이터 계약 경고 (검증 미적용 우회 방지)
    _contract_warning = ("업로드 데이터에 metric contract 자동검증이 아직 적용되지 않습니다. "
                         "ARPPU는 daily/KRW, 리텐션은 new_install_cohort 정의를 준수해야 하며 "
                         "위반 시 V13 재소싱 벤치마크가 오염됩니다.")
    return { "contract_warning": _contract_warning,"status": "success", "message": f"Added/updated games in {metric}"}

# ============================================================
# V12.5: Backtesting (Leave-One-Out 검증)
# ============================================================
class BacktestInput(BaseModel):
    target_game: str
    projection_input: ProjectionInput
    auto_calibrate: Optional[bool] = False  # True: 실측 D1 NRU/리텐션을 입력으로 사용 → 순수 모델 오차 측정
    # V12.5.1: 오차 보정 옵션
    initial_dau: Optional[int] = None              # 운영중기 게임: 기존 유저베이스 (None=실측에서 자동산출)
    region_monetization_factor: Optional[float] = 1.0  # 리전 과금력 배수 (표본 대비)
    b2p_mode: Optional[bool] = False               # B2P: Revenue = NRU × package_price
    package_price_net_krw: Optional[float] = 0     # B2P 순단가 (원화)

def _fit_extend_retention(ret_data: List[float], days: int = 365) -> List[float]:
    """실측 리텐션(90일)을 Power Law로 피팅해 365일로 확장"""
    a, b = fit_retention_curve(ret_data)
    curve = list(ret_data[:days])
    for d in range(len(curve) + 1, days + 1):
        curve.append(max(0.0001, retention_curve(d, a, b)))
    return curve[:days]

def _mape(pred: List[float], actual: List[float]) -> Optional[float]:
    """MAPE 계산 (actual=0 구간 제외)"""
    pairs = [(p, a) for p, a in zip(pred, actual) if a > 0]
    if not pairs:
        return None
    return float(np.mean([abs(p - a) / a for p, a in pairs]))

@app.post("/api/backtest")
async def run_backtest(bt: BacktestInput):
    """
    Leave-One-Out 백테스트:
    1. 대상 게임을 표본에서 제외하고 예측 실행
    2. 대상 게임의 실측 데이터로 actual 시리즈 재구성
    3. 구간별 MAPE / 누적오차 / Peak DAU / Band Coverage 산출
    """
    raw_data = load_raw_data()
    target = bt.target_game

    # 1. 실측 데이터 존재 검증
    actual_nru = raw_data['games']['nru'].get(target)
    actual_ret = raw_data['games']['retention'].get(target)
    if not actual_nru or not actual_ret:
        raise HTTPException(status_code=400, detail=f"'{target}'의 실측 NRU/Retention 데이터가 없습니다.")
    actual_pr_data = raw_data['games']['payment_rate'].get(target)
    actual_arppu_data = raw_data['games']['arppu'].get(target)

    # 2. Leave-One-Out: 입력에서 대상 게임 강제 제외
    pin = bt.projection_input.model_copy(deep=True)
    pin.retention.selected_games = [g for g in pin.retention.selected_games if g != target]
    pin.nru.selected_games = [g for g in pin.nru.selected_games if g != target]
    pin.revenue.selected_games_pr = [g for g in pin.revenue.selected_games_pr if g != target]
    pin.revenue.selected_games_arppu = [g for g in pin.revenue.selected_games_arppu if g != target]

    # 2.5 Auto-Calibrate: 실측 초기값을 입력으로 사용 (입력추정오차 제거 → 순수 모델오차 측정)
    if bt.auto_calibrate:
        actual_d1_nru = int(actual_nru[0]) if actual_nru else 10000
        actual_d1_ret = float(actual_ret[0]) if actual_ret else 0.4
        pin.nru.d1_nru = {
            "best": int(actual_d1_nru * 1.1),
            "normal": actual_d1_nru,
            "worst": int(actual_d1_nru * 0.9),
        }
        pin.retention.target_d1_retention = {
            "best": min(0.95, actual_d1_ret * 1.1),
            "normal": actual_d1_ret,
            "worst": actual_d1_ret * 0.9,
        }
        # 예산 기반 NRU 자동산출 비활성화 (실측 D1 NRU 직접 사용)
        pin.nru.ua_budget = 0
        pin.nru.brand_budget = 0

    # 3. 예측 실행 — V13.1: 내부 벤치마크에서도 target family 제외 (LOFO 무누수)
    pin.exclude_family = GAME_FAMILY_MAP_V13.get(target, target)
    prediction = await calculate_projection(pin)

    # 4. Actual 시리즈 구성 — 실측 DAU/Revenue가 있으면 우선 사용 (V12.5 actuals)
    actuals_store = raw_data.get('actuals', {})
    real_actual = actuals_store.get(target)

    if real_actual and real_actual.get('dau'):
        # 실측 시리즈 직접 사용 (가장 정확)
        actual_dau = [int(v) for v in real_actual['dau'][:365]]
        n_days = len(actual_dau)
        actual_nru_series = [int(v) for v in actual_nru[:n_days]]
        actual_revenue = [float(v) for v in real_actual.get('revenue_krw', [])[:n_days]]
        has_revenue = bool(actual_revenue) and sum(actual_revenue) > 0
        actual_source = "measured"
    else:
        # 폴백: 코호트 매트릭스 재구성 (GROUP A 등 DAU 시리즈 미보유 게임)
        n_days = min(len(actual_nru), 365)
        actual_ret_curve = _fit_extend_retention(actual_ret, 365)
        actual_nru_series = [int(v) for v in actual_nru[:n_days]]
        actual_dau = calculate_dau_matrix(actual_nru_series, actual_ret_curve, n_days)
        actual_revenue = []
        has_revenue = bool(actual_pr_data and actual_arppu_data)
        if has_revenue:
            for d in range(n_days):
                pr_v = actual_pr_data[d] if d < len(actual_pr_data) else (actual_pr_data[-1] if actual_pr_data else 0)
                ar_v = actual_arppu_data[d] if d < len(actual_arppu_data) else (actual_arppu_data[-1] if actual_arppu_data else 0)
                actual_revenue.append(actual_dau[d] * pr_v * ar_v)
        actual_source = "reconstructed"

    # 5. 예측 시리즈 추출 + V12.5.1 보정 적용
    pred = {s: {k: list(prediction["results"][s]["full_data"][k]) for k in ["revenue", "dau", "nru"]}
            for s in ["best", "normal", "worst"]}

    # 5.1 운영중기 보정: 기존 유저베이스(initial_dau)를 베테랑 감쇠로 추가
    #     자동산출: 실측 D1 DAU - D1 NRU (진짜 런칭게임은 자동으로 ≈0)
    initial_dau = bt.initial_dau
    if initial_dau is None and real_actual and real_actual.get('dau'):
        initial_dau = max(0, int(real_actual['dau'][0]) - int(actual_nru[0]))
    initial_dau = initial_dau or 0

    # 운영중기 판정: 기존베이스가 D1 NRU의 3배 이상이면 운영중기 슬라이스
    is_midlife = initial_dau > 3 * max(1, int(actual_nru[0]))
    veteran_b = VETERAN_DECAY_B
    calibration_window = 0
    if is_midlife and real_actual and len(real_actual.get('dau', [])) >= 30:
        # 시계열 표준기법: 첫 30일(train)로 감쇠율 피팅 → D31+(test)로 평가
        d0 = float(real_actual['dau'][0])
        d29 = float(real_actual['dau'][29])
        if d0 > 0 and d29 > 0:
            ratio = d29 / d0
            import math as _math
            veteran_b = _math.log(max(0.3, min(1.5, ratio))) / _math.log(395.0 / 365.0)
            veteran_b = max(-8.0, min(0.5, veteran_b))
            calibration_window = 30

    if initial_dau > 0:
        for s in ["best", "normal", "worst"]:
            for d in range(min(365, len(pred[s]["dau"]))):
                veteran = initial_dau * (((365 + d) / 365) ** veteran_b)
                base_dau = pred[s]["dau"][d]
                arpdau = (pred[s]["revenue"][d] / base_dau) if base_dau > 0 else 0
                pred[s]["dau"][d] = base_dau + veteran
                pred[s]["revenue"][d] = pred[s]["revenue"][d] + veteran * arpdau

    # 5.2 B2P 모드: Revenue = NRU × 순단가 (F2P 공식 대체)
    if bt.b2p_mode and bt.package_price_net_krw and bt.package_price_net_krw > 0:
        for s in ["best", "normal", "worst"]:
            pred[s]["revenue"] = [nru_v * bt.package_price_net_krw for nru_v in pred[s]["nru"]]

    # 5.3 리전 과금력 보정
    rf = bt.region_monetization_factor or 1.0
    if rf != 1.0:
        for s in ["best", "normal", "worst"]:
            pred[s]["revenue"] = [v * rf for v in pred[s]["revenue"]]

    pred_rev_normal = pred["normal"]["revenue"][:n_days]
    pred_dau_normal = pred["normal"]["dau"][:n_days]

    # 6. 메트릭 계산
    periods = {"d1_30": (0, 30), "d31_90": (30, 90), "d91_180": (90, 180), "d181_365": (180, 365)}
    mape_by_period = {}
    for label, (s, e) in periods.items():
        e2 = min(e, n_days)
        if s >= n_days:
            mape_by_period[label] = None
            continue
        if has_revenue:
            mape_by_period[label] = _mape(pred_rev_normal[s:e2], actual_revenue[s:e2])
        else:
            mape_by_period[label] = _mape(pred_dau_normal[s:e2], [float(v) for v in actual_dau[s:e2]])

    cumulative_error = None
    if has_revenue and sum(actual_revenue) > 0:
        cumulative_error = (sum(pred_rev_normal) - sum(actual_revenue)) / sum(actual_revenue)

    # V13 P2: horizon별 누적 log-residual (D30/90/180/365, 관측 없으면 null — 생존편향 방지)
    horizon_residuals = {}
    for hz in [30, 90, 180, 365]:
        if has_revenue and n_days >= hz:
            a_cum = sum(actual_revenue[:hz]); p_cum = sum(pred_rev_normal[:hz])
            horizon_residuals[f"D{hz}"] = round(float(np.log(max(p_cum, 1) / max(a_cum, 1))), 4) if a_cum > 0 else None
        else:
            horizon_residuals[f"D{hz}"] = None

    # Peak DAU 오차
    actual_peak = max(actual_dau) if actual_dau else 0
    actual_peak_day = actual_dau.index(actual_peak) + 1 if actual_dau else 0
    pred_peak = max(pred_dau_normal) if pred_dau_normal else 0
    pred_peak_day = pred_dau_normal.index(pred_peak) + 1 if pred_dau_normal else 0
    peak_dau_error = {
        "size_error": (pred_peak - actual_peak) / actual_peak if actual_peak > 0 else None,
        "timing_error_days": pred_peak_day - actual_peak_day,
        "actual_peak": int(actual_peak), "predicted_peak": int(pred_peak),
    }

    # Band Coverage: 실측이 Worst~Best 밴드 안에 들어온 비율
    target_series_actual = actual_revenue if has_revenue else [float(v) for v in actual_dau]
    target_key = "revenue" if has_revenue else "dau"
    band_hits = 0
    band_total = 0
    for d in range(n_days):
        a = target_series_actual[d]
        if a <= 0:
            continue
        lo = min(pred["worst"][target_key][d], pred["best"][target_key][d])
        hi = max(pred["worst"][target_key][d], pred["best"][target_key][d])
        band_total += 1
        if lo <= a <= hi:
            band_hits += 1
    band_coverage = band_hits / band_total if band_total > 0 else None

    # 종합 등급
    def grade(mape30, coverage):
        score = 0
        if mape30 is not None:
            score += max(0, 50 - mape30 * 100)  # MAPE 0%=50점, 50%=0점
        if coverage is not None:
            score += coverage * 50               # 커버리지 100%=50점
        if score >= 85: return "A"
        if score >= 70: return "B"
        if score >= 55: return "C"
        if score >= 40: return "D"
        return "F"

    return sanitize_for_json({
        "status": "success",
        "target_game": target,
        "target_game_display": get_anonymized_game_name(target),
        "actual_days_available": n_days,
        "has_revenue_actual": has_revenue,
        "actual_source": actual_source,
        "adjustments": {
            "initial_dau_applied": initial_dau,
            "is_midlife_slice": is_midlife,
            "veteran_decay_b": round(veteran_b, 3),
            "calibration_window_days": calibration_window,
            "region_monetization_factor": rf,
            "b2p_mode": bool(bt.b2p_mode),
        },
        "prediction_bands": {
            "best": {k: pred["best"][k][:n_days] for k in ["revenue", "dau", "nru"]},
            "normal": {k: pred["normal"][k][:n_days] for k in ["revenue", "dau", "nru"]},
            "worst": {k: pred["worst"][k][:n_days] for k in ["revenue", "dau", "nru"]},
        },
        "actual": {
            "revenue": actual_revenue if has_revenue else None,
            "dau": actual_dau,
            "nru": actual_nru_series,
        },
        "metrics": {
            "mape_by_period": mape_by_period,
            "cumulative_revenue_error": cumulative_error,
            "peak_dau_error": peak_dau_error,
            "band_coverage": band_coverage,
            "horizon_residuals": horizon_residuals,
            "metric_basis": "revenue" if has_revenue else "dau",
        },
        "grade": grade(mape_by_period.get("d1_30"), band_coverage),
    })

@app.get("/api/backtest/available-games")
async def get_backtest_games():
    """백테스트 가능한 게임 목록 (NRU+Retention 실측 보유)"""
    raw_data = load_raw_data()
    games = []
    for g in raw_data['games']['nru'].keys():
        if g in raw_data['games']['retention']:
            games.append({
                "id": g,
                "display": get_anonymized_game_name(g),
                "has_revenue": g in raw_data['games']['payment_rate'] and g in raw_data['games']['arppu'],
                "has_measured_actuals": g in raw_data.get('actuals', {}),
                "days": len(raw_data['games']['nru'][g]),
            })
    return {"games": games}

# 게임별 기본 메타 (일괄 백테스트용)
# region_monetization_factor: 참조표본 대비 해당 리전의 과금력 배수 (내부 DNDM 실측: SEA=NA×0.12, SA=NA×0.07)
# b2p + package_price_net_krw: B2P 게임은 Revenue = NRU × 순단가로 예측
BACKTEST_GAME_META = {
    "DNDM (NA)": {"genre": "Extraction Shooter", "platforms": ["Mobile"], "launch": "2025-02-05", "category": "launch"},
    "DNDM (SEA)": {"genre": "Extraction Shooter", "platforms": ["Mobile"], "launch": "2025-06-11",
                   "region_monetization_factor": 0.12, "category": "launch"},
    "DNDM (SA)": {"genre": "Extraction Shooter", "platforms": ["Mobile"], "launch": "2025-06-11",
                  "region_monetization_factor": 0.07, "category": "launch"},
    "PUBG (PC/B2P/2018)": {"genre": "Battle Royale", "platforms": ["PC"], "launch": "2018-01-11", "category": "live_slice"},
    "PUBG (PC/F2P/2022)": {"genre": "Battle Royale", "platforms": ["PC"], "launch": "2022-01-12", "category": "live_slice"},
    "PUBGM (KR+JP/Launch-2019)": {"genre": "Battle Royale", "platforms": ["Mobile"], "launch": "2019-10-01", "category": "live_slice"},
    "PUBGM (KR+JP/Stable-2022)": {"genre": "Battle Royale", "platforms": ["Mobile"], "launch": "2022-02-14", "category": "live_slice"},
    "inZOI": {"genre": "Simulation", "platforms": ["PC"], "launch": "2025-03-28",
              "b2p": True, "package_price_net_krw": 32270, "category": "launch"},
    "PUBG (Console/2017)": {"genre": "Battle Royale", "platforms": ["Console"], "launch": "2017-12-12",
              "b2p": True, "package_price_net_krw": 22970, "category": "launch"},
}

# 운영중기 기존 유저베이스 감쇠율: 베테랑 코호트(가입 1년+ 가정)의 Power Law 연장
VETERAN_DECAY_B = -0.25  # (365+d)/365 ^ b → 연간 약 -16% 자연감소

# 전체 게임 장르 맵 (유사 표본 자동 선택용)
GAME_GENRE_MAP = {
    "메M(대만)": "MMORPG", "메M(한국)": "MMORPG", "AxE(대만)": "MMORPG", "AxE(한국)": "MMORPG",
    "AxE(일본)": "MMORPG", "V4(한국)": "MMORPG", "카이저(한국)": "MMORPG",
    "트라하(한국)": "MMORPG", "트라하(일본)": "MMORPG", "라플라스M(앱애니)": "MMORPG",
    "MOE(한국)": "SRPG", "MOE(글로벌)": "SRPG", "MOE(일본대만)": "SRPG",
    "조조전(한국)": "SRPG", "조조전(일본)": "SRPG", "조조전(대만)": "SRPG", "조조전(글로벌)": "SRPG",
    "다크어벤져3(한국)": "Action RPG", "다크어벤져3(글로벌)": "Action RPG", "다크어벤져3(일본)": "Action RPG",
    "오버히트(한국)": "Collector RPG", "오버히트(일본)": "Collector RPG", "오버히트(글로벌)": "Collector RPG",
    "나이트워커(중국)": "Action RPG",
    "슈퍼피플(글로벌)": "Battle Royale",
    "PUBG (PC/B2P/2018)": "Battle Royale", "PUBG (PC/F2P/2022)": "Battle Royale",
    "PUBGM (KR+JP/Launch-2019)": "Battle Royale", "PUBGM (KR+JP/Stable-2022)": "Battle Royale",
    "DNDM (NA)": "Extraction Shooter", "DNDM (SEA)": "Extraction Shooter", "DNDM (SA)": "Extraction Shooter",
    "inZOI": "Simulation",
    "Arena Breakout(글로벌-벤치마크)": "Extraction Shooter",
}

def _select_similar_games(target: str, genre: str, raw_data: dict, max_n: int = 5) -> List[str]:
    """동일 장르 우선 → 부족하면 유사 장르 → 그래도 부족하면 전체에서 보충"""
    GENRE_NEIGHBORS = {
        "Extraction Shooter": ["Battle Royale", "FPS"],
        "Battle Royale": ["Extraction Shooter", "FPS"],
        "Simulation": ["Casual", "Strategy"],
        "MMORPG": ["Action RPG"],
        "Action RPG": ["MMORPG"],
        "SRPG": ["Collector RPG", "Strategy"],
        "Collector RPG": ["SRPG"],
    }
    # V13 P2: LOFO — 대상 game family 전체를 표본에서 제외 (headline 기준)
    GAME_FAMILY = {
        "메M(대만)": "mem", "메M(한국)": "mem", "AxE(대만)": "axe", "AxE(한국)": "axe", "AxE(일본)": "axe",
        "V4(한국)": "v4", "카이저(한국)": "kaiser", "트라하(한국)": "traha", "트라하(일본)": "traha",
        "라플라스M(앱애니)": "laplace", "MOE(한국)": "moe", "MOE(글로벌)": "moe", "MOE(일본대만)": "moe",
        "조조전(한국)": "jojo", "조조전(일본)": "jojo", "조조전(대만)": "jojo", "조조전(글로벌)": "jojo",
        "다크어벤져3(한국)": "da3", "다크어벤져3(글로벌)": "da3", "다크어벤져3(일본)": "da3",
        "오버히트(한국)": "overhit", "오버히트(일본)": "overhit", "오버히트(글로벌)": "overhit",
        "나이트워커(중국)": "nightwalker", "슈퍼피플(글로벌)": "superpeople",
        "PUBG (PC/B2P/2018)": "pubg_pc", "PUBG (PC/F2P/2022)": "pubg_pc",
        "PUBGM (KR+JP/Launch-2019)": "pubgm", "PUBGM (KR+JP/Stable-2022)": "pubgm",
        "DNDM (NA)": "dndm", "DNDM (SEA)": "dndm", "DNDM (SA)": "dndm",
        "inZOI": "inzoi", "Arena Breakout(글로벌-벤치마크)": "arena",
        "PUBG (Console/2017)": "pubg_console",
    }
    target_family = GAME_FAMILY.get(target, target)
    valid = [g for g in raw_data['games']['nru'].keys()
             if GAME_FAMILY.get(g, g) != target_family and g in raw_data['games']['retention']]
    same = [g for g in valid if GAME_GENRE_MAP.get(g) == genre]
    if len(same) >= max_n:
        return same[:max_n]
    neighbors = GENRE_NEIGHBORS.get(genre, [])
    near = [g for g in valid if GAME_GENRE_MAP.get(g) in neighbors and g not in same]
    pool = same + near
    if len(pool) >= 2:
        return pool[:max_n]
    rest = [g for g in valid if g not in pool]
    return (pool + rest)[:max_n]

@app.post("/api/backtest/run-all")
async def run_all_backtests():
    """
    실측 actuals 보유 게임 전체 일괄 백테스트 (auto_calibrate 모드)
    → 툴 전체 신뢰성 리포트 생성
    """
    raw_data = load_raw_data()
    actuals_games = list(raw_data.get('actuals', {}).keys())
    all_games = list(raw_data['games']['nru'].keys())

    # V13.1 P2: Pool B (pseudo) 대상 = actuals 없는 게임 (재구성 actual로 LOFO)
    pseudo_targets = [g for g in all_games
                      if g not in actuals_games and g in raw_data['games']['retention']
                      and g in raw_data['games']['payment_rate']]

    reports = []
    for target in actuals_games + pseudo_targets:
        _is_pseudo = target not in actuals_games
        _g, _p = GAME_META_V13.get(target, ("Default", "Mobile"))
        meta = BACKTEST_GAME_META.get(target,
            {"genre": _g, "platforms": [_p], "launch": "2024-01-01",
             "category": "launch" if _is_pseudo else "launch"})
        # 동일 장르 표본 자동 선택 (대상 제외)
        similar = _select_similar_games(target, meta["genre"], raw_data, max_n=5)
        try:
            bt = BacktestInput(
                target_game=target,
                auto_calibrate=True,
                region_monetization_factor=meta.get("region_monetization_factor", 1.0),
                b2p_mode=meta.get("b2p", False),
                package_price_net_krw=meta.get("package_price_net_krw", 0),
                projection_input=ProjectionInput(
                    launch_date=meta["launch"], projection_days=365,
                    retention=RetentionInput(selected_games=similar),
                    nru=NRUInput(selected_games=similar, d1_nru={"best": 0, "normal": 0, "worst": 0}),
                    revenue=RevenueInput(selected_games_pr=similar, selected_games_arppu=similar),
                    blending={"weight": 0.7, "genre": meta["genre"], "platforms": meta["platforms"], "time_decay": True},
                    quality_score="B", bm_type="Midcore", regions=["global"],
                    advanced={"arppu_unit": "daily", "liveops_intensity": "Medium",
                              "two_stage_retention": True, "seasonality_regions": ["global"]},
                ),
            )
            r = await run_backtest(bt)
            # V12.5.1: 등급 = 누적오차 기준 (일별 MAPE는 노이즈가 커서 보조지표)
            ce_abs = abs(r["metrics"]["cumulative_revenue_error"]) if r["metrics"]["cumulative_revenue_error"] is not None else None
            if ce_abs is not None:
                grade = "A" if ce_abs <= 0.15 else "B" if ce_abs <= 0.30 else "C" if ce_abs <= 0.50 else "D" if ce_abs <= 0.80 else "F"
            else:
                grade = r["grade"]
            reports.append({
                "game": target, "display": r["target_game_display"], "grade": grade,
                "category": "pseudo_launch" if _is_pseudo else meta.get("category", "launch"),
                "game_family": GAME_FAMILY_MAP_V13.get(target, target),
                "mape_d1_30": r["metrics"]["mape_by_period"].get("d1_30"),
                "cumulative_error": r["metrics"]["cumulative_revenue_error"],
                "band_coverage": r["metrics"]["band_coverage"],
                "horizon_residuals": r["metrics"].get("horizon_residuals", {}),
                "actual_pool": "pseudo" if _is_pseudo else "observed",
                "region_factor_source": ("posthoc_target_derived_LEAKAGE_FLAG"
                    if meta.get("region_monetization_factor", 1.0) != 1.0 else "none"),
                "days": r["actual_days_available"],
            })
        except Exception as e:
            reports.append({"game": target, "error": str(e)})

    # 종합 통계 — 카테고리 분리 (launch = 툴 본래 목적 / live_slice = 실험적)
    def _cat_summary(cat):
        sub = [r for r in reports if "error" not in r and r.get("category") == cat]
        valid_ce = [abs(r["cumulative_error"]) for r in sub if r.get("cumulative_error") is not None]
        valid_cov = [r["band_coverage"] for r in sub if r.get("band_coverage") is not None]
        return {
            "games": len(sub),
            "avg_abs_cumulative_error": float(np.mean(valid_ce)) if valid_ce else None,
            "avg_band_coverage": float(np.mean(valid_cov)) if valid_cov else None,
        }

    valid = [r for r in reports if "error" not in r and r.get("mape_d1_30") is not None]
    summary = {
        "games_tested": len(reports),
        "launch_reliability": _cat_summary("launch"),       # ← 헤드라인 지표 (사업부 제출용)
        "live_slice_experimental": _cat_summary("live_slice"),  # ← 참고용 (런칭예측 툴 범위 밖)
        "avg_mape_d1_30": float(np.mean([r["mape_d1_30"] for r in valid])) if valid else None,
        "avg_band_coverage": float(np.mean([r["band_coverage"] for r in valid if r.get("band_coverage") is not None])) if valid else None,
        "grade_distribution": {},
    }
    for r in reports:
        g = r.get("grade", "ERROR")
        summary["grade_distribution"][g] = summary["grade_distribution"].get(g, 0) + 1

    # V13 P2: family-weighted headline (family 내 median으로 접기 — Freeze 원칙)
    def _family_weighted(cat):
        fams = {}
        for r in reports:
            if "error" in r or r.get("category") != cat or r.get("cumulative_error") is None:
                continue
            fams.setdefault(r["game_family"], []).append(abs(r["cumulative_error"]))
        if not fams:
            return {"families": 0, "family_weighted_abs_error": None}
        fam_meds = [float(np.median(v)) for v in fams.values()]
        return {"families": len(fams), "family_weighted_abs_error": float(np.mean(fam_meds))}
    summary["launch_family_weighted"] = _family_weighted("launch")          # ← headline (observed)
    summary["live_slice_family_weighted"] = _family_weighted("live_slice")  # ← diagnostic
    summary["pseudo_family_weighted"] = _family_weighted("pseudo_launch")   # ← Pool B (Conformal 재료)

    # V13 P2: versioned residual store 기록
    ENGINE_VERSION = "v13.0_internal_resourced"
    store_path = os.path.join(DATA_DIR, "residual_store.json")
    try:
        store = json.load(open(store_path, encoding="utf-8")) if os.path.exists(store_path) else {"entries": []}
    except Exception:
        store = {"entries": []}
    store["entries"] = [e for e in store["entries"] if e.get("engine_version") != ENGINE_VERSION]
    for r in reports:
        if "error" in r:
            continue
        store["entries"].append({
            "engine_version": ENGINE_VERSION, "method": "LOFO",
            "game": r["game"], "game_family": r["game_family"], "category": r["category"],
            "actual_pool": r["actual_pool"], "horizon_residuals": r["horizon_residuals"],
            "cumulative_error": r["cumulative_error"], "band_coverage": r["band_coverage"],
        })
    store["policy_prior_inflation"] = {"pseudo_pool_factor": 2.0, "clamp": [1.5, 3.0],
                                        "status": "provisional", "note": "observed<5 family — ratio 추정 금지 (Freeze)"}
    try:
        json.dump(store, open(store_path, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    except Exception:
        pass

    return sanitize_for_json({"status": "success", "engine_version": ENGINE_VERSION,
                              "exclusion_method": "LOFO", "summary": summary, "reports": reports})

# ============================================================
# V12.5: 크로스 플랫폼 예측 (Phase 1: 플랫폼별 독립 산출 + 합산)
# ============================================================



# ============================================================
# V13.7: 3-Year Product Projection (7-1~7-3)
# ============================================================
@app.post("/api/projection/product-3y/export/pdf")
async def product_3y_pdf(body: Dict[str, Any]):
    """1-page PDF (C레벨용) — light 모드 계산 1회 + official 3본 light. 무거운 tornado 미포함"""
    from fastapi.responses import Response as _Resp
    pay = {**body, "light": True, "enable_bridge": True}
    r = await p3y.run_product_3y(pay, calculate_projection, ProjectionInput)
    official = await p3y.run_official_scenarios({**body, "enable_bridge": False}, calculate_projection, ProjectionInput)
    pdf = pdf_export.build_one_page_projection_pdf(sanitize_for_json(r), sanitize_for_json(official))
    sid = r["assumption_set"]["assumption_set_id"]
    return _Resp(content=pdf, media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename=GW_Launch_Projection_{sid}.pdf"})


@app.post("/api/assumptions/replace")
async def assumptions_replace(body: Dict[str, Any]):
    """V14.1.0 (피드백23 §7): 실측으로 assumption 교체 → 재실행 → Δ + lineage impact 자동 보고"""
    base_payload = body.get("base_payload")
    changes = body.get("changes", [])
    if not base_payload or not changes:
        raise HTTPException(status_code=422, detail="base_payload와 changes[] 필수")
    prev = await p3y.run_product_3y({**base_payload, "light": True, "enable_bridge": False},
                                     calculate_projection, ProjectionInput)
    new_payload = json.loads(json.dumps(base_payload))
    VAR_PATHS = {"target_d1": ["target_d1"], "organic_share_of_total": ["organic_share_of_total"]}
    lineage = []
    for ch in changes:
        var = ch["variable"]
        if var in VAR_PATHS:
            old_v = new_payload.get(var)
            new_payload[var] = ch["value"]
        elif var == "prereg_activation_rate":
            old_v = new_payload["waves"][0].get("prereg_activation_rate")
            for w in new_payload["waves"]:
                w["prereg_activation_rate"] = ch["value"]
        else:
            raise HTTPException(status_code=422, detail=f"지원하지 않는 variable: {var} (target_d1/organic_share_of_total/prereg_activation_rate)")
        lineage.append({"variable": var,
            "from": {"value": old_v, "status": "assumption", "snapshot": prev["assumption_set"]["assumption_set_id"]},
            "to": {"value": ch["value"], "status": ch.get("status", "measured"), "source": ch.get("source"),
                   "sample_n": ch.get("sample_n"), "date": ch.get("date")}})
    new = await p3y.run_product_3y({**new_payload, "light": True, "enable_bridge": False},
                                    calculation if False else calculate_projection, ProjectionInput)
    delta = new["total"]["gross_krw"] - prev["total"]["gross_krw"]
    for ln in lineage:
        ln["projection_impact"] = {"gross_before": prev["total"]["gross_krw"],
                                    "gross_after": new["total"]["gross_krw"], "delta": delta}
    return sanitize_for_json({
        "previous_gross": prev["total"]["gross_krw"], "latest_gross": new["total"]["gross_krw"],
        "delta": delta, "top_delta_driver": changes[0]["variable"],
        "previous_assumption_set_id": prev["assumption_set"]["assumption_set_id"],
        "new_assumption_set_id": new["assumption_set"]["assumption_set_id"],
        "lineage": lineage,
        "report": f"Projection changed: {prev['total']['gross_krw']/1e8:,.0f}억 → {new['total']['gross_krw']/1e8:,.0f}억 ({delta/1e8:+,.0f}억) · Main driver: {changes[0]['variable']}"})


@app.post("/api/revenue-owner/shadow-backtest")
async def revenue_owner_shadow(body: Dict[str, Any] = None):
    body = body or {}
    return sanitize_for_json(revenue_owner.shadow_backtest(
        owners=body.get("owners"), horizon_days=int(body.get("horizon_days", 90))))

@app.post("/api/acquisition/cpi-curve-shadow")
async def cpi_curve_shadow(body: Dict[str, Any]):
    return sanitize_for_json(acquisition_response.spend_to_installs_with_curve(
        float(body["total_budget_krw"]), int(body.get("days", 90)),
        body.get("curve_id"), float(body.get("static_cpi", 7500))))

@app.get("/api/source-registry")
async def get_source_registry():
    return source_registry.get_registry()

@app.get("/api/assumptions/import-template")
async def import_template():
    return actual_import.csv_templates()

@app.post("/api/assumptions/import-actuals")
async def import_actuals(body: Dict[str, Any]):
    """dry_run(기본 true) → 사용자가 confirm=true로 재호출 시 반영 결과 확정 반환"""
    v = actual_import.validate_actuals(body.get("actuals", []))
    if not v["valid"]:
        return sanitize_for_json({"dry_run": True, "applied": False, "rejected": v["rejected"],
                                   "note": "유효한 actual 없음"})
    rep = await assumptions_replace({"base_payload": body.get("base_payload"), "changes": v["valid"]})
    dry = bool(body.get("dry_run", True)) and not bool(body.get("confirm", False))
    return sanitize_for_json({"dry_run": dry, "applied": (not dry), "rejected": v["rejected"],
        "impact": rep, "next_step": ("confirm=true로 재호출 시 반영 확정" if dry else "반영 완료 — lineage 기록됨")})

@app.post("/api/projection/product-3y/official-scenarios")
async def product_3y_official(body: Dict[str, Any]):
    return sanitize_for_json(await p3y.run_official_scenarios(body, calculate_projection, ProjectionInput))

@app.post("/api/projection/product-3y/v14-delta-bridge")
async def product_3y_v14_bridge(body: Dict[str, Any]):
    return sanitize_for_json(await p3y.run_v14_delta_bridge(body, calculate_projection, ProjectionInput))

@app.post("/api/projection/product-3y")
async def product_3y_endpoint(body: Dict[str, Any]):
    if not body.get("waves"):
        raise HTTPException(status_code=422, detail="waves[] 필수")
    if not body.get("anchor_launch_date"):
        raise HTTPException(status_code=422, detail="anchor_launch_date 필수")
    try:
        r = await p3y.run_product_3y(body, calculate_projection, ProjectionInput)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    return sanitize_for_json(r)

@app.post("/api/projection/product-3y/excel")
async def product_3y_excel(body: Dict[str, Any]):
    from fastapi.responses import Response as _Resp
    r = await p3y.run_product_3y(body, calculate_projection, ProjectionInput)
    # 피드백21 6순위: Worst/Normal/Best 3본을 Excel에 동봉 (light 모드)
    try:
        d1 = float(body.get("target_d1", 0.5))
        scen = {}
        for name, dd, meaning in [("Worst", max(0.05, d1 - 0.10), "Gate 하단"),
                                   ("Normal", d1, "Planning Case"),
                                   ("Best", min(0.9, d1 + 0.10), "Gate 상단")]:
            if name == "Normal":
                scen[name] = {"d1": f"{dd*100:.0f}%", "gross_krw": r["total"]["gross_krw"], "meaning": meaning}
            else:
                rr = await p3y.run_product_3y({**body, "target_d1": dd, "light": True, "enable_bridge": False},
                                               calculate_projection, ProjectionInput)
                scen[name] = {"d1": f"{dd*100:.0f}%", "gross_krw": rr["total"]["gross_krw"], "meaning": meaning}
        r["excel_scenarios"] = scen
    except Exception:
        r["excel_scenarios"] = {}
    xls = p3y.build_excel(sanitize_for_json(r))
    return _Resp(content=xls,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": "attachment; filename=product_3y_projection.xlsx"})

@app.post("/api/projection/arpdau-forecast")
async def arpdau_forecast(body: Dict[str, Any]):
    """V13.6 P4a: recipe/region-aware ARPDAU forecast (Candidate — Shadow A/B 통과 전 /projection 미연결)"""
    dau = body.get("dau", [])
    if not dau:
        raise HTTPException(status_code=400, detail="dau[] 필수")
    recipe = body.get("recipe")
    if not recipe:
        raise HTTPException(status_code=422, detail="recipe 필수 (launch_f2p_iap/live_f2p_iap 등) — silent default 금지")
    try:
        f = arp.revenue_forecast(dau, recipe, body.get("genre", "Battle Royale"),
            body.get("platform", "PC"), body.get("region_group", "GLOBAL"),
            body.get("percentile", "p50"), body.get("exclude_family"))
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    env = arp.monetization_scenario_envelope(dau, recipe, body.get("genre", "Battle Royale"),
        body.get("platform", "PC"), body.get("region_group", "GLOBAL"))
    return sanitize_for_json({"status": "success", "forecast": f,
        "monetization_scenario_envelope": env,
        "engine_status": "candidate — P4-G3 Shadow A/B 통과 후 /projection 옵션 승격"})

# ============================================================
# V13.3 P3.5: Product Schedule (waves[]) + Legacy Adapter
# ============================================================
class WaveInput(BaseModel):
    wave_id: str
    platform: str
    launch_date: str
    region_scope: Optional[List[str]] = None
    projection_input: ProjectionInput
    identity_policy: Dict[str, Any]

class ProductScheduleInput(BaseModel):
    product_name: Optional[str] = "product"
    total_days: int = 1095
    waves: List[WaveInput]
    mode_event: Optional[Dict[str, Any]] = None  # V13.6: P4.5 연결 (BR/EX/Both 분해)
    wave_scale_policy: Optional[Dict[str, Any]] = None  # 명시 선택만 (silent 적용 금지): {source, prior_id, multiplier}

@app.post("/api/projection/product-schedule")
async def calculate_product_schedule(ps: ProductScheduleInput):
    from datetime import datetime as _dt
    if not ps.waves:
        raise HTTPException(status_code=400, detail="waves[] 필수")
    dates = [_dt.strptime(w.launch_date, "%Y-%m-%d") for w in ps.waves]
    t0 = min(dates)
    wave_results = []
    for w, d in zip(ps.waves, dates):
        ptl.validate_identity_policy(w.identity_policy, w.wave_id)  # 사전 검증 (422)
        pin = w.projection_input.model_copy(deep=True)
        if pin.blending is None: pin.blending = {}
        pin.blending["platforms"] = [w.platform]
        r = await calculate_projection(pin)
        fd = r["results"]["normal"]["full_data"]
        wave_results.append({"wave_id": w.wave_id, "platform": w.platform,
            "launch_date": w.launch_date, "offset_days": (d - t0).days,
            "identity_policy": w.identity_policy,
            "dau": fd["dau"], "nru": fd["nru"], "revenue": fd["revenue"]})
    combined = ptl.combine_waves(wave_results, ps.total_days)
    # V13.6: P4.5 Mode Expansion API 연결 (옵션)
    if getattr(ps, "mode_event", None):
        combined["mode_state"] = ptl.apply_mode_expansion(
            combined["unique_account_dau"], ps.mode_event, ps.total_days)
    return sanitize_for_json({"status": "success", "product_name": ps.product_name,
        "t0": t0.strftime("%Y-%m-%d"), "combined": combined,
        "synergy": {"retention_lift": 1.00, "arpdau_lift": 1.00, "organic_lift": 1.00}})

class MultiPlatformInput(BaseModel):
    projection_input: ProjectionInput
    platform_mix: Dict[str, float]  # {"Mobile": 0.6, "PC": 0.3, "Console": 0.1}

# PUBG 실데이터 기반 플랫폼 계수 (PC 대비)
PLATFORM_FACTORS = {
    "PC":      {"arpdau_factor": 1.00, "pur_factor": 1.00},
    "Console": {"arpdau_factor": 1.60, "pur_factor": 0.85},  # PUBG: Console ARPDAU 1.6x, PUR 0.85x
    "Mobile":  {"arpdau_factor": 0.65, "pur_factor": 1.30},  # 모바일: 낮은 ARPPU, 높은 PR
}

@app.post("/api/projection/multiplatform")
async def calculate_multiplatform(mp: MultiPlatformInput):
    """
    플랫폼별 독립 산출 후 합산:
    - 예산을 platform_mix 비율로 분배
    - 플랫폼별 벤치마크/표본으로 개별 projection
    - 일별 시리즈 합산 + 플랫폼별 breakdown 제공
    """
    mix = {k: v for k, v in mp.platform_mix.items() if v > 0}
    total_ratio = sum(mix.values())
    if total_ratio <= 0:
        raise HTTPException(status_code=400, detail="platform_mix 비율 합이 0입니다.")
    mix = {k: v / total_ratio for k, v in mix.items()}  # 정규화

    per_platform = {}
    for platform, ratio in mix.items():
        pin = mp.projection_input.model_copy(deep=True)
        # 예산/NRU 분배
        if pin.nru.ua_budget:
            pin.nru.ua_budget = int(pin.nru.ua_budget * ratio)
        if pin.nru.brand_budget:
            pin.nru.brand_budget = int(pin.nru.brand_budget * ratio)
        if pin.nru.sustaining_mkt_budget_monthly:
            pin.nru.sustaining_mkt_budget_monthly = int(pin.nru.sustaining_mkt_budget_monthly * ratio)
        pin.nru.d1_nru = {k: int(v * ratio) for k, v in pin.nru.d1_nru.items()}
        # 플랫폼 고정
        if pin.blending is None:
            pin.blending = {}
        pin.blending["platforms"] = [platform]
        per_platform[platform] = await calculate_projection(pin)

    # 합산
    days = mp.projection_input.projection_days
    combined = {"best": {}, "normal": {}, "worst": {}}
    for scenario in ["best", "normal", "worst"]:
        for key in ["revenue", "dau", "nru"]:
            series = [0.0] * days
            for platform, result in per_platform.items():
                p_series = result["results"][scenario]["full_data"][key]
                factor = PLATFORM_FACTORS.get(platform, {}).get("arpdau_factor", 1.0) if key == "revenue" else 1.0
                for d in range(min(days, len(p_series))):
                    series[d] += p_series[d] * (factor if key == "revenue" else 1.0)
            combined[scenario][key] = series

        combined[scenario]["summary"] = {
            "gross_revenue": sum(combined[scenario]["revenue"]),
            "total_nru": int(sum(combined[scenario]["nru"])),
            "peak_dau": int(max(combined[scenario]["dau"])) if combined[scenario]["dau"] else 0,
            "average_dau": int(np.mean(combined[scenario]["dau"])) if combined[scenario]["dau"] else 0,
        }

    return sanitize_for_json({
        "status": "success",
        "platform_mix": mix,
        "platform_factors_applied": {p: PLATFORM_FACTORS.get(p) for p in mix},
        "combined": combined,
        "per_platform_summary": {
            p: {s: r["summary"][s] for s in ["best", "normal", "worst"]}
            for p, r in per_platform.items()
        },
    })

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
