"""
Game KPI Projection & Live-Ops Engine V10.0
============================================
P0 Fixes Applied:
- [R1] DAU D0 Retention = 1.0 (설치 당일 100%)
- [R3] Pre-launch 전환율 상쇄 버그 수정 (CPW 도입)
- [R5] Paid CAC = UA Budget / Paid NRU (Organic 제외)
- [R6] 365일 전체 반환 (90일 슬라이싱 제거)
- [R8] BEP Day 계산 추가
- OpenAI API 전환 (Claude → GPT-4o)
- Excel Export API 추가
"""

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import List, Dict, Optional, Any
import numpy as np
import pandas as pd
import json
import os
import io
from datetime import datetime, timedelta
import math
import httpx

# ============================================================
# APP SETUP
# ============================================================
app = FastAPI(title="Game KPI Projection Engine", version="10.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # 프로덕션에서는 특정 도메인으로 제한
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ============================================================
# PATHS & API KEYS
# ============================================================
DATA_DIR = os.path.join(os.path.dirname(__file__), "..", "data")
RAW_DATA_PATH = os.path.join(DATA_DIR, "raw_game_data.json")
CONFIG_PATH = os.path.join(DATA_DIR, "default_config.json")

# OpenAI API (Claude에서 전환)
OPENAI_API_KEY = os.environ.get("OPENAI_API_KEY", "")
OPENAI_API_URL = "https://api.openai.com/v1/chat/completions"
OPENAI_MODEL = "gpt-4o"  # 또는 "gpt-4o-mini" (비용 절감)

# ============================================================
# DATA LOADERS
# ============================================================
def load_raw_data() -> Dict:
    if not os.path.exists(RAW_DATA_PATH):
        return {"games": {"retention": {}, "nru": {}, "payment_rate": {}, "arppu": {}}}
    with open(RAW_DATA_PATH, 'r', encoding='utf-8') as f:
        return json.load(f)

def load_config() -> Dict:
    if not os.path.exists(CONFIG_PATH):
        # [R2 Fix] 기본값 - 부호 정상화
        return {
            "basic_settings": {
                "hr_cost_monthly": 20000000,
                "server_cost_ratio": 0.05,
                "market_fee_ratio": 0.3,
                "vat_ratio": 0.1,
                "infrastructure_cost_ratio": 0.05
            },
            "adjustments": {
                "best_vs_normal": 0.1,   # Best = +10%
                "worst_vs_normal": -0.1  # Worst = -10%
            }
        }
    with open(CONFIG_PATH, 'r', encoding='utf-8') as f:
        return json.load(f)

# ============================================================
# HELPER FUNCTIONS
# ============================================================
def safe_log_boost(val: float, scale: float = 1.0) -> float:
    """안전한 로그 부스트 계산"""
    if val <= 0:
        return 0
    return math.log(1 + val) * scale

def generate_retention_curve(d1: float, days: int, decay_power: float = -0.5) -> List[float]:
    """
    리텐션 커브 생성 (D1부터 시작)
    curve[0] = D1 리텐션, curve[1] = D2 리텐션, ...
    """
    curve = []
    for t in range(1, days + 1):
        ret = d1 * (t ** decay_power)
        curve.append(min(1.0, max(0.0, ret)))
    return curve

def calculate_blended_curve(
    internal: List[float], 
    benchmark: List[float], 
    days: int, 
    quality_mult: float = 1.0
) -> List[float]:
    """
    내부 데이터와 벤치마크 블렌딩
    Time-decay: 초반은 내부 데이터 가중치 높음 → 후반은 벤치마크 가중치 높음
    """
    blended = []
    last_int_val = internal[-1] if internal else 0
    last_bench_val = benchmark[-1] if benchmark else 0
    
    for i in range(days):
        # Time-decay 가중치 (0.9 → 0.1)
        w_int = max(0.1, 0.9 - (0.8 * i / max(1, days - 1)))
        
        val_int = internal[i] if i < len(internal) else last_int_val
        val_bench = benchmark[i] if i < len(benchmark) else last_bench_val
        
        final_val = (val_int * w_int) + (val_bench * quality_mult * (1 - w_int))
        blended.append(max(0, final_val))
    
    return blended

# ============================================================
# INPUT MODELS
# ============================================================
class LiveEvent(BaseModel):
    month: int
    name: str
    traffic_boost: float = 1.0
    revenue_boost: float = 1.0

class MarketingInput(BaseModel):
    ua_budget: int = 0
    brand_budget: int = 0
    target_cpa: int = 2000
    base_organic_ratio: float = 0.2
    pre_marketing_share: float = 0.0
    wishlist_conversion_rate: float = 0.15
    sustaining_cost_ratio: float = 0.07
    paid_user_quality_ratio: float = 0.8  # Paid 유저 품질 희석

class RevenueInput(BaseModel):
    package_price: int = 0
    use_ad_revenue: bool = False
    ad_impressions_per_dau: int = 5
    ad_ecpm: int = 5000

class QualityInput(BaseModel):
    score: str = "B"
    benchmark_weight: float = 0.5

class ProjectionInput(BaseModel):
    launch_date: str
    projection_days: int = 365  # [R6] 기본 365일
    region: str = "Global"
    bm_type: str = "Midcore"
    genre: str = "RPG"
    platform: str = "Mobile"
    marketing: MarketingInput
    quality: QualityInput
    selected_games: List[str] = []
    revenue: RevenueInput
    live_events: List[LiveEvent] = []
    basic_settings: Dict[str, Any] = {}

# ============================================================
# CORE PROJECTION LOGIC
# ============================================================
@app.post("/api/projection")
async def calculate_projection(input_data: ProjectionInput):
    """
    V10.0 Projection Engine
    - [R1] DAU D0 = 1.0 리텐션
    - [R3] Pre-launch CPW 기반
    - [R5] Paid CAC 정확한 계산
    - [R6] 365일 전체 반환
    - [R8] BEP Day 계산
    """
    raw_data = load_raw_data()
    config = load_config()
    
    days = input_data.projection_days
    mkt = input_data.marketing
    rev_cfg = input_data.revenue
    
    # 1. Quality Multiplier
    quality_map = {"S": 1.2, "A": 1.1, "B": 1.0, "C": 0.8, "D": 0.6}
    q_mult = quality_map.get(input_data.quality.score, 1.0)
    
    # 2. BM Type Benchmarks
    bm_defaults = {
        "Hardcore": {"d1": 0.35, "pr": 0.03, "arppu": 50000.0},
        "Midcore": {"d1": 0.40, "pr": 0.05, "arppu": 25000.0},
        "Casual": {"d1": 0.45, "pr": 0.08, "arppu": 10000.0},
    }
    bm_base = bm_defaults.get(input_data.bm_type, bm_defaults["Midcore"])
    
    # Benchmark Curves
    bench_retention = generate_retention_curve(bm_base["d1"], days, -0.5)
    bench_pr = [bm_base["pr"]] * days
    bench_arppu = [bm_base["arppu"]] * days
    
    # 3. Internal Data (선택된 게임 또는 벤치마크)
    if not input_data.selected_games:
        int_retention = bench_retention
        int_pr = bench_pr
        int_arppu = bench_arppu
    else:
        g_name = input_data.selected_games[0]
        games = raw_data.get('games', {})
        int_retention = games.get('retention', {}).get(g_name, bench_retention)
        int_pr = games.get('payment_rate', {}).get(g_name, bench_pr)
        int_arppu = games.get('arppu', {}).get(g_name, bench_arppu)
    
    # 4. Blended Curves
    organic_ret_curve = calculate_blended_curve(int_retention, bench_retention, days, q_mult)
    # Paid 유저는 품질 희석 적용
    paid_ret_curve = [r * mkt.paid_user_quality_ratio for r in organic_ret_curve]
    
    final_pr = calculate_blended_curve(int_pr, bench_pr, days, q_mult)
    final_arppu = calculate_blended_curve(int_arppu, bench_arppu, days, q_mult)
    
    # 5. Marketing Calculations
    total_ua = float(mkt.ua_budget)
    total_brand = float(mkt.brand_budget)
    
    # CPA Saturation (예산 5억당 효율 감소)
    budget_scale = (total_ua + total_brand) / 500_000_000
    saturation = 1.0 + (math.log(max(1, budget_scale)) * 0.1) if budget_scale > 1 else 1.0
    eff_cpa = max(1, mkt.target_cpa * saturation)
    
    # Organic Boost (브랜딩 비율에 따른 증폭)
    brand_ratio = total_brand / max(1, total_ua)
    org_boost = 1.0 + safe_log_boost(brand_ratio, 0.7)
    final_organic_ratio = mkt.base_organic_ratio * org_boost
    
    # [R3 Fix] Pre-Launch Reservoir Logic
    pre_ua_budget = total_ua * mkt.pre_marketing_share
    launch_ua_budget = total_ua * (1 - mkt.pre_marketing_share)
    
    # CPW (Cost Per Wishlist) = CPA의 30% 수준
    cpw = eff_cpa * 0.3
    
    # Wishlist Pool (위시리스트 모수)
    wishlist_pool_paid = pre_ua_budget / cpw if cpw > 0 else 0
    wishlist_pool_org = wishlist_pool_paid * final_organic_ratio * 1.5
    
    # D1 Burst (전환율 적용 - 이제 실제로 영향을 줌!)
    d1_burst_paid = wishlist_pool_paid * mkt.wishlist_conversion_rate
    d1_burst_org = wishlist_pool_org * mkt.wishlist_conversion_rate
    
    # Launch Period Users
    launch_paid_users = launch_ua_budget / eff_cpa if eff_cpa > 0 else 0
    launch_org_users = launch_paid_users * final_organic_ratio
    
    # Decay Distribution (30일간 분배)
    decay = [1.0 / (t ** 1.2) for t in range(1, 31)]
    decay_sum = sum(decay)
    launch_scale_paid = launch_paid_users / decay_sum if decay_sum > 0 else 0
    launch_scale_org = launch_org_users / decay_sum if decay_sum > 0 else 0
    
    # 6. Scenario Multipliers [R2 Fix - 부호 정상화]
    scenarios = {
        "best": 1.1,    # +10%
        "normal": 1.0,
        "worst": 0.9    # -10%
    }
    
    results = {}
    summary = {}
    
    # Cost Settings
    hr_cost_monthly = input_data.basic_settings.get('hr_cost_monthly', 
                       config.get('basic_settings', {}).get('hr_cost_monthly', 20000000))
    daily_fixed_cost = hr_cost_monthly / 30
    
    for scenario, scen_mult in scenarios.items():
        # --- A. NRU Series ---
        nru_paid_daily = [0.0] * days
        nru_org_daily = [0.0] * days
        
        for t in range(days):
            day = t + 1
            
            # D1 Burst
            if day == 1:
                nru_paid_daily[t] += d1_burst_paid
                nru_org_daily[t] += d1_burst_org
            
            # Launch Period (D1~D30)
            if day <= 30:
                decay_val = 1.0 / (day ** 1.2)
                nru_paid_daily[t] += launch_scale_paid * decay_val
                nru_org_daily[t] += launch_scale_org * decay_val
            
            # Live Events
            current_month = (t // 30) + 1
            for event in input_data.live_events:
                if event.month == current_month and t % 30 == 0 and t > 0:
                    prev_paid = nru_paid_daily[t - 1] if t > 0 else 0
                    prev_org = nru_org_daily[t - 1] if t > 0 else 0
                    boost_p = prev_paid * (event.traffic_boost - 1)
                    boost_o = prev_org * (event.traffic_boost - 1) * 1.5
                    for k in range(min(7, days - t)):
                        nru_paid_daily[t + k] += boost_p * (1 - k / 7)
                        nru_org_daily[t + k] += boost_o * (1 - k / 7)
            
            # [R4 Fix] 시나리오는 성과에 적용 (예산 아님)
            nru_paid_daily[t] *= scen_mult
            nru_org_daily[t] *= scen_mult
        
        # --- B. Cohort DAU [R1 Fix: D0 = 1.0] ---
        dau_daily = []
        for t in range(days):
            paid_dau = 0.0
            org_dau = 0.0
            
            for cohort_day in range(t + 1):
                days_since_install = t - cohort_day
                
                # [R1 Fix] D0(설치 당일) 리텐션 = 1.0 (100%)
                if days_since_install == 0:
                    ret_p = 1.0
                    ret_o = 1.0
                else:
                    # D1 = curve[0], D2 = curve[1], ...
                    idx = days_since_install - 1
                    ret_p = paid_ret_curve[idx] if idx < len(paid_ret_curve) else 0
                    ret_o = organic_ret_curve[idx] if idx < len(organic_ret_curve) else 0
                
                paid_dau += nru_paid_daily[cohort_day] * ret_p
                org_dau += nru_org_daily[cohort_day] * ret_o
            
            dau_daily.append(int(paid_dau + org_dau))
        
        # --- C. Revenue & Cost ---
        rev_daily = []
        cost_daily = []
        profit_daily = []
        pkg_price = rev_cfg.package_price
        
        for t in range(days):
            # Revenue
            nru_total = nru_paid_daily[t] + nru_org_daily[t]
            pkg_rev = nru_total * pkg_price
            iap_rev = dau_daily[t] * final_pr[t] * (final_arppu[t] / 30) * scen_mult  # 월간 ARPPU → 일간
            
            ad_rev = 0
            if rev_cfg.use_ad_revenue:
                ad_rev = dau_daily[t] * rev_cfg.ad_impressions_per_dau * (rev_cfg.ad_ecpm / 1000)
            
            # Live Event Revenue Boost
            current_month = (t // 30) + 1
            rev_mult = 1.0
            for event in input_data.live_events:
                if event.month == current_month:
                    rev_mult = max(rev_mult, event.revenue_boost)
            
            day_rev = int((pkg_rev + iap_rev + ad_rev) * rev_mult)
            rev_daily.append(day_rev)
            
            # Cost
            day_mkt = 0
            if t < 30:
                day_mkt += (total_ua + total_brand) / 30
            day_mkt += day_rev * mkt.sustaining_cost_ratio
            
            day_cost = int(daily_fixed_cost + day_mkt)
            cost_daily.append(day_cost)
            
            # Profit
            profit_daily.append(day_rev - day_cost)
        
        # --- D. Summary KPIs [R5, R8 Fix] ---
        total_rev = sum(rev_daily)
        total_cost = sum(cost_daily)
        total_nru_paid = sum(nru_paid_daily)
        total_nru_org = sum(nru_org_daily)
        total_nru_all = total_nru_paid + total_nru_org
        
        # [R8 Fix] BEP Calculation
        cum_profit = np.cumsum(profit_daily)
        bep_day = -1
        bep_indices = np.where(cum_profit >= 0)[0]
        if len(bep_indices) > 0:
            bep_day = int(bep_indices[0] + 1)
        
        # [R5 Fix] Correct CAC Calculation
        paid_cac = int(total_ua / max(1, total_nru_paid))
        blended_cac = int((total_ua + total_brand) / max(1, total_nru_all))
        
        summary[scenario] = {
            "total_revenue": total_rev,
            "total_cost": total_cost,
            "net_profit": total_rev - total_cost,
            "paid_roas": round(total_rev / max(1, total_ua) * 100, 1),
            "blended_roas": round(total_rev / max(1, total_cost) * 100, 1),
            "roi": round((total_rev - total_cost) / max(1, total_cost) * 100, 1),
            "bep_day": bep_day,
            "cac_paid": paid_cac,
            "cac_blended": blended_cac,
            "total_nru": int(total_nru_all),
            "total_nru_paid": int(total_nru_paid),
            "total_nru_organic": int(total_nru_org),
            "effective_cpa": int(eff_cpa),
            "organic_boost": round(org_boost, 2)
        }
        
        # [R6 Fix] 365일 전체 반환 (90일 슬라이싱 제거)
        results[scenario] = {
            "nru": [int(p + o) for p, o in zip(nru_paid_daily, nru_org_daily)],
            "nru_paid": [int(p) for p in nru_paid_daily],
            "nru_organic": [int(o) for o in nru_org_daily],
            "dau": dau_daily,
            "revenue": rev_daily,
            "cost": cost_daily,
            "profit": profit_daily,
            "cum_profit": [int(cp) for cp in cum_profit],
            "retention": organic_ret_curve,
            "pr": final_pr,
            "arppu": final_arppu
        }
    
    return {
        "status": "success",
        "version": "10.0.0",
        "results": results,
        "summary": summary,
        "meta": {
            "projection_days": days,
            "genre": input_data.genre,
            "platform": input_data.platform,
            "bm_type": input_data.bm_type,
            "effective_cpa": int(eff_cpa),
            "organic_ratio": round(final_organic_ratio, 3),
            "quality_score": input_data.quality.score
        }
    }

# ============================================================
# P1: EXCEL EXPORT API
# ============================================================
@app.post("/api/projection/export")
async def export_projection_excel(input_data: ProjectionInput):
    """
    경영진 보고용 Excel Export
    - Sheet 1: Executive Summary (KPI 요약)
    - Sheet 2: Daily Data (365일 상세)
    - Sheet 3: Assumptions (입력 가정)
    """
    # 1. 프로젝션 계산
    calc_result = await calculate_projection(input_data)
    results = calc_result["results"]
    summary = calc_result["summary"]
    meta = calc_result["meta"]
    
    # 2. Excel 생성
    output = io.BytesIO()
    with pd.ExcelWriter(output, engine='openpyxl') as writer:
        
        # [Sheet 1] Executive Summary
        summary_rows = []
        for scen in ["best", "normal", "worst"]:
            s = summary[scen]
            summary_rows.append({
                "Scenario": scen.upper(),
                "Total Revenue (₩)": f"{s['total_revenue']:,}",
                "Total Cost (₩)": f"{s['total_cost']:,}",
                "Net Profit (₩)": f"{s['net_profit']:,}",
                "ROI (%)": f"{s['roi']:.1f}%",
                "BEP (Day)": f"D+{s['bep_day']}" if s['bep_day'] > 0 else "Not Reached",
                "Paid ROAS (%)": f"{s['paid_roas']:.1f}%",
                "Blended ROAS (%)": f"{s['blended_roas']:.1f}%",
                "Paid CAC (₩)": f"{s['cac_paid']:,}",
                "Blended CAC (₩)": f"{s['cac_blended']:,}",
                "Total NRU": f"{s['total_nru']:,}",
                "Paid NRU": f"{s['total_nru_paid']:,}",
                "Organic NRU": f"{s['total_nru_organic']:,}"
            })
        pd.DataFrame(summary_rows).to_excel(writer, sheet_name='Executive Summary', index=False)
        
        # [Sheet 2] Daily Data (Normal Case)
        norm_res = results["normal"]
        days_list = list(range(1, len(norm_res["revenue"]) + 1))
        
        daily_df = pd.DataFrame({
            "Day": days_list,
            "DAU": norm_res["dau"],
            "NRU (Total)": norm_res["nru"],
            "NRU (Paid)": norm_res["nru_paid"],
            "NRU (Organic)": norm_res["nru_organic"],
            "Revenue (Gross)": norm_res["revenue"],
            "Cost": norm_res["cost"],
            "Profit (Daily)": norm_res["profit"],
            "Profit (Cum)": norm_res["cum_profit"],
            "Retention": norm_res["retention"]
        })
        daily_df.to_excel(writer, sheet_name='Daily Data (Normal)', index=False)
        
        # [Sheet 3] Assumptions
        assumptions = {
            "Export Date": datetime.now().strftime("%Y-%m-%d %H:%M"),
            "Model Version": "V10.0",
            "Launch Date": input_data.launch_date,
            "Projection Days": input_data.projection_days,
            "Genre": input_data.genre,
            "Platform": input_data.platform,
            "BM Type": input_data.bm_type,
            "Quality Score": input_data.quality.score,
            "UA Budget (₩)": f"{input_data.marketing.ua_budget:,}",
            "Brand Budget (₩)": f"{input_data.marketing.brand_budget:,}",
            "Target CPA (₩)": f"{input_data.marketing.target_cpa:,}",
            "Effective CPA (₩)": f"{meta['effective_cpa']:,}",
            "Pre-marketing Share": f"{input_data.marketing.pre_marketing_share * 100:.1f}%",
            "Wishlist CVR": f"{input_data.marketing.wishlist_conversion_rate * 100:.1f}%",
            "Base Organic Ratio": f"{input_data.marketing.base_organic_ratio * 100:.1f}%",
            "Final Organic Ratio": f"{meta['organic_ratio'] * 100:.1f}%",
            "Sustaining Cost Ratio": f"{input_data.marketing.sustaining_cost_ratio * 100:.1f}%",
            "Package Price (₩)": f"{input_data.revenue.package_price:,}",
            "Use Ad Revenue": str(input_data.revenue.use_ad_revenue),
            "Live Events": ", ".join([e.name for e in input_data.live_events]) or "None"
        }
        pd.DataFrame(list(assumptions.items()), columns=["Parameter", "Value"]).to_excel(
            writer, sheet_name='Assumptions', index=False
        )
    
    output.seek(0)
    
    # 3. 파일 다운로드 응답
    filename = f"KPI_Projection_{input_data.genre}_{datetime.now().strftime('%Y%m%d_%H%M')}.xlsx"
    headers = {'Content-Disposition': f'attachment; filename="{filename}"'}
    
    return StreamingResponse(
        output,
        headers=headers,
        media_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    )

# ============================================================
# AI INSIGHT (OpenAI GPT-4o)
# ============================================================
class AIInsightRequest(BaseModel):
    projection_summary: Dict[str, Any]
    analysis_type: str = "executive_report"

def create_ai_prompt(summary: Dict[str, Any], analysis_type: str) -> str:
    """AI 분석 프롬프트 생성"""
    normal = summary.get("normal", {})
    
    bep_day = normal.get("bep_day", -1)
    bep_str = f"D+{bep_day}" if bep_day > 0 else "1년 내 미달성"
    
    return f"""
당신은 게임 비즈니스 컨설턴트입니다. 다음 KPI 시뮬레이션 결과를 분석해주세요.

[시뮬레이션 결과 - Normal Case]
- 총 매출: {normal.get('total_revenue', 0):,}원
- 총 비용: {normal.get('total_cost', 0):,}원
- 순이익: {normal.get('net_profit', 0):,}원
- ROI: {normal.get('roi', 0):.1f}%
- BEP: {bep_str}
- Paid ROAS: {normal.get('paid_roas', 0):.1f}%
- Blended ROAS: {normal.get('blended_roas', 0):.1f}%
- Paid CAC: {normal.get('cac_paid', 0):,}원
- 총 유입: {normal.get('total_nru', 0):,}명 (Paid: {normal.get('total_nru_paid', 0):,} / Organic: {normal.get('total_nru_organic', 0):,})

[요청사항]
1. 이 KPI가 현실적인지 평가 (시장 벤치마크 대비)
2. BEP 달성/수익 극대화를 위한 구체적 전략 3가지
3. 주요 리스크 요인 3가지

JSON 형식으로 응답해주세요:
{{
  "summary": "1-2문장 핵심 평가",
  "evaluation": "현실성 평가 (1-5점, 이유 포함)",
  "strategies": ["전략1", "전략2", "전략3"],
  "risks": ["리스크1", "리스크2", "리스크3"],
  "recommendations": "추가 권고사항"
}}
"""

def generate_mock_ai_report(summary: Dict[str, Any]) -> Dict:
    """API 키 없을 때 Mock 보고서"""
    normal = summary.get("normal", {})
    bep_day = normal.get("bep_day", -1)
    
    return {
        "summary": f"Normal 시나리오 기준 {'D+' + str(bep_day) + '에 BEP 달성 예상' if bep_day > 0 else 'BEP 미달성 위험'}입니다.",
        "evaluation": "3/5 - API 키가 설정되지 않아 상세 분석 불가",
        "strategies": [
            "UA 예산 효율화: CPA 최적화를 통한 유입 비용 절감",
            "리텐션 개선: D1/D7 리텐션 목표 대비 10% 상향",
            "ARPDAU 증대: 인앱 구매 및 광고 수익 최적화"
        ],
        "risks": [
            "시장 경쟁 심화로 인한 CPA 상승",
            "목표 리텐션 미달 시 DAU 급감",
            "라이브 서비스 비용 예상 초과"
        ],
        "recommendations": "OPENAI_API_KEY 환경변수를 설정하면 상세 AI 분석을 받을 수 있습니다."
    }

@app.post("/api/ai/insight")
async def get_ai_insight(request: AIInsightRequest):
    """OpenAI GPT-4o 기반 AI 인사이트"""
    
    if not OPENAI_API_KEY:
        return {
            "status": "mock",
            "model": "mock-fallback",
            "insight": generate_mock_ai_report(request.projection_summary)
        }
    
    try:
        prompt = create_ai_prompt(request.projection_summary, request.analysis_type)
        
        async with httpx.AsyncClient(timeout=60.0) as client:
            response = await client.post(
                OPENAI_API_URL,
                headers={
                    "Authorization": f"Bearer {OPENAI_API_KEY}",
                    "Content-Type": "application/json"
                },
                json={
                    "model": OPENAI_MODEL,
                    "messages": [
                        {"role": "system", "content": "당신은 게임 비즈니스 분석 전문가입니다. JSON 형식으로만 응답하세요."},
                        {"role": "user", "content": prompt}
                    ],
                    "response_format": {"type": "json_object"},
                    "temperature": 0.3
                }
            )
            
            response.raise_for_status()
            data = response.json()
            content = data['choices'][0]['message']['content']
            
            # JSON 파싱
            try:
                insight = json.loads(content)
            except json.JSONDecodeError:
                insight = {"summary": content, "strategies": [], "risks": []}
            
            return {
                "status": "success",
                "model": OPENAI_MODEL,
                "insight": insight
            }
            
    except httpx.HTTPStatusError as e:
        return {
            "status": "error",
            "model": OPENAI_MODEL,
            "error": f"API Error: {e.response.status_code}",
            "insight": generate_mock_ai_report(request.projection_summary)
        }
    except Exception as e:
        return {
            "status": "error",
            "model": OPENAI_MODEL,
            "error": str(e),
            "insight": generate_mock_ai_report(request.projection_summary)
        }

@app.get("/api/ai/status")
async def get_ai_status():
    """AI 서비스 상태 확인"""
    return {
        "enabled": bool(OPENAI_API_KEY),
        "provider": "OpenAI",
        "model": OPENAI_MODEL,
        "available_types": ["executive_report", "risk_analysis", "strategy"]
    }

# ============================================================
# UTILITY ENDPOINTS
# ============================================================
@app.get("/")
async def root():
    return {
        "message": "Game KPI Projection Engine",
        "version": "10.0.0",
        "ai_enabled": bool(OPENAI_API_KEY),
        "ai_provider": "OpenAI GPT-4o",
        "features": [
            "[R1] DAU D0 Fix",
            "[R3] Pre-launch CVR Fix",
            "[R5] Paid CAC Fix",
            "[R6] 365 Days Full Return",
            "[R8] BEP Calculation",
            "Excel Export",
            "OpenAI Integration"
        ]
    }

@app.get("/api/health")
async def health_check():
    return {"status": "healthy", "version": "10.0.0"}

@app.get("/api/raw-data")
async def get_raw_data():
    return load_raw_data()

@app.get("/api/config")
async def get_config():
    return load_config()

# ============================================================
# MAIN
# ============================================================
if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
