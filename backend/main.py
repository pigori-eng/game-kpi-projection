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

# Gemini API Configuration
GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY", "")
GEMINI_API_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-3-pro:generateContent"

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

def generate_nru_series(d1_nru: int, daily_ratios: List[float], days: int = 365):
    nru_series = [d1_nru]
    current_nru = float(d1_nru)
    
    for i in range(min(len(daily_ratios), days - 1)):
        current_nru = current_nru * daily_ratios[i]
        nru_series.append(max(int(current_nru), 1))
    
    while len(nru_series) < days:
        nru_series.append(max(int(nru_series[-1] * 0.98), 1))
    
    return nru_series

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
    revenue = []
    for i in range(len(dau)):
        pr_val = pr[i] if i < len(pr) else pr[-1]
        arppu_val = arppu[i] if i < len(arppu) else arppu[-1]
        revenue.append(dau[i] * pr_val * arppu_val)
    return revenue

# Gemini AI Integration
async def get_gemini_insight(prompt: str) -> str:
    """Call Gemini API for AI insights"""
    if not GEMINI_API_KEY:
        return "AI 인사이트를 사용하려면 GEMINI_API_KEY 환경변수를 설정해주세요."
    
    try:
        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{GEMINI_API_URL}?key={GEMINI_API_KEY}",
                json={
                    "contents": [{
                        "parts": [{"text": prompt}]
                    }],
                    "generationConfig": {
                        "temperature": 0.7,
                        "maxOutputTokens": 1024
                    }
                },
                timeout=30.0
            )
            
            if response.status_code == 200:
                data = response.json()
                return data["candidates"][0]["content"]["parts"][0]["text"]
            else:
                return f"AI 분석 오류: {response.status_code}"
    except Exception as e:
        return f"AI 연결 실패: {str(e)}"

def create_insight_prompt(summary: Dict[str, Any], analysis_type: str) -> str:
    """Create prompt for Gemini based on analysis type"""
    
    base_context = f"""
당신은 게임 산업 전문 데이터 분석가입니다. 아래 게임 KPI 프로젝션 결과를 분석하고 인사이트를 제공해주세요.

## 프로젝션 결과 요약:
- 프로젝션 기간: {summary.get('projection_days', 365)}일
- 런칭일: {summary.get('launch_date', 'N/A')}

### Best 시나리오:
- 총 Gross Revenue: {summary.get('best', {}).get('gross_revenue', 0):,.0f}원
- 총 NRU: {summary.get('best', {}).get('total_nru', 0):,}명
- Peak DAU: {summary.get('best', {}).get('peak_dau', 0):,}명
- 평균 DAU: {summary.get('best', {}).get('average_dau', 0):,}명

### Normal 시나리오:
- 총 Gross Revenue: {summary.get('normal', {}).get('gross_revenue', 0):,.0f}원
- 총 NRU: {summary.get('normal', {}).get('total_nru', 0):,}명
- Peak DAU: {summary.get('normal', {}).get('peak_dau', 0):,}명
- 평균 DAU: {summary.get('normal', {}).get('average_dau', 0):,}명

### Worst 시나리오:
- 총 Gross Revenue: {summary.get('worst', {}).get('gross_revenue', 0):,.0f}원
- 총 NRU: {summary.get('worst', {}).get('total_nru', 0):,}명
- Peak DAU: {summary.get('worst', {}).get('peak_dau', 0):,}명
- 평균 DAU: {summary.get('worst', {}).get('average_dau', 0):,}명
"""
    
    type_prompts = {
        "general": """
위 데이터를 바탕으로 다음을 분석해주세요:
1. 전반적인 프로젝션 평가 (낙관적/현실적/비관적 시나리오 간 차이 분석)
2. 주요 성과 지표에 대한 코멘트
3. 의사결정자에게 권장하는 액션 아이템 3가지
한국어로 간결하게 답변해주세요 (300자 이내).
""",
        "reliability": """
이 프로젝션의 신뢰도를 종합적으로 평가해주세요:
1. **신뢰도 점수** (100점 만점): 표본 데이터의 품질, Best/Normal/Worst 간 편차, 시장 일반적인 KPI 대비 현실성을 고려하여 점수 산정
2. **신뢰도 등급** (A/B/C/D/F): 해당 점수에 맞는 등급
3. **주요 신뢰도 영향 요인**: 신뢰도에 긍정적/부정적으로 영향을 미치는 요소 각 2개씩
4. **신뢰도 향상을 위한 제안**: 프로젝션 정확도를 높이기 위해 추가로 검토해야 할 사항
한국어로 답변해주세요 (400자 이내).
""",
        "retention": """
리텐션 관점에서 분석해주세요:
1. DAU 패턴이 건강한지 평가
2. 리텐션 개선을 위한 구체적인 제안 2가지
3. 비슷한 장르 게임 대비 예상 성과 평가
한국어로 간결하게 답변해주세요 (300자 이내).
""",
        "revenue": """
매출 관점에서 분석해주세요:
1. 매출 예측의 현실성 평가
2. 매출 극대화를 위한 구체적 제안 2가지
3. 손익분기점 예상 시점 (가능하다면)
한국어로 간결하게 답변해주세요 (300자 이내).
""",
        "risk": """
리스크 관점에서 분석해주세요:
1. Best와 Worst 시나리오 간 편차 분석 및 리스크 수준 평가
2. 가장 주의해야 할 리스크 요인 2가지
3. 리스크 완화 전략 제안
한국어로 간결하게 답변해주세요 (300자 이내).
""",
        "competitive": """
경쟁력 관점에서 분석해주세요:
1. 예상 지표가 시장에서 경쟁력이 있는지 평가
2. 차별화를 위한 전략적 제안 2가지
3. 타겟 시장 포지셔닝 조언
한국어로 간결하게 답변해주세요 (300자 이내).
"""
    }
    
    return base_context + type_prompts.get(analysis_type, type_prompts["general"])

# API Endpoints
@app.get("/")
async def root():
    return {"message": "Game KPI Projection API", "version": "2.0.0", "ai_enabled": bool(GEMINI_API_KEY)}

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
    
    # Calculate coefficients
    a, b = calculate_retention_coefficients(input_data.retention.selected_games, raw_data)
    nru_ratios = calculate_nru_pattern(input_data.nru.selected_games, raw_data)
    pr_pattern = calculate_pr_pattern(input_data.revenue.selected_games_pr, raw_data)
    arppu_pattern = calculate_arppu_pattern(input_data.revenue.selected_games_arppu, raw_data)
    
    for scenario in ["best", "normal", "worst"]:
        target_d1 = input_data.retention.target_d1_retention[scenario]
        ret_curve = generate_retention_curve(a, b, target_d1, days)
        
        d1_nru = input_data.nru.d1_nru[scenario]
        adjusted_ratios = nru_ratios.copy()
        if scenario == "best":
            adjusted_ratios = [min(r * 1.02, 1.0) for r in nru_ratios]
        elif scenario == "worst":
            adjusted_ratios = [r * 0.98 for r in nru_ratios]
        
        nru_series = generate_nru_series(d1_nru, adjusted_ratios, days)
        dau_series = calculate_dau_matrix(nru_series, ret_curve, days)
        
        pr_adj = 0
        if scenario == "best":
            pr_adj = input_data.revenue.pr_adjustment.get("best_vs_normal", 0)
        elif scenario == "worst":
            pr_adj = input_data.revenue.pr_adjustment.get("worst_vs_normal", 0)
        
        pr_series = [p * (1 + pr_adj) for p in pr_pattern]
        
        arppu_adj = 0
        if scenario == "best":
            arppu_adj = input_data.revenue.arppu_adjustment.get("best_vs_normal", 0)
        elif scenario == "worst":
            arppu_adj = input_data.revenue.arppu_adjustment.get("worst_vs_normal", 0)
        
        arppu_series = [a * (1 + arppu_adj) for a in arppu_pattern]
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
        "summary": summary,
        "results": results
    }

# AI Insight Endpoint
@app.post("/api/ai/insight")
async def get_ai_insight(request: AIInsightRequest):
    """Get AI-powered insights for projection results"""
    prompt = create_insight_prompt(request.projection_summary, request.analysis_type)
    insight = await get_gemini_insight(prompt)
    
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
        "enabled": bool(GEMINI_API_KEY),
        "model": "gemini-3-pro",
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
