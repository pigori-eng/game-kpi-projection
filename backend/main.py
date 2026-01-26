from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Dict, Optional, Any
import numpy as np
from scipy.optimize import curve_fit
import json
import os

app = FastAPI(title="Game KPI Projection API", version="1.0.0")

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

def load_raw_data():
    with open(RAW_DATA_PATH, 'r', encoding='utf-8') as f:
        return json.load(f)

def load_config():
    with open(CONFIG_PATH, 'r', encoding='utf-8') as f:
        return json.load(f)

# Pydantic Models
class RetentionInput(BaseModel):
    selected_games: List[str]
    target_d1_retention: Dict[str, float]  # best, normal, worst

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

# Retention Curve: a * (day)^b
def retention_curve(x, a, b):
    return a * np.power(x, b)

def fit_retention_curve(retention_data: List[float]):
    """Fit power law curve to retention data"""
    days = np.arange(1, len(retention_data) + 1)
    retention = np.array(retention_data)
    
    # Filter out zeros and invalid values
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
        return popt[0], popt[1]  # a, b
    except:
        return retention_data[0], -0.5  # fallback

def calculate_retention_coefficients(selected_games: List[str], raw_data: dict):
    """Calculate average a, b coefficients from selected games"""
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
        return 1.0, -0.5  # default
    
    return np.mean(a_values), np.mean(b_values)

def generate_retention_curve(a: float, b: float, target_d1: float, days: int = 365):
    """Generate retention curve adjusted to target D+1 retention"""
    # Adjust 'a' so that day 1 retention equals target_d1
    adjusted_a = target_d1 / retention_curve(1, a, b) * a
    
    curve = []
    for day in range(1, days + 1):
        ret = retention_curve(day, adjusted_a, b)
        curve.append(min(max(ret, 0), 1))  # Clamp to [0, 1]
    
    return curve

def calculate_nru_pattern(selected_games: List[str], raw_data: dict, adjustment: float = 0):
    """Calculate NRU decay pattern from selected games"""
    nru_games = raw_data['games']['nru']
    
    # Find minimum length
    min_len = 365
    valid_games = []
    for game in selected_games:
        if game in nru_games:
            valid_games.append(game)
            min_len = min(min_len, len(nru_games[game]))
    
    if not valid_games:
        return [1.0] * 365
    
    # Calculate day-over-day change ratios
    daily_ratios = []
    for day in range(1, min_len):
        day_ratios = []
        for game in valid_games:
            data = nru_games[game]
            if data[day-1] > 0:
                ratio = data[day] / data[day-1]
                day_ratios.append(ratio)
        if day_ratios:
            avg_ratio = np.mean(day_ratios)
            # Apply adjustment
            adjusted_ratio = avg_ratio * (1 + adjustment)
            daily_ratios.append(adjusted_ratio)
        else:
            daily_ratios.append(0.9)
    
    # Extend to 365 days if needed
    while len(daily_ratios) < 364:
        daily_ratios.append(daily_ratios[-1] if daily_ratios else 0.95)
    
    return daily_ratios

def generate_nru_series(d1_nru: int, daily_ratios: List[float], days: int = 365):
    """Generate NRU series from D1 NRU and daily decay ratios"""
    nru_series = [d1_nru]
    current_nru = d1_nru
    
    for i in range(min(len(daily_ratios), days - 1)):
        current_nru = current_nru * daily_ratios[i]
        nru_series.append(max(int(current_nru), 0))
    
    return nru_series

def calculate_pr_pattern(selected_games: List[str], raw_data: dict, adjustment: float = 0):
    """Calculate payment rate pattern from selected games"""
    pr_games = raw_data['games']['payment_rate']
    
    valid_games = [g for g in selected_games if g in pr_games]
    if not valid_games:
        return [0.02] * 365
    
    min_len = min(len(pr_games[g]) for g in valid_games)
    
    pattern = []
    for day in range(min_len):
        day_values = [pr_games[g][day] for g in valid_games if day < len(pr_games[g])]
        avg_pr = np.mean(day_values) if day_values else 0.02
        pattern.append(avg_pr * (1 + adjustment))
    
    while len(pattern) < 365:
        pattern.append(pattern[-1] if pattern else 0.02)
    
    return pattern[:365]

def calculate_arppu_pattern(selected_games: List[str], raw_data: dict, adjustment: float = 0):
    """Calculate ARPPU pattern from selected games"""
    arppu_games = raw_data['games']['arppu']
    
    valid_games = [g for g in selected_games if g in arppu_games]
    if not valid_games:
        return [50000] * 365
    
    min_len = min(len(arppu_games[g]) for g in valid_games)
    
    pattern = []
    for day in range(min_len):
        day_values = [arppu_games[g][day] for g in valid_games if day < len(arppu_games[g])]
        avg_arppu = np.mean(day_values) if day_values else 50000
        pattern.append(avg_arppu * (1 + adjustment))
    
    while len(pattern) < 365:
        pattern.append(pattern[-1] if pattern else 50000)
    
    return pattern[:365]

def calculate_dau_matrix(nru_series: List[int], retention_curve: List[float], days: int = 365):
    """Calculate DAU using cohort-based matrix calculation"""
    dau_matrix = np.zeros((days, days))
    
    for cohort_day in range(days):
        nru = nru_series[cohort_day] if cohort_day < len(nru_series) else 0
        for active_day in range(cohort_day, days):
            days_since_install = active_day - cohort_day
            if days_since_install < len(retention_curve):
                retention = retention_curve[days_since_install]
                dau_matrix[cohort_day, active_day] = nru * retention
    
    # Sum columns to get daily DAU
    daily_dau = np.sum(dau_matrix, axis=0)
    return daily_dau.tolist()

def calculate_revenue(dau: List[float], pr: List[float], arppu: List[float]):
    """Calculate daily revenue"""
    revenue = []
    for i in range(len(dau)):
        pr_val = pr[i] if i < len(pr) else pr[-1]
        arppu_val = arppu[i] if i < len(arppu) else arppu[-1]
        revenue.append(dau[i] * pr_val * arppu_val)
    return revenue

# API Endpoints
@app.get("/")
async def root():
    return {"message": "Game KPI Projection API", "version": "1.0.0"}

@app.get("/api/games")
async def get_available_games():
    """Get list of available games for each metric"""
    raw_data = load_raw_data()
    return {
        "retention": list(raw_data['games']['retention'].keys()),
        "nru": list(raw_data['games']['nru'].keys()),
        "payment_rate": list(raw_data['games']['payment_rate'].keys()),
        "arppu": list(raw_data['games']['arppu'].keys())
    }

@app.get("/api/games/{metric}/{game_name}")
async def get_game_data(metric: str, game_name: str):
    """Get specific game data"""
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
    """Get default configuration"""
    return load_config()

@app.post("/api/projection")
async def calculate_projection(input_data: ProjectionInput):
    """Calculate full KPI projection"""
    raw_data = load_raw_data()
    
    days = input_data.projection_days
    results = {"best": {}, "normal": {}, "worst": {}}
    
    # Calculate retention coefficients
    a, b = calculate_retention_coefficients(
        input_data.retention.selected_games, 
        raw_data
    )
    
    for scenario in ["best", "normal", "worst"]:
        # 1. Retention curve
        target_d1 = input_data.retention.target_d1_retention[scenario]
        ret_curve = generate_retention_curve(a, b, target_d1, days)
        
        # 2. NRU series
        adjustment = 0
        if scenario == "best":
            adjustment = input_data.nru.adjustment.get("best_vs_normal", -0.1)
        elif scenario == "worst":
            adjustment = input_data.nru.adjustment.get("worst_vs_normal", 0.1)
        
        nru_ratios = calculate_nru_pattern(
            input_data.nru.selected_games, 
            raw_data, 
            adjustment
        )
        d1_nru = input_data.nru.d1_nru[scenario]
        nru_series = generate_nru_series(d1_nru, nru_ratios, days)
        
        # 3. DAU calculation
        dau_series = calculate_dau_matrix(nru_series, ret_curve, days)
        
        # 4. Payment rate
        pr_adj = 0
        if scenario == "best":
            pr_adj = input_data.revenue.pr_adjustment.get("best_vs_normal", -0.03)
        elif scenario == "worst":
            pr_adj = input_data.revenue.pr_adjustment.get("worst_vs_normal", 0.01)
        
        pr_series = calculate_pr_pattern(
            input_data.revenue.selected_games_pr, 
            raw_data, 
            pr_adj
        )
        
        # 5. ARPPU
        arppu_adj = 0
        if scenario == "best":
            arppu_adj = input_data.revenue.arppu_adjustment.get("best_vs_normal", -0.05)
        elif scenario == "worst":
            arppu_adj = input_data.revenue.arppu_adjustment.get("worst_vs_normal", 0.05)
        
        arppu_series = calculate_arppu_pattern(
            input_data.revenue.selected_games_arppu, 
            raw_data, 
            arppu_adj
        )
        
        # 6. Revenue calculation
        revenue_series = calculate_revenue(dau_series, pr_series, arppu_series)
        
        # Store results
        results[scenario] = {
            "retention": {
                "coefficients": {"a": a, "b": b},
                "target_d1": target_d1,
                "curve": ret_curve[:90]  # First 90 days for display
            },
            "nru": {
                "d1_nru": d1_nru,
                "series": nru_series[:90],
                "total": sum(nru_series)
            },
            "dau": {
                "series": [int(d) for d in dau_series[:90]],
                "peak": int(max(dau_series)),
                "average": int(np.mean(dau_series))
            },
            "revenue": {
                "pr_series": pr_series[:90],
                "arppu_series": arppu_series[:90],
                "daily_revenue": revenue_series[:90],
                "total_gross": sum(revenue_series),
                "average_daily": np.mean(revenue_series)
            },
            "full_data": {
                "nru": nru_series,
                "dau": [int(d) for d in dau_series],
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
        net = gross * (1 - basic.get("market_fee_ratio", 0.3) - basic.get("vat_ratio", 0.1) - basic.get("infrastructure_cost_ratio", 0.03))
        
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

@app.get("/api/raw-data")
async def get_raw_data():
    """Get all raw game data"""
    return load_raw_data()

@app.post("/api/raw-data/upload")
async def upload_game_data(file: UploadFile = File(...), metric: str = "retention"):
    """Upload new game data via CSV"""
    if not file.filename.endswith('.csv'):
        raise HTTPException(status_code=400, detail="Only CSV files are supported")
    
    import pandas as pd
    from io import StringIO
    
    content = await file.read()
    df = pd.read_csv(StringIO(content.decode('utf-8')))
    
    # Expected CSV format: game_name, day1, day2, day3, ...
    raw_data = load_raw_data()
    
    for _, row in df.iterrows():
        game_name = row.iloc[0]
        values = row.iloc[1:].tolist()
        values = [float(v) for v in values if pd.notna(v)]
        
        if metric in raw_data['games']:
            raw_data['games'][metric][game_name] = values
    
    # Update metadata
    raw_data['metadata'][f'{metric}_games'] = list(raw_data['games'][metric].keys())
    
    # Save updated data
    with open(RAW_DATA_PATH, 'w', encoding='utf-8') as f:
        json.dump(raw_data, f, ensure_ascii=False, indent=2)
    
    return {"status": "success", "message": f"Added/updated games in {metric}"}

@app.delete("/api/raw-data/{metric}/{game_name}")
async def delete_game_data(metric: str, game_name: str):
    """Delete a game from raw data"""
    raw_data = load_raw_data()
    
    if metric not in raw_data['games']:
        raise HTTPException(status_code=404, detail=f"Metric '{metric}' not found")
    
    if game_name not in raw_data['games'][metric]:
        raise HTTPException(status_code=404, detail=f"Game '{game_name}' not found")
    
    del raw_data['games'][metric][game_name]
    raw_data['metadata'][f'{metric}_games'] = list(raw_data['games'][metric].keys())
    
    with open(RAW_DATA_PATH, 'w', encoding='utf-8') as f:
        json.dump(raw_data, f, ensure_ascii=False, indent=2)
    
    return {"status": "success", "message": f"Deleted {game_name} from {metric}"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
