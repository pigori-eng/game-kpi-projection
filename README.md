# 🎮 Game KPI Projection Tool

회귀분석 및 벤치마크 기반의 게임 KPI 예측 시뮬레이션 도구입니다.  
내부 표본 게임 데이터와 시장 벤치마크를 블렌딩하여 Retention, NRU, DAU, Revenue를 365일간 예측합니다.

---

## 📑 목차

1. [시스템 개요](#1-시스템-개요)
2. [아키텍처](#2-아키텍처)
3. [Retention 계산](#3-retention-계산)
4. [NRU 계산](#4-nru-계산)
5. [DAU 계산](#5-dau-계산)
6. [Revenue 계산](#6-revenue-계산)
7. [마케팅 효율 계산](#7-마케팅-효율-계산)
8. [시나리오 보정](#8-시나리오-보정)
9. [계절성 적용](#9-계절성-적용)
10. [Debug 정보](#10-debug-정보)
11. [입력 파라미터](#11-입력-파라미터)
12. [API 엔드포인트](#12-api-엔드포인트)
13. [배포 가이드](#13-배포-가이드)

---

## 1. 시스템 개요

### 1.1 목적

- **사전 기획 단계**에서 게임의 예상 KPI를 시뮬레이션
- **마케팅 예산** 투입 대비 **ROI/ROAS** 예측
- **Best / Normal / Worst** 3가지 시나리오 비교 분석
- **BEP(손익분기점)** 달성 가능성 검토

### 1.2 데이터 소스

| 구분 | 설명 |
|------|------|
| 내부 표본 | 자사 출시 게임 15종의 실제 KPI 데이터 (365일) |
| 시장 벤치마크 | SensorTower, Newzoo 등 공개 데이터 기반 장르/플랫폼별 평균값 |

### 1.3 핵심 계산 흐름

```
[입력]                    [계산 엔진]                    [출력]
────────────────────────────────────────────────────────────────
표본 게임 선택    →    Retention Curve 회귀분석    →    일별 Retention
마케팅 예산 입력  →    NRU 시리즈 생성            →    일별 NRU
                  →    DAU 코호트 매트릭스        →    일별 DAU
PR/ARPPU 설정    →    Revenue 계산               →    일별/총 매출
────────────────────────────────────────────────────────────────
```

---

## 2. 아키텍처

### 2.1 기술 스택

| 구성요소 | 기술 |
|----------|------|
| Frontend | React 18 + TypeScript + Vite |
| Backend | FastAPI (Python 3.11+) |
| Styling | Tailwind CSS |
| Charts | Recharts |
| Hosting | Vercel (Frontend) + Render (Backend) |

### 2.2 디렉토리 구조

```
game-kpi-projection/
├── frontend/
│   └── src/
│       ├── components/
│       │   ├── InputPanel.tsx      # 입력 패널
│       │   ├── ResultsPanel.tsx    # 결과 표시
│       │   └── AIInsightPanel.tsx  # AI 분석
│       ├── types/index.ts          # 타입 정의
│       └── utils/api.ts            # API 호출
├── backend/
│   └── main.py                     # FastAPI 서버 + 계산 엔진
└── data/
    ├── raw_game_data.json          # 표본 게임 데이터
    └── default_config.json         # 기본 설정값
```

---

## 3. Retention 계산

### 3.1 Power Law 모델

Retention Curve는 **Power Law 함수**로 모델링합니다.

```
Retention(d) = a × d^b
```

| 파라미터 | 설명 | 일반적 범위 |
|----------|------|-------------|
| `a` | 초기 계수 (D1 기준) | 0.8 ~ 1.5 |
| `b` | 감쇠 계수 (기울기) | -0.5 ~ -1.2 |
| `d` | 경과 일수 | 1 ~ 365 |

### 3.2 회귀분석 방법

선택된 표본 게임들의 30일 리텐션 데이터를 **로그 스케일**로 변환 후 **선형 회귀분석**을 수행합니다.

```python
# 1. 로그 변환
log_days = np.log(days)           # X축: log(일수)
log_retention = np.log(retention) # Y축: log(리텐션)

# 2. 선형 회귀 (y = mx + c)
slope, intercept = np.polyfit(log_days, log_retention, 1)

# 3. Power Law 파라미터 도출
b = slope           # 감쇠 계수
a = np.exp(intercept)  # 초기 계수
```

### 3.3 2-Stage Retention (선택적)

장기 리텐션의 급격한 하락을 방지하기 위해 D30 이후 별도의 감쇠율을 적용합니다.

```python
if day <= 30:
    retention = a * (day ** b)
else:
    # Stage 2: 완만한 감쇠
    d30_retention = a * (30 ** b)
    stage2_decay = liveops_decay_rate / 10  # LiveOps 강도에 따라 조절
    months_after = (day - 30) / 30
    retention = d30_retention * np.exp(-stage2_decay * months_after)
```

### 3.4 D30 Retention 보정

계산된 D30 Retention이 장르/플랫폼별 벤치마크의 70% 미만일 경우, `b` 값을 자동 조정합니다.

```python
# 벤치마크 대비 검증
benchmark_d30 = BENCHMARK_D30_RETENTION[genre][platform]
calculated_d30 = a * (30 ** b)

if calculated_d30 < benchmark_d30 * 0.7:
    # b값 완화 (감쇠 속도 낮춤)
    target_d30 = benchmark_d30 * 0.7
    adjusted_b = np.log(target_d30 / a) / np.log(30)
```

### 3.5 장르/플랫폼별 D30 벤치마크

```python
BENCHMARK_D30_RETENTION = {
    "MMORPG": {"Mobile": 0.12, "PC": 0.15, "Console": 0.14},
    "RPG": {"Mobile": 0.08, "PC": 0.12, "Console": 0.10},
    "Action": {"Mobile": 0.06, "PC": 0.10, "Console": 0.09},
    "FPS/TPS": {"Mobile": 0.06, "PC": 0.09, "Console": 0.08},
    "Battle Royale": {"Mobile": 0.07, "PC": 0.08, "Console": 0.07},
    "Strategy": {"Mobile": 0.10, "PC": 0.12, "Console": 0.10},
    "Casual": {"Mobile": 0.12, "PC": 0.08, "Console": 0.06},
    "Puzzle": {"Mobile": 0.15, "PC": 0.10, "Console": 0.08},
    # ...
}
```

---

## 4. NRU 계산

### 4.1 NRU 구성 요소

```
Total NRU = Pre-Launch NRU + Post-Launch Paid NRU + Organic NRU
```

| 구성 요소 | 설명 |
|-----------|------|
| Pre-Launch NRU | 사전예약/위시리스트 전환 유저 (D1~D3 집중) |
| Post-Launch Paid NRU | 런칭 마케팅으로 획득한 유저 (D1~D30) |
| Organic NRU | 자연 유입 유저 (브랜딩 효과 포함) |

### 4.2 Pre-Launch (사전예약/위시리스트)

**저수지(Reservoir) 모델**: 사전 마케팅 기간 동안 축적된 유저가 D1에 폭발적으로 유입됩니다.

```python
# 1. 사전 마케팅 예산 분리
pre_launch_ua = ua_budget * pre_marketing_ratio

# 2. CPW(Cost Per Wishlist) 계산 - 플랫폼별 차등
cpw_ratio = {
    "Mobile": 0.2,   # 사전예약 쉬움
    "PC": 0.3,       # 위시리스트 어려움
    "Console": 0.3
}
cpw = effective_cpa * cpw_ratio[platform]

# 3. 위시리스트 모수 산출
wishlist_pool_paid = pre_launch_ua / cpw
wishlist_pool_organic = wishlist_pool_paid * organic_ratio * 1.5  # 바이럴 효과
wishlist_users = wishlist_pool_paid + wishlist_pool_organic

# 4. 전환율 적용 → D1 Burst
d1_burst_users = wishlist_users * wishlist_conversion_rate

# 5. D1~D3 분배
burst_distribution = [0.80, 0.10, 0.10]  # D1: 80%, D2: 10%, D3: 10%
```

### 4.3 Post-Launch Paid NRU

런칭 후 30일간 UA 예산으로 획득하는 유저입니다.

```python
# 1. Post-Launch 예산
post_launch_ua = ua_budget - pre_launch_ua

# 2. Paid NRU 계산 (CPA Saturation 적용)
post_launch_paid_nru = post_launch_ua / effective_cpa

# 3. 30일간 Area Normalization으로 분배
# 감쇠 패턴: day^-0.8 (초반 집중, 점진적 감소)
nru_decay_pattern = [1.0 / (t ** 0.8) for t in range(1, 31)]
pattern_area = sum(nru_decay_pattern)
d1_scale = post_launch_paid_nru / pattern_area

for day in range(30):
    daily_nru = d1_scale * nru_decay_pattern[day]
```

### 4.4 Organic NRU

브랜딩 예산에 의해 증폭되는 자연 유입입니다.

```python
# 1. Organic Boost Factor 계산
organic_boost = 1 + ln(1 + brand_budget / ua_budget) * 0.7

# 2. Organic NRU 총량
organic_nru_total = total_paid_nru * base_organic_ratio * organic_boost

# 3. Brand Time-Lag Effect (Bell Curve)
# D15에 피크, D1~D60에 걸쳐 분포
for day in range(365):
    effect = exp(-0.5 * ((day - 15) / 20)^2)
    organic_daily = organic_nru_total * normalized_effect[day]
```

### 4.5 Sustaining NRU (D31~D365)

런칭 이후 유지 마케팅 예산으로 획득하는 일일 유입입니다.

```python
# 1. 예산 기반 Paid NRU
monthly_sustaining_paid = sustaining_budget_monthly / effective_cpa
daily_sustaining_paid = monthly_sustaining_paid / 30

# 2. Organic Floor (LiveOps 강도별)
base_organic_floor = d30_nru * floor_ratio
organic_floor = max(base_organic_floor, MIN_SUSTAINING_NRU[platform])

# 3. 최종 Sustaining NRU
for day in range(30, 365):
    months_after = (day - 30) / 30
    organic_decay = base_organic_floor * exp(-decay_rate * months_after)
    daily_sustaining = daily_sustaining_paid + max(organic_decay, organic_floor)
    nru_series[day] += daily_sustaining
```

### 4.6 플랫폼별 최소 Sustaining NRU

```python
MIN_SUSTAINING_NRU = {
    "PC": 300,      # 최소 일 300명
    "Mobile": 500,  # 최소 일 500명
    "Console": 200  # 최소 일 200명
}
```

---

## 5. DAU 계산

### 5.1 코호트 매트릭스 방식

각 일자에 유입된 NRU가 이후 며칠간 잔존하는지를 **코호트 매트릭스**로 계산합니다.

```
DAU(d) = Σ NRU(i) × Retention(d - i)
         i=1 to d
```

### 5.2 구현 로직

```python
def calculate_dau_matrix(nru_series, retention_curve, days=365):
    """
    코호트 매트릭스 방식 DAU 계산
    
    Args:
        nru_series: 일별 신규 유입자 수 [NRU_d1, NRU_d2, ...]
        retention_curve: 일별 잔존율 [Ret_d1, Ret_d2, ...]
        days: 계산 기간
    
    Returns:
        dau_series: 일별 DAU [DAU_d1, DAU_d2, ...]
    """
    dau_series = []
    
    for day in range(days):
        daily_dau = 0
        for cohort_day in range(day + 1):
            nru = nru_series[cohort_day]
            days_since_install = day - cohort_day
            retention = retention_curve[days_since_install] if days_since_install < len(retention_curve) else retention_curve[-1]
            daily_dau += nru * retention
        dau_series.append(int(daily_dau))
    
    return dau_series
```

### 5.3 예시

| Day | NRU | Retention | 코호트 기여분 | DAU |
|-----|-----|-----------|--------------|-----|
| D1 | 10,000 | 100% | 10,000 | 10,000 |
| D2 | 8,000 | D1: 40%, D2: 100% | 10,000×0.4 + 8,000×1.0 | 12,000 |
| D3 | 6,000 | D1: 30%, D2: 40%, D3: 100% | 3,000 + 3,200 + 6,000 | 12,200 |

---

## 6. Revenue 계산

### 6.1 기본 공식

```
Daily Revenue = DAU × Payment Rate × ARPPU
```

| 요소 | 설명 | 일반적 범위 |
|------|------|-------------|
| DAU | 일간 활성 사용자 | - |
| Payment Rate (PR) | 결제 유저 비율 | 2% ~ 10% |
| ARPPU | 결제 유저당 평균 결제액 | ₩30,000 ~ ₩100,000/월 |

### 6.2 Payment Rate 계산

표본 게임의 PR 패턴을 블렌딩하여 일별 PR을 산출합니다.

```python
# 1. 표본 게임 PR 평균
sample_pr = average([game_pr[day] for game in selected_games])

# 2. 벤치마크 PR (장르/플랫폼별)
benchmark_pr = BENCHMARK_PR[genre][platform]

# 3. 블렌딩 (가중치 적용)
blended_pr = sample_pr * weight + benchmark_pr * (1 - weight)

# 4. Quality Score 보정
quality_multiplier = {
    "S": 1.30,  # +30%
    "A": 1.15,  # +15%
    "B": 1.00,  # 기준
    "C": 0.85,  # -15%
    "D": 0.70   # -30%
}
final_pr = blended_pr * quality_multiplier[quality_score]
```

### 6.3 ARPPU 계산

```python
# 1. 표본 게임 ARPPU 평균 (월간)
sample_arppu_monthly = average([game_arppu[day] for game in selected_games])

# 2. 일간 ARPPU로 변환
sample_arppu_daily = sample_arppu_monthly / 30

# 3. 벤치마크 블렌딩
benchmark_arppu = BENCHMARK_ARPPU[genre][platform]
blended_arppu = sample_arppu_daily * weight + benchmark_arppu * (1 - weight)

# 4. BM Type 보정
bm_multiplier = {
    "Hardcore": 1.20,
    "Gacha": 1.15,
    "Midcore": 1.00,
    "Casual": 0.80,
    "Hyper-casual": 0.50
}
final_arppu = blended_arppu * bm_multiplier[bm_type]
```

### 6.4 사용자 직접 입력 (CBT 데이터)

CBT(Closed Beta Test) 결과가 있는 경우, 벤치마크 대신 직접 입력값을 사용합니다.

```python
if custom_pr is not None and custom_pr > 0:
    final_pr = custom_pr  # 사용자 PR 입력 사용

if custom_arppu is not None and custom_arppu > 0:
    # 월간 입력인 경우 일간으로 변환
    final_arppu = custom_arppu / 30 if arppu_unit == "monthly" else custom_arppu
```

### 6.5 패키지 매출 (PC/Console)

B2P(Buy-to-Play) 게임의 경우 패키지 판매 매출을 추가합니다.

```python
if package_price > 0:
    # 신규 유저의 일정 비율이 패키지 구매
    package_conversion_rate = 0.8  # 80%
    daily_package_revenue = nru_series[day] * package_price * package_conversion_rate
    total_daily_revenue = iap_revenue + daily_package_revenue
```

### 6.6 Net Revenue 계산

```python
# Gross → Net 변환
gross_revenue = sum(daily_revenues)

# 공제 항목
market_fee = gross_revenue * market_fee_ratio    # 마켓 수수료 (30%)
vat = gross_revenue * vat_ratio                   # 부가세 (10%)
infra_cost = gross_revenue * infra_cost_ratio    # 인프라 비용 (3%)

net_revenue = gross_revenue - market_fee - vat - infra_cost
```

---

## 7. 마케팅 효율 계산

### 7.1 CPA Saturation (마케팅 효율 체감)

UA 예산이 증가할수록 CPA가 상승하는 **시장 포화 효과**를 반영합니다.

```python
def calculate_marketing_efficiency(ua_budget, brand_budget, target_cpa):
    """
    CPA Saturation 계산
    
    핵심 원리:
    - 예산이 임계값을 초과하면 효율 좋은 유저가 고갈됨
    - 브랜드 예산이 임계값을 높여서 효율 저하를 방어
    """
    
    # 1. 브랜드 예산 비율로 임계값 상향
    brand_ratio = brand_budget / max(1, ua_budget)
    adjusted_threshold = 500_000_000 * (1 + min(1.0, brand_ratio))
    
    # 2. 예산 스케일 계산
    budget_scale = ua_budget / adjusted_threshold
    
    # 3. Saturation Factor (로그 함수)
    if budget_scale > 1.0:
        saturation_factor = 1.0 + ln(budget_scale) * 0.15
    else:
        saturation_factor = 1.0
    
    # 4. Effective CPA
    effective_cpa = target_cpa * saturation_factor
    
    return {
        "effective_cpa": effective_cpa,
        "saturation_factor": saturation_factor,
        "brand_efficiency_bonus": brand_ratio * 100
    }
```

### 7.2 Saturation Factor 예시

| UA 예산 | Brand 예산 | Threshold | Scale | Factor | Effective CPA |
|---------|-----------|-----------|-------|--------|---------------|
| 3억 | 0 | 5억 | 0.6 | 1.00 | ₩10,000 |
| 10억 | 0 | 5억 | 2.0 | 1.10 | ₩11,000 |
| 50억 | 0 | 5억 | 10.0 | 1.35 | ₩13,500 |
| 50억 | 25억 | 7.5억 | 6.7 | 1.28 | ₩12,800 |

### 7.3 ROAS 계산

```python
# Paid ROAS (마케터용): UA 투자 효율
paid_roas = (gross_revenue / ua_budget) * 100

# Blended ROAS (경영진용): 전체 마케팅 효율
total_marketing = ua_budget + brand_budget + (sustaining_monthly * 12)
blended_roas = (gross_revenue / total_marketing) * 100
```

### 7.4 LTV / CAC 계산

```python
# LTV: 유저당 평생 가치
ltv = gross_revenue / total_nru

# CAC (Paid): UA 비용 기준
cac_paid = ua_budget / paid_nru

# CAC (Blended): 전체 마케팅 비용 기준
cac_blended = total_marketing / total_nru

# LTV/CAC 비율 (3.0 이상이 건강한 수준)
ltv_cac_ratio = ltv / cac_blended
```

---

## 8. 시나리오 보정

### 8.1 3가지 시나리오

| 시나리오 | 설명 | 보정 방향 |
|----------|------|----------|
| Best | 낙관적 | 마케팅 효율 +10%, Retention +10%, PR +5%, ARPPU +5% |
| Normal | 기준 | 보정 없음 |
| Worst | 비관적 | 마케팅 효율 -10%, Retention -10%, PR -5%, ARPPU -5% |

### 8.2 시나리오별 보정 적용

```python
# D1 Retention 보정
d1_best = target_d1 * (1 + best_vs_normal)    # 예: 40% → 44%
d1_normal = target_d1
d1_worst = target_d1 * (1 + worst_vs_normal)  # 예: 40% → 36%

# 마케팅 예산 보정
scenario_mult = {
    "best": 1.10,    # 효율 +10% → 동일 예산으로 NRU +10%
    "normal": 1.00,
    "worst": 0.90    # 효율 -10%
}
adj_ua = ua_budget * scenario_mult[scenario]
adj_brand = brand_budget * scenario_mult[scenario]
```

---

## 9. 계절성 적용

### 9.1 지역별 월간 계절성 계수

```python
SEASONALITY_BY_REGION = {
    "korea": {
        1: 1.15,   # 설 연휴
        2: 1.25,   # 설 연휴
        3: 0.85,   # 비수기
        4: 0.95,
        5: 1.10,   # 어린이날
        6: 0.90,
        7: 1.15,   # 여름방학
        8: 1.20,   # 여름방학
        9: 1.10,   # 추석
        10: 1.05,
        11: 1.10,
        12: 1.25   # 연말
    },
    "japan": {
        # 5월 골든위크, 8월 오봉, 12월 연말
        5: 1.25, 8: 1.15, 12: 1.15, ...
    },
    "china": {
        # 2월 춘절, 5월 노동절, 10월 국경절
        2: 1.30, 5: 1.20, 10: 1.25, ...
    },
    "global": {
        # 6월 비수기, 11~12월 연말
        6: 0.85, 11: 1.15, 12: 1.25, ...
    }
}
```

### 9.2 계절성 적용 방법

```python
def calculate_seasonality(regions, launch_date, days=365):
    """
    다중 지역의 계절성 팩터를 가중 평균하여 일별 계수 산출
    """
    from datetime import datetime, timedelta
    
    start = datetime.strptime(launch_date, "%Y-%m-%d")
    factors = []
    
    for day in range(days):
        current = start + timedelta(days=day)
        month = current.month
        
        # 선택된 지역들의 평균
        region_factors = [SEASONALITY_BY_REGION[r][month] for r in regions]
        daily_factor = sum(region_factors) / len(region_factors)
        factors.append(daily_factor)
    
    return factors

# NRU에 계절성 적용
nru_series = [int(nru * sf) for nru, sf in zip(nru_series, seasonality_factors)]
```

---

## 10. Debug 정보

### 10.1 제공되는 Debug 항목

| 카테고리 | 항목 | 설명 |
|----------|------|------|
| **Unit Check** | arppu_unit | ARPPU 단위 (daily/monthly) |
| | custom_pr_used | 사용자 PR 입력 여부 |
| | custom_arppu_used | 사용자 ARPPU 입력 여부 |
| **LiveOps** | liveops_intensity | 운영 강도 (Strong/Medium/Weak) |
| | floor_ratio | Sustaining Floor 비율 |
| | min_sustaining_nru | 플랫폼별 최소 NRU |
| **Retention** | calculated_d30 | 계산된 D30 Retention |
| | benchmark_d30 | 벤치마크 D30 Retention |
| | original_b / adjusted_b | b값 보정 여부 |
| **CPA Saturation** | saturation_factor | CPA 상승 배수 |
| | effective_cpa | 실제 적용 CPA |
| | brand_efficiency_bonus | 브랜드 효율 보너스 % |
| **Sustaining** | sustaining_budget_monthly | 월 유지 예산 |
| | sustaining_paid_nru_daily | 일 Paid NRU |
| | sustaining_organic_floor | Organic Floor |
| **NRU Gap** | ui_expected_paid_nru | UI 예상 NRU |
| | actual_paid_nru | 실제 엔진 반영 NRU |
| | nru_gap_percent | 차이율 (포화/전환손실) |
| **BEP** | required_dau_for_bep | 손익분기 필요 DAU |
| | current_avg_dau | 현재 예상 평균 DAU |
| | dau_gap_ratio | DAU 갭 배수 |

### 10.2 NRU Gap 분석

```python
# UI에서 기대하는 NRU (단순 계산)
ui_expected_paid_nru = ua_budget / target_cpa

# 실제 엔진에서 계산된 NRU (Saturation, 전환율 적용)
actual_paid_nru = nru_meta["post_launch_paid_nru"]

# 갭 비율
nru_gap_percent = (1 - actual_paid_nru / ui_expected_paid_nru) * 100
```

### 10.3 BEP 역산

```python
# 필요 일 매출
total_cost = marketing_budget + (hr_cost_monthly * 12)
required_daily_revenue = total_cost / 365

# 필요 DAU (PR, ARPPU 기준)
avg_pr = mean(pr_series)
avg_daily_arppu = mean(arppu_series)
required_dau = required_daily_revenue / (avg_pr * avg_daily_arppu)

# 갭 비율
dau_gap_ratio = required_dau / current_avg_dau
```

---

## 11. 입력 파라미터

### 11.1 기본 설정 (BasicSettings)

| 파라미터 | 타입 | 기본값 | 설명 |
|----------|------|--------|------|
| launch_date | string | - | 출시일 (YYYY-MM-DD) |
| market_fee_ratio | float | 0.30 | 마켓 수수료 비율 |
| vat_ratio | float | 0.10 | 부가세 비율 |
| infrastructure_cost_ratio | float | 0.03 | 인프라 비용 비율 |
| hr_cost_monthly | int | 20,000,000 | 월간 인건비 |

### 11.2 Retention 설정

| 파라미터 | 타입 | 설명 |
|----------|------|------|
| selected_games | string[] | 표본 게임 선택 (최대 4개) |
| target_d1_retention | object | D1 목표값 {best, normal, worst} |

### 11.3 NRU 설정

| 파라미터 | 타입 | 기본값 | 설명 |
|----------|------|--------|------|
| ua_budget | int | 0 | UA 예산 (원) |
| brand_budget | int | 0 | 브랜딩 예산 (원) |
| target_cpa | int | 2,000 | 목표 CPA/CPI (원) |
| base_organic_ratio | float | 0.20 | 기본 Organic 비율 |
| pre_marketing_ratio | float | 0.00 | 사전 마케팅 비중 (0~1) |
| wishlist_conversion_rate | float | 0.15 | 위시리스트 전환율 |
| cpa_saturation_enabled | bool | true | CPA Saturation 활성화 |
| brand_time_lag_enabled | bool | true | 브랜딩 지연 효과 활성화 |
| sustaining_mkt_budget_monthly | int | UA×10%/12 | 월간 유지 마케팅 예산 |

### 11.4 Revenue 설정

| 파라미터 | 타입 | 설명 |
|----------|------|------|
| selected_games_pr | string[] | PR 표본 게임 |
| selected_games_arppu | string[] | ARPPU 표본 게임 |
| custom_pr | float | 사용자 입력 PR (0~1) |
| custom_arppu | float | 사용자 입력 ARPPU (원) |
| package_price | float | 패키지 가격 (원) |

### 11.5 블렌딩 설정

| 파라미터 | 타입 | 기본값 | 설명 |
|----------|------|--------|------|
| weight | float | 0.70 | 내부 표본 가중치 (0~1) |
| genre | string | - | 장르 선택 |
| platforms | string[] | ["PC"] | 플랫폼 선택 |

### 11.6 고급 설정

| 파라미터 | 타입 | 기본값 | 설명 |
|----------|------|--------|------|
| liveops_intensity | string | "Medium" | LiveOps 강도 |
| arppu_unit | string | "monthly" | ARPPU 단위 |
| two_stage_retention | bool | false | 2-Stage Retention |
| seasonality_regions | string[] | [] | 계절성 적용 지역 |

---

## 12. API 엔드포인트

### 12.1 게임 목록 조회

```http
GET /api/games
```

**Response:**
```json
{
  "retention": ["게임A", "게임B", ...],
  "nru": ["게임A", "게임B", ...],
  "payment_rate": ["게임A", "게임B", ...],
  "arppu": ["게임A", "게임B", ...]
}
```

### 12.2 KPI 프로젝션 계산

```http
POST /api/projection
```

**Request Body:**
```json
{
  "launch_date": "2026-03-15",
  "projection_days": 365,
  "retention": { "selected_games": [...], "target_d1_retention": {...} },
  "nru": { "ua_budget": 1000000000, "target_cpa": 5000, ... },
  "revenue": { "custom_pr": 0.05, "custom_arppu": 65000, ... },
  "blending": { "weight": 0.7, "genre": "MMORPG", "platforms": ["PC"] },
  "advanced": { "liveops_intensity": "Medium", ... }
}
```

**Response:**
```json
{
  "status": "success",
  "results": {
    "best": { "dau": {...}, "nru": {...}, "revenue": {...}, "retention": {...} },
    "normal": { ... },
    "worst": { ... }
  },
  "summary": {
    "best": { "gross_revenue": ..., "net_revenue": ..., "paid_roas": ..., ... },
    "normal": { ... },
    "worst": { ... }
  },
  "debug_info": { ... }
}
```

### 12.3 AI 상태 확인

```http
GET /api/ai/status
```

**Response:**
```json
{
  "enabled": true,
  "model": "gpt-4",
  "available_types": ["general", "retention", "revenue", "marketing"]
}
```

---

## 13. 배포 가이드

### 13.1 로컬 개발 환경

```bash
# Backend
cd backend
pip install -r requirements.txt
uvicorn main:app --reload --port 8000

# Frontend
cd frontend
npm install
npm run dev
```

### 13.2 환경 변수

**Backend (.env):**
```env
OPENAI_API_KEY=sk-xxx
CORS_ORIGINS=http://localhost:5173,https://your-domain.com
```

**Frontend (.env):**
```env
VITE_API_URL=http://localhost:8000/api
```

### 13.3 Vercel (Frontend) 배포

1. GitHub 저장소 연결
2. Framework Preset: **Vite**
3. Build Command: `npm run build`
4. Output Directory: `dist`
5. Environment Variables: `VITE_API_URL` 설정

### 13.4 Render (Backend) 배포

1. GitHub 저장소 연결
2. Runtime: **Python 3**
3. Build Command: `pip install -r requirements.txt`
4. Start Command: `uvicorn main:app --host 0.0.0.0 --port $PORT`
5. Environment Variables: `OPENAI_API_KEY` 설정

---

<br>
<br>
<br>

<div align="center">

---

**Made By Han Changyoon**

---

</div>
