from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Dict, Optional, Any
import numpy as np
from scipy.optimize import curve_fit
import json
import os
import httpx

app = FastAPI(title="Game KPI Projection API", version="2.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Data paths
DATA_DIR = os.path.join(os.path.dirname(__file__), "..", "data")
RAW_DATA_PATH = os.path.join(DATA_DIR, "raw_game_data.json")
CONFIG_PATH = os.path.join(DATA_DIR, "default_config.json")

# Claude API Configuration
CLAUDE_API_KEY = os.environ.get("CLAUDE_API_KEY", "")
CLAUDE_API_URL = "https://api.anthropic.com/v1/messages"

def load_raw_data():
    with open(RAW_DATA_PATH, 'r', encoding='utf-8') as f:
        return json.load(f)

def load_config():
    with open(CONFIG_PATH, 'r', encoding='utf-8') as f:
        return json.load(f)

# Pydantic Models
class RetentionInput(BaseModel):
    selected_games: List[str]
    target_d1_retention: Dict[str, float]

class NRUInput(BaseModel):
    selected_games: List[str]
    d1_nru: Dict[str, int]
    paid_organic_ratio: float
    nvr: float
    adjustment: Dict[str, float]

class RevenueInput(BaseModel):
    selected_games_pr: List[str]
    selected_games_arppu: List[str]
    pr_adjustment: Dict[str, float]
    arppu_adjustment: Dict[str, float]

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

# ============================================
# 글로벌 계절성 팩터 (지역별 월간 가중치)
# ============================================
SEASONALITY_BY_REGION = {
    "korea": {1: 1.15, 2: 1.20, 3: 1.00, 4: 0.95, 5: 1.00, 6: 0.95, 7: 1.05, 8: 1.10, 9: 1.00, 10: 1.05, 11: 1.10, 12: 1.15},
    "japan": {1: 1.10, 2: 1.05, 3: 1.05, 4: 1.10, 5: 1.15, 6: 0.95, 7: 1.00, 8: 1.05, 9: 1.00, 10: 1.00, 11: 1.05, 12: 1.20},
    "china": {1: 1.10, 2: 1.25, 3: 1.00, 4: 0.95, 5: 1.05, 6: 1.10, 7: 1.05, 8: 1.00, 9: 1.00, 10: 1.20, 11: 1.15, 12: 1.05},
    "global": {1: 0.95, 2: 0.90, 3: 0.95, 4: 1.00, 5: 1.00, 6: 1.00, 7: 1.05, 8: 1.00, 9: 1.00, 10: 1.05, 11: 1.15, 12: 1.25},
    "sea": {1: 1.05, 2: 1.10, 3: 1.00, 4: 1.00, 5: 1.00, 6: 1.05, 7: 1.05, 8: 1.00, 9: 1.00, 10: 1.00, 11: 1.05, 12: 1.15},
    "na": {1: 0.90, 2: 0.90, 3: 0.95, 4: 1.00, 5: 1.00, 6: 1.05, 7: 1.05, 8: 1.00, 9: 0.95, 10: 1.05, 11: 1.20, 12: 1.25},
    "sa": {1: 1.10, 2: 1.05, 3: 1.00, 4: 0.95, 5: 0.95, 6: 1.00, 7: 1.05, 8: 1.00, 9: 1.00, 10: 1.05, 11: 1.10, 12: 1.15},
    "eu": {1: 0.90, 2: 0.90, 3: 0.95, 4: 1.05, 5: 1.00, 6: 1.00, 7: 1.00, 8: 0.95, 9: 1.00, 10: 1.05, 11: 1.15, 12: 1.25},
}

def calculate_seasonality(regions: List[str], launch_date: str, days: int = 365) -> List[float]:
    """
    지역별 계절성 팩터 계산
    다중 지역 선택 시 평균 적용
    """
    from datetime import datetime, timedelta
    
    try:
        start_date = datetime.strptime(launch_date, "%Y-%m-%d")
    except:
        start_date = datetime(2026, 11, 12)  # 기본값
    
    factors = []
    for day in range(days):
        current_date = start_date + timedelta(days=day)
        month = current_date.month
        
        # 선택된 지역들의 계절성 평균
        region_factors = []
        for region in regions:
            region_key = region.lower()
            if region_key in SEASONALITY_BY_REGION:
                region_factors.append(SEASONALITY_BY_REGION[region_key].get(month, 1.0))
        
        if region_factors:
            factors.append(np.mean(region_factors))
        else:
            factors.append(1.0)
    
    return factors

# ============================================
# Time-Decay 블렌딩 (시간에 따라 가중치 변경)
# ============================================
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

def get_benchmark_data(genre: str, platforms: List[str]) -> Dict[str, float]:
    """장르/플랫폼에 맞는 벤치마크 데이터 반환 (다중 플랫폼은 평균)"""
    if not platforms:
        platforms = ["PC"]
    
    values = []
    for platform in platforms:
        if platform in BENCHMARK_DATA and genre in BENCHMARK_DATA[platform]:
            values.append(BENCHMARK_DATA[platform][genre])
    
    if not values:
        # 기본값 (PC/MMORPG)
        return {"d1": 0.32, "d7": 0.20, "d30": 0.11, "d90": 0.06, "pr": 0.06, "arppu": 78000}
    
    # 다중 플랫폼이면 평균
    return {
        "d1": np.mean([v["d1"] for v in values]),
        "d7": np.mean([v["d7"] for v in values]),
        "d30": np.mean([v["d30"] for v in values]),
        "d90": np.mean([v["d90"] for v in values]),
        "pr": np.mean([v["pr"] for v in values]),
        "arppu": np.mean([v["arppu"] for v in values]),
    }

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
    daily_dau = []
    
    for active_day in range(days):
        total_dau = 0
        for cohort_day in range(active_day + 1):
            days_since_install = active_day - cohort_day
            if cohort_day < len(nru_series) and days_since_install < len(retention_curve):
                nru = nru_series[cohort_day]
                retention = retention_curve[days_since_install]
                total_dau += nru * retention
        daily_dau.append(int(total_dau))
    
    return daily_dau

def calculate_revenue(dau: List[float], pr: List[float], arppu: List[float]):
    """
    일별 매출 계산
    
    Revenue = DAU × PR × (ARPPU / 30)
    
    주의: ARPPU는 '월간' 결제자당 평균 결제액이므로,
          일별 계산 시 30으로 나눠야 함
    """
    revenue = []
    for i in range(len(dau)):
        pr_val = pr[i] if i < len(pr) else pr[-1]
        arppu_val = arppu[i] if i < len(arppu) else arppu[-1]
        
        # ARPPU를 일별로 환산 (월간 ARPPU / 30)
        daily_arppu = arppu_val / 30
        
        # 일별 매출 = DAU × PR × 일별 ARPPU
        daily_revenue = dau[i] * pr_val * daily_arppu
        revenue.append(daily_revenue)
    
    return revenue

# Claude AI Integration
async def get_claude_insight(prompt: str) -> str:
    """Call Claude API for AI insights"""
    if not CLAUDE_API_KEY:
        return "AI 인사이트를 사용하려면 CLAUDE_API_KEY 환경변수를 설정해주세요."
    
    try:
        async with httpx.AsyncClient() as client:
            response = await client.post(
                CLAUDE_API_URL,
                headers={
                    "x-api-key": CLAUDE_API_KEY,
                    "anthropic-version": "2023-06-01",
                    "content-type": "application/json"
                },
                json={
                    "model": "claude-sonnet-4-20250514",
                    "max_tokens": 1024,
                    "messages": [
                        {"role": "user", "content": prompt}
                    ]
                },
                timeout=60.0
            )
            
            if response.status_code == 200:
                data = response.json()
                return data["content"][0]["text"]
            else:
                error_detail = response.json().get("error", {}).get("message", response.status_code)
                return f"AI 분석 오류: {error_detail}"
    except Exception as e:
        return f"AI 연결 실패: {str(e)}"

def create_insight_prompt(summary: Dict[str, Any], analysis_type: str) -> str:
    """Create prompt for Claude based on analysis type with Multi-Persona approach"""
    
    # V7 설정 정보 추출
    v7_settings = summary.get('v7_settings', {})
    blending = summary.get('blending', {})
    
    base_context = f"""당신은 게임 KPI 프로젝션 분석을 수행하는 4명의 전문가 패널입니다.

[V7 전문가 패널 구성]
1. 글로벌 마케팅 및 UA 전문가: CPI 적정성, 모객 효율, UA 전략, CAC/LTV 분석
2. 데이터 사이언티스트: 지표 건전성, 리텐션 패턴, 통계적 신뢰도, 예측 정확도
3. 글로벌 퍼블리싱 전문가: BM 구조, 시장 경쟁력, 장르 특성, 글로벌 트렌드
4. 재무 설계 건전성 전문가: BEP, ROAS, 투자 회수, 현금흐름, 리스크

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
- 벤치마크 기준: {blending.get('genre', 'N/A')} / {', '.join(blending.get('platforms', ['PC']))}

[중요 지시사항]
- 마크다운 문법(###, **, -, * 등)을 절대 사용하지 마세요
- 일반 텍스트로만 작성하세요
- 번호는 1. 2. 3. 형식으로 사용하세요
- 강조는 따옴표나 괄호로 표현하세요
- 경영진 보고용으로 전문적이고 간결하게 작성하세요
"""
    
    type_prompts = {
        "executive_report": f"""
[분석 요청: 경영진용 종합 보고서]
4명의 전문가가 각자의 관점에서 분석하고, 최종 경영 의사결정을 위한 종합 보고서를 작성해주세요.

응답 형식:

[1. Executive Summary - 핵심 요약]
Normal 시나리오 기준 1년 예상 매출과 핵심 지표를 한 문장으로 요약

[2. 산술 근거 및 가정]
- 이 프로젝션이 어떤 가정과 로직으로 도출되었는지 설명
- 블렌딩 비율, 품질 등급, BM 타입이 결과에 미친 영향

[3. 전문가 패널 분석]
(1) UA 전문가: CPI {summary.get('cpi', 'N/A')}원 기준 모객 효율 평가, NRU 목표 달성 가능성
(2) 데이터 사이언티스트: 리텐션 커브 건전성, Best-Worst 편차 {((summary.get('best', {}).get('gross_revenue', 1) / max(summary.get('worst', {}).get('gross_revenue', 1), 1) - 1) * 100):.0f}% 적정성
(3) 퍼블리싱 전문가: {blending.get('genre', 'N/A')} 장르 시장 대비 경쟁력, BM 구조 적합성
(4) 재무 전문가: ROAS, 손익분기점 도달 예상, 투자 리스크

[4. Go/No-Go 권고]
- 최종 권고: (Go / Conditional Go / No-Go 중 하나)
- 권고 이유: 한 문장
- 핵심 리스크 3가지
- 권장 액션 3가지

총 800자 이내로 작성하세요.
""",
        "general": """
[분석 요청: 종합 분석]
4명의 전문가가 각자의 관점에서 핵심 의견을 제시하고, 최종 종합 결론을 도출해주세요.

응답 형식:
1. UA 전문가 의견: (모객 효율 관점에서 한 문장)
2. 데이터 사이언티스트 의견: (지표 건전성 관점에서 한 문장)  
3. 퍼블리싱 전문가 의견: (시장 경쟁력 관점에서 한 문장)
4. 재무 전문가 의견: (투자 회수 관점에서 한 문장)
5. 종합 결론: 4명의 의견을 종합한 최종 평가와 권장 액션 3가지

총 400자 이내로 작성하세요.
""",
        "reliability": """
[분석 요청: 신뢰도 평가]
4명의 전문가가 이 프로젝션의 신뢰도를 각자의 관점에서 평가하고 종합 점수를 산정해주세요.

응답 형식:
1. 신뢰도 점수: (100점 만점, 숫자만)
2. 신뢰도 등급: (A/B/C/D/F 중 하나)
3. 전문가별 평가
   - UA 전문가: (NRU/CPI 목표 현실성 평가)
   - 데이터 사이언티스트: (표본 데이터 품질, 시나리오 편차 적정성 평가)
   - 퍼블리싱 전문가: (시장 대비 벤치마크 적정성 평가)
   - 재무 전문가: (수익 예측 현실성 평가)
4. 신뢰도 향상 제안: 구체적인 개선 방안 3가지

총 500자 이내로 작성하세요.
""",
        "retention": """
[분석 요청: 리텐션 분석]
4명의 전문가가 리텐션 및 DAU 패턴을 분석해주세요.

응답 형식:
1. DAU 패턴 건강도: (좋음/보통/우려 중 하나와 이유)
2. 전문가별 리텐션 인사이트
   - 데이터 사이언티스트: (리텐션 커브 분석, Power Law 적합도)
   - 퍼블리싱 전문가: (장르 대비 리텐션 수준 평가)
   - UA 전문가: (리텐션 개선이 UA 효율에 미치는 영향)
3. 리텐션 개선 액션 플랜: 우선순위별 3가지

총 400자 이내로 작성하세요.
""",
        "revenue": """
[분석 요청: 매출 분석]
4명의 전문가가 매출 예측을 분석해주세요.

응답 형식:
1. 매출 예측 현실성: (낙관적/적정/보수적 중 하나와 이유)
2. 전문가별 매출 인사이트
   - 재무 전문가: (손익분기점 및 투자회수 관점)
   - UA 전문가: (ARPU 및 과금 전환율 관점)
   - 퍼블리싱 전문가: (시장 규모 대비 점유율 관점)
3. 매출 극대화 전략: 우선순위별 3가지

총 400자 이내로 작성하세요.
""",
        "risk": """
[분석 요청: 리스크 분석]
4명의 전문가가 리스크 요인을 분석해주세요.

응답 형식:
1. 전체 리스크 수준: (높음/중간/낮음 중 하나)
2. Best-Worst 편차 분석: (편차 비율과 의미)
3. 전문가별 리스크 식별
   - 재무 전문가: (재무 리스크)
   - UA 전문가: (UA 리스크)
   - 데이터 사이언티스트: (예측 불확실성 리스크)
   - 퍼블리싱 전문가: (시장/경쟁 리스크)
4. 리스크 완화 전략: 우선순위별 3가지

총 450자 이내로 작성하세요.
""",
        "competitive": """
[분석 요청: 경쟁력 분석]
4명의 전문가가 시장 경쟁력을 분석해주세요.

응답 형식:
1. 시장 경쟁력 등급: (상/중/하 중 하나와 이유)
2. 전문가별 경쟁력 평가
   - 퍼블리싱 전문가: (장르 내 포지셔닝)
   - UA 전문가: (차별화 포인트)
   - 재무 전문가: (수익 모델 경쟁력)
3. 경쟁력 강화 전략: 우선순위별 3가지

총 400자 이내로 작성하세요.
"""
    }
    
    return base_context + type_prompts.get(analysis_type, type_prompts["general"])

# API Endpoints
@app.get("/")
async def root():
    return {"message": "Game KPI Projection API", "version": "2.0.0", "ai_enabled": bool(CLAUDE_API_KEY)}

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
    bm_modifier = BM_TYPE_MODIFIERS.get(bm_type, {"pr_mod": 1.0, "arppu_mod": 1.0})
    
    # V7: 계절성 팩터
    regions = input_data.regions or ["global"]
    seasonality_factors = calculate_seasonality(regions, input_data.launch_date, days)
    
    # 표본 게임이 없으면 벤치마크 100% 사용
    has_sample_games = len(input_data.retention.selected_games) > 0
    if not has_sample_games:
        base_weight = 0.0
        use_benchmark_only = True
    
    # 벤치마크 데이터 가져오기 (BM Type 적용)
    benchmark = get_benchmark_data(genre, platforms)
    benchmark["pr"] = benchmark["pr"] * bm_modifier["pr_mod"]
    benchmark["arppu"] = benchmark["arppu"] * bm_modifier["arppu_mod"]
    benchmark_ret_curve = generate_benchmark_retention_curve(benchmark, days)
    
    # 내부 표본 기반 계수 계산
    a, b = calculate_retention_coefficients(input_data.retention.selected_games, raw_data)
    pr_pattern = calculate_pr_pattern(input_data.revenue.selected_games_pr, raw_data)
    arppu_pattern = calculate_arppu_pattern(input_data.revenue.selected_games_arppu, raw_data)
    
    for scenario in ["best", "normal", "worst"]:
        target_d1 = input_data.retention.target_d1_retention[scenario]
        
        # 내부 표본 기반 리텐션 커브
        internal_ret_curve = generate_retention_curve(a, b, target_d1, days)
        
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
        
        nru_series = generate_nru_series(adjusted_d1_nru, [], days)
        
        # V7: 계절성 적용 (NRU에 반영)
        nru_series = [int(nru * sf) for nru, sf in zip(nru_series, seasonality_factors)]
        
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
        
        # V7: 계절성을 ARPPU에도 반영
        arppu_series = [arppu * sf for arppu, sf in zip(arppu_series, seasonality_factors)]
        
        # Revenue 계산 (일별 ARPPU 환산 적용됨)
        revenue_series = calculate_revenue(dau_series, pr_series, arppu_series)
        
        results[scenario] = {
            "retention": {
                "coefficients": {"a": float(a), "b": float(b)},
                "target_d1": target_d1,
                "curve": ret_curve[:90]
            },
            "nru": {
                "d1_nru": d1_nru,
                "series": nru_series[:90],
                "total": sum(nru_series)
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
    for scenario in ["best", "normal", "worst"]:
        basic = input_data.basic_settings or load_config()["basic_settings"]
        gross = results[scenario]["revenue"]["total_gross"]
        
        market_fee = basic.get("market_fee_ratio", 0.3)
        vat = basic.get("vat_ratio", 0.1)
        infra = basic.get("infrastructure_cost_ratio", 0.03)
        
        net = gross * (1 - market_fee - vat - infra)
        
        summary[scenario] = {
            "gross_revenue": gross,
            "net_revenue": net,
            "total_nru": results[scenario]["nru"]["total"],
            "peak_dau": results[scenario]["dau"]["peak"],
            "average_dau": results[scenario]["dau"]["average"],
            "average_daily_revenue": results[scenario]["revenue"]["average_daily"]
        }
    
    return {
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
        "summary": summary,
        "results": results
    }

# AI Insight Endpoint
@app.post("/api/ai/insight")
async def get_ai_insight(request: AIInsightRequest):
    """Get AI-powered insights for projection results"""
    prompt = create_insight_prompt(request.projection_summary, request.analysis_type)
    insight = await get_claude_insight(prompt)
    
    return {
        "status": "success",
        "analysis_type": request.analysis_type,
        "insight": insight,
        "ai_model": "gemini-1.5-flash"
    }

@app.get("/api/ai/status")
async def get_ai_status():
    """Check AI integration status"""
    return {
        "enabled": bool(CLAUDE_API_KEY),
        "model": "claude-sonnet-4",
        "available_types": ["general", "reliability", "retention", "revenue", "risk", "competitive"]
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
        # Row 1: 안내 문구
        ws['B1'] = f'- 아래 게임 추가 시 {sheet_title} 게임 리스트에 자동으로 추가됩니다.'
        ws['B1'].font = Font(color="FF0000")
        
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
            ws.cell(row=row_idx, column=2, value=game_name).border = thin_border
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
    
    return {"status": "success", "message": f"Added/updated games in {metric}"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
