"""
Game KPI Projection - Backtest Runner V10.0
============================================
모델 정확도 검증을 위한 백테스트 스크립트

사용법:
    cd backend
    python backtest.py
"""

import json
import numpy as np
import os
import math
from typing import List, Dict

# ============================================================
# MODEL LOGIC (main.py에서 추출)
# ============================================================
def generate_retention_curve(d1: float, days: int, decay_power: float = -0.5) -> List[float]:
    """리텐션 커브 생성 (D1부터 시작)"""
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
    """내부 데이터와 벤치마크 블렌딩"""
    blended = []
    last_int_val = internal[-1] if internal else 0
    last_bench_val = benchmark[-1] if benchmark else 0
    
    for i in range(days):
        w_int = max(0.1, 0.9 - (0.8 * i / max(1, days - 1)))
        val_int = internal[i] if i < len(internal) else last_int_val
        val_bench = benchmark[i] if i < len(benchmark) else last_bench_val
        final_val = (val_int * w_int) + (val_bench * quality_mult * (1 - w_int))
        blended.append(max(0, final_val))
    
    return blended

# ============================================================
# BACKTEST RUNNER
# ============================================================
def run_backtest():
    """
    백테스트 실행
    - 내부 게임 데이터를 사용하여 모델 정확도 검증
    - D30까지 관측 → D60 예측 오차 측정
    """
    print("\n" + "=" * 60)
    print("🔬 Game KPI Projection Model - Backtest Runner V10.0")
    print("=" * 60)
    
    # 1. 데이터 로드
    data_path = os.path.join(os.path.dirname(__file__), "..", "data", "raw_game_data.json")
    
    if not os.path.exists(data_path):
        print("❌ Error: raw_game_data.json not found")
        print(f"   Expected path: {data_path}")
        return
    
    with open(data_path, "r", encoding='utf-8') as f:
        data = json.load(f)
    
    games = data.get('games', {}).get('retention', {})
    
    if not games:
        print("❌ Error: No retention data found in raw_game_data.json")
        return
    
    print(f"\n📊 Found {len(games)} games with retention data")
    
    results = []
    detailed_results = []
    
    # 2. 블라인드 테스트 수행
    print("\n📈 Running Blind Tests (D30 → D60 Prediction)...")
    print("-" * 60)
    
    for game_name, actual_curve in games.items():
        # 데이터가 너무 짧으면 스킵 (최소 60일 필요)
        if len(actual_curve) < 60:
            print(f"  ⚠️ {game_name}: Skipped (only {len(actual_curve)} days)")
            continue
        
        # Input: D1 값 (실제 관측)
        actual_d1 = actual_curve[0]
        
        # Prediction: Power Law 모델
        predicted_curve = generate_retention_curve(actual_d1, 60, -0.5)
        
        # 오차 계산 (D31 ~ D60 구간)
        errors = []
        for i in range(30, 60):
            actual = actual_curve[i]
            pred = predicted_curve[i]
            if actual > 0:
                err = abs(pred - actual) / actual
                errors.append(err)
        
        if errors:
            mape = np.mean(errors) * 100
            max_err = np.max(errors) * 100
            results.append({"name": game_name, "mape": mape, "max_err": max_err})
            detailed_results.append({
                "name": game_name,
                "d1_actual": actual_d1,
                "d30_actual": actual_curve[29] if len(actual_curve) > 29 else 0,
                "d30_pred": predicted_curve[29],
                "d60_actual": actual_curve[59] if len(actual_curve) > 59 else 0,
                "d60_pred": predicted_curve[59],
                "mape": mape
            })
            print(f"  ✓ {game_name:<25}: MAPE = {mape:.1f}%")
    
    # 3. 종합 리포트
    if results:
        print("\n" + "=" * 60)
        print("📊 BACKTEST SUMMARY REPORT")
        print("=" * 60)
        
        avg_mape = np.mean([r['mape'] for r in results])
        median_mape = np.median([r['mape'] for r in results])
        max_mape = np.max([r['mape'] for r in results])
        min_mape = np.min([r['mape'] for r in results])
        
        print(f"\n🎯 Overall Performance:")
        print(f"   - Games Tested: {len(results)}")
        print(f"   - Average MAPE: {avg_mape:.2f}%")
        print(f"   - Median MAPE:  {median_mape:.2f}%")
        print(f"   - Best Case:    {min_mape:.2f}%")
        print(f"   - Worst Case:   {max_mape:.2f}%")
        
        # 신뢰도 판정
        print("\n📋 Model Confidence Level:")
        if avg_mape < 15:
            print("   ✅ HIGH CONFIDENCE (오차율 15% 미만)")
            print("   → 의사결정 참고 자료로 활용 가능합니다.")
            confidence = "HIGH"
        elif avg_mape < 25:
            print("   ⚠️ MODERATE (오차율 15~25%)")
            print("   → Normal/Worst 시나리오 위주로 검토하세요.")
            confidence = "MODERATE"
        elif avg_mape < 35:
            print("   ⚠️ LOW-MODERATE (오차율 25~35%)")
            print("   → Worst 시나리오만 신뢰하세요.")
            confidence = "LOW-MODERATE"
        else:
            print("   ❌ LOW CONFIDENCE (오차율 35% 초과)")
            print("   → 모델 파라미터 재조정이 필요합니다.")
            confidence = "LOW"
        
        # Top 3 Best / Worst
        sorted_results = sorted(results, key=lambda x: x['mape'])
        
        print("\n🏆 Best Predictions (가장 정확한 게임):")
        for r in sorted_results[:3]:
            print(f"   - {r['name']}: {r['mape']:.1f}%")
        
        print("\n⚠️ Worst Predictions (가장 부정확한 게임):")
        for r in sorted_results[-3:]:
            print(f"   - {r['name']}: {r['mape']:.1f}%")
        
        # 상세 결과 출력
        print("\n📊 Detailed Results:")
        print("-" * 80)
        print(f"{'Game':<25} {'D1 Act':>8} {'D30 Act':>8} {'D30 Pred':>9} {'D60 Act':>8} {'D60 Pred':>9} {'MAPE':>8}")
        print("-" * 80)
        for d in detailed_results:
            print(f"{d['name']:<25} {d['d1_actual']:>8.3f} {d['d30_actual']:>8.3f} {d['d30_pred']:>9.3f} "
                  f"{d['d60_actual']:>8.3f} {d['d60_pred']:>9.3f} {d['mape']:>7.1f}%")
        
        # 결론
        print("\n" + "=" * 60)
        print("📝 CONCLUSION")
        print("=" * 60)
        print(f"   Model Version: V10.0")
        print(f"   Test Period: D31 ~ D60")
        print(f"   Confidence: {confidence}")
        print(f"   Average Error: {avg_mape:.1f}%")
        
        if confidence in ["HIGH", "MODERATE"]:
            print("\n   ✅ 이 모델은 의사결정 지원 도구로 활용 가능합니다.")
            print("   단, 장기 예측(D90+)은 추가 데이터가 필요합니다.")
        else:
            print("\n   ⚠️ 모델 개선이 필요합니다:")
            print("   1. Decay Power 파라미터 조정 (현재: -0.5)")
            print("   2. 장르/플랫폼별 세분화")
            print("   3. 더 많은 훈련 데이터 수집")
        
    else:
        print("\n⚠️ No games with 60+ days of data found.")
        print("   백테스트를 위해서는 최소 60일 이상의 리텐션 데이터가 필요합니다.")
    
    print("\n" + "=" * 60 + "\n")

# ============================================================
# MAIN
# ============================================================
if __name__ == "__main__":
    run_backtest()
