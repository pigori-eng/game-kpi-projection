# 🎮 Game KPI Projection Tool — V14.4.0

회귀분석 및 **내부 실측 데이터** 기반의 게임 KPI 예측 시뮬레이션 도구입니다.  
단일 게임 365일 프로젝션부터 **순차출시 × 멀티모드 × 크로스프로그레션 3~4개년 제품 프로젝션**까지 지원합니다.

> **이 툴의 목적은 "매출을 맞히는 것"이 아니라, "어떤 가정에서 이 숫자가 나왔고, 어떤 근거가 약하며, 지난번 대비 왜 변했는가"에 답하는 것입니다.**

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
14. [Product 3Y Timeline (순차출시·멀티모드)](#14-product-3y-timeline-순차출시멀티모드)
15. [신뢰성 체계 (Contract · LOFO · Evidence)](#15-신뢰성-체계-contract--lofo--evidence)
16. [Freeze 설계 원칙](#16-freeze-설계-원칙)
17. [V14 모듈 상태](#17-v14-모듈-상태)
18. [GW 참조 케이스](#18-gw-참조-케이스)
19. [테스트](#19-테스트)
20. [버전 히스토리 · 알려진 한계](#20-버전-히스토리--알려진-한계)

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
| 내부 표본 (Pool A) | 자사 출시 게임 **35종**의 실제 KPI 데이터 (retention/NRU/PR/ARPPU/actuals) |
| 내부 벤치마크 | **장르\|플랫폼별 내부 표본 분포**에서 산출 (V13부터 외부 절대값 미사용) |
| External Evidence | Newzoo/SensorTower peer set — **상대 비교·경고 전용, P50 주입 금지** |
| Internal Priors | PUBG 실측 계절성/wave scale/stickiness, NEW STATE 런칭 evidence |

> ⚠️ **V13 이후 변경**: 시장 벤치마크 절대값을 예측에 직접 블렌딩하지 않습니다.  
> 외부 데이터는 정의(semantics)가 내부와 달라 Evidence Layer로 격리되었습니다.

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

### 1.4 두 개의 프로젝션 모드

| 모드 | 용도 | 엔드포인트 |
|------|------|-----------|
| **Single Wave (Quick Projection)** | 단일 플랫폼·단일 런칭 365일 빠른 추정 (백테스트 검증 범위) | `/api/projection` |
| **Launch Projection** (구 Product 3Y) | 순차출시(PC→Mobile→Console) + 멀티모드 + Launch 36M/48M 사업성 — GW 공식 모드 | `/api/projection/product-3y` |

화면 상단 토글로 전환합니다. → 상세: [14장](#14-product-3y-timeline-순차출시멀티모드)

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
│       │   ├── InputPanel.tsx            # 입력 패널 (Component 모드)
│       │   ├── ResultsPanel.tsx          # 결과 표시 + P&L/BEP 레이어
│       │   ├── ProductTimelinePanel.tsx  # 🆕 Product 3Y (Wave/Mode/Bridge/Badge)
│       │   └── AIInsightPanel.tsx        # AI 분석 (Reliability Card 연동)
│       ├── types/index.ts                # 타입 정의
│       └── utils/api.ts                  # API 호출
├── backend/
│   ├── main.py                     # FastAPI 서버 + 레거시 계산 엔진 + 백테스트
│   ├── contracts.py                # 🆕 Metric Contract (6차원 검증)
│   ├── external_evidence.py        # 🆕 외부 데이터 격리 (Evidence 전용)
│   ├── product_timeline.py         # 🆕 Wave/Union Dedup/Identity/Mode State
│   ├── product_3y.py               # 🆕 3Y 오케스트레이터 (P&L/BEP/Bridge/Badge/Hurdle)
│   ├── arpdau_engine.py            # 🆕 ARPDAU candidate (Shadow)
│   ├── v14_engines.py              # 🆕 V14.1~14.4 (전부 opt-in)
│   └── tests/                      # 🆕 pytest (fast contract / slow integration)
├── scripts/
│   └── build_external_evidence.py  # External Evidence 빌더 (재현성)
└── data/
    ├── raw_game_data.json          # 내부 35종 실측 데이터
    ├── internal_priors.json        # PUBG 계절성/wave scale, NEW STATE priors
    ├── external_evidence.json      # Newzoo peer set (frozen IDs)
    ├── residual_store.json         # LOFO 백테스트 잔차 (Pool A/B)
    └── benchmark_data.json         # 레거시 벤치마크 (참조용)
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

### 6.7 P&L Waterfall + BEP (V13.7.1~)

결과 레이어가 **6 Gross Revenue → 7 P&L Waterfall → 8 BEP** 순으로 분리되었습니다.

```
Gross Bookings (유저 결제 총액)
  − 플랫폼 수수료 30%
  − VAT/결제수수료 10%
  − 인프라 3%
= Net Revenue (Gross × 0.57)
  − 마케팅 (Launch UA + Brand + Sustain)      ← Marketing Ledger 단일 소스
= Contribution Profit
  − 인건비 (annual_hr_cost_krw 입력)
= Operating Profit
```

**BEP 2종** (결과 최종 레이어):

| 구분 | 정의 |
|------|------|
| Marketing BEP | 누적 Net ≥ 누적 마케팅비 도달 월 (`M+15` 형식) |
| Full Cost BEP | + 누적 인건비 + 개발비(`dev_cost_total_krw`) 도달 월. 미달 시 잔여액 표시 |

> ⚠️ **서스테인 마케팅 정의 계약**: 기본값은 `launch UA의 연 10%`입니다.  
> **매출 % 방식은 코드에서 거부**됩니다 (매출↑→마케팅↑→매출↑ 순환구조 방지).

> ⚠️ **Marketing Ledger**: Acquisition 엔진과 P&L이 **동일한 마케팅비 소스**를 참조합니다.  
> 이중차감/누락을 막기 위한 단일 원장 구조입니다.

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


### 9.3 ⚠️ V13.2 변경 — 실측 계절성으로 교체

기존 구현에는 **합성 랜덤 스파이크/노이즈**가 포함되어 있었고, 계절성이 **NRU와 ARPPU에 이중 적용**되는 문제가 있었습니다.

| 항목 | V13.2 이전 | V13.2 이후 |
|------|-----------|-----------|
| 월별 계수 | 지역별 하드코딩 | **PUBG PC 6개년 실측 월계수** (`internal_priors.json`) |
| 주말 효과 | 랜덤 weekly factor | **결정적 주말계수 +10%** (policy, 문서화) |
| 이벤트 스파이크 | 랜덤 event factor | **제거** (실측 라이브 이벤트는 V14.3 Live Lifecycle 몫) |
| 적용 경로 | NRU × 계수, ARPPU × 계수 (이중) | **Revenue 경로 1회만** |
| 총량 | 변동 | **평균 1.0 정규화** (계절성은 분포 이동만, 총량 보존) |

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

### 12.3 Product 3Y 엔드포인트 (V13.7~)

```http
POST /api/projection/product-3y                     # 3Y 제품 프로젝션 (P&L/BEP/Bridge/Badge 포함)
POST /api/projection/product-3y/excel               # Report-ready Excel 15시트 (3본 자동 동봉)
POST /api/projection/product-3y/export/pdf          # 1-page PDF (C레벨용, light 계산)
POST /api/assumptions/replace                       # 실측으로 assumption 교체 → Δ + lineage impact
POST /api/revenue-owner/shadow-backtest             # 3-way owner LOFO 비교 (shadow_only, 엄격 Gate)
POST /api/acquisition/cpi-curve-shadow              # UA CPI response curve (shadow, static fallback)
GET  /api/assumptions/import-template               # Alpha/CBT actual CSV 템플릿 3종
POST /api/assumptions/import-actuals                # 실측 import (dry-run → confirm)
POST /api/projection/product-3y/official-scenarios  # 공식 3본 (D1 40/50/60)
POST /api/projection/product-3y/v14-delta-bridge    # V14 모듈별 Δ 분해
POST /api/projection/product-schedule               # Wave 기반 Unique Account DAU
POST /api/backtest/run-all                          # True-LOFO 백테스트 (residual store 갱신)
POST /api/projection/arpdau-forecast                # ARPDAU candidate (Shadow — 공식 아님)
```

### 12.4 AI 상태 확인

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

> ### ⚠️ 배포 필수 체크 (결과가 안 나올 때 1순위 확인)
> **backend 폴더 전체**가 배포되어야 합니다. `main.py`만 올리면 신규 모듈 import 실패로
> **서버 전체가 죽어 단일/3Y 모두 결과가 출력되지 않습니다.**
>
> 필수 파일: `main.py, contracts.py, external_evidence.py, product_timeline.py, product_3y.py, arpdau_engine.py, v14_engines.py` + `data/` 4종
>
> 배포 후 자가진단: **`GET /api/health`** → `status: ok` 확인 (`MODULE_MISSING`이면 누락 파일 표시됨)

---

## 14. Product 3Y Timeline (순차출시·멀티모드)

### 14.1 해결하는 문제

단일 `/api/projection`은 **launch_date 하나 + platforms 배열 하나**로 하나의 파이프라인만 만듭니다.  
따라서 아래를 표현할 수 없습니다.

| 요구사항 | 단일 엔진 | Product 3Y |
|---------|----------|-----------|
| PC → Mobile → Console 순차 출시 | ❌ | ✅ Wave별 독립 런칭 |
| Cross Progression (계정 중복) | ❌ 플랫폼 DAU 단순합 | ✅ Unique Account DAU |
| BR + Extraction 멀티모드 | ❌ | ✅ BR Only / EX Only / Both |
| 3~4개년 사업성 | ❌ 365일 | ✅ Launch-relative Y1~Y4 |

### 14.2 Wave 구조

```json
{
  "anchor_launch_date": "2029-03-01",
  "horizon_years": 4,
  "waves": [
    {"wave_id": "pc",      "platform": "PC",      "offset_months": 0,
     "ua_budget": 12e9, "brand_budget": 8e9, "target_cpa": 7500,
     "prereg_users": 2500000, "prereg_activation_rate": 0.40},
    {"wave_id": "mobile",  "platform": "Mobile",  "offset_months": 6,  ...},
    {"wave_id": "console", "platform": "Console", "offset_months": 12, ...}
  ]
}
```

- `wave_id`가 **primary key** (같은 플랫폼이 여러 Wave를 가질 수 있음: `mobile_rok_sea`, `mobile_global`)
- 플랫폼 순서를 코드에 하드코딩하지 않음 — `launch_date` 정렬 + `wave_id` tie-break
- 각 Wave는 자체 UA/Brand/CPA/사전등록/리텐션 코호트를 가진 **독립 런칭**

### 14.3 Union Dedup (크로스 프로그레션)

플랫폼 DAU를 단순 합산하면 안 됩니다. 같은 계정이 여러 기기에서 플레이하기 때문입니다.

```
O_k(t) = min( D_k(t) × ρ_k(t),  U_prev(t),  D_k(t) )
U_k(t) = U_prev(t) + D_k(t) − O_k(t)

ρ_k(t) = initial + (target − initial) × min(1, t / ramp_days)
```

자동 성립하는 항등식: `max(platform DAU) ≤ Unique DAU ≤ Σ platform DAU`

**Adoption ≠ Overlap** (반드시 분리):

| 변수 | 정의 | 용도 |
|------|------|------|
| `existing_account_adoption` | 신규 플랫폼 활성 유저 중 기존 계정 비율 | **NRU 재계상 방지** (CAC/LTV 정확도) |
| `same_day_active_overlap` | 신규 플랫폼 DAU 중 같은 날 기존 플랫폼도 활성인 비율 | **DAU dedup** |

기본값 (scenario prior, Aniimo 크로스플랫폼 모델 참조):

| Wave | Adoption | Same-day Overlap |
|------|----------|------------------|
| Mobile | 5% → 25% (180d) | 2% → 12% (90d) |
| Console | 8% → 30% (180d) | 5% → 18% (90d) |

> Console overlap이 더 높은 이유: **동일 슈터 코어 유저의 기기 확장** 성격.  
> Mobile은 신규 유저풀 확장 비중이 커서 상대적으로 낮게 설정.

### 14.4 Mode State (멀티모드)

```
Unique DAU = BR Only + EX Only + Both        (상호배타, 항등식 자동 검증)
Cross-mode Penetration = Both / Unique DAU
```

`ex_only`, `both` 각각 `initial → target` ramp로 입력 (BR Only = 나머지).  
기본값: EX Only 10→15%, Both 8→25% (180일 ramp)

> ⚠️ **Mode mix는 Unique DAU를 증가시키지 않습니다.** 상태 분해일 뿐입니다.  
> "BR+EX가 있어서 더 오래 남는다"는 **Synergy Scenario**로 분리되어 있고, **기본 1.00**입니다.

### 14.5 Revenue는 dedup하지 않음

```
Product DAU     = Account deduplicated       (overlap 차감 O)
Product Revenue = Σ attributed platform revenue  (overlap 차감 ❌)
```

동일 계정이 PC에서 1만원, Console에서 2만원 결제했다면 매출은 **3만원**이 맞습니다.

### 14.6 Region Mix

```
NA 1.60 / JP 1.45 / KR 1.30 (measured)
EU 1.00 (shrunk — NEW STATE 실측 병합)
SEA 0.25 / SA 0.15 (measured) / OTHER 0.50 (proxy → 경고)
```

> ⚠️ 현재 Region Mix는 **monetization에만 적용**됩니다.  
> CPA/Organic/Retention의 지역 효과는 미모델링 (V14.2 예정).

### 14.7 Excel 15시트 (Report-ready)

```
01 Executive Summary (1페이지 보고서형)   09 Assumptions
02 Monthly Product KPI                   10 Data / Prior Sources
03 Platform Breakdown                    11 Strategic Hurdle Coverage
04 Mode Breakdown                        12 Projection Bridge (+해석 컬럼)
05 Wave Breakdown (attributed+adjusted)  13 Confidence Badge
06 Legacy Lever Envelope                 14 Assumption Lineage
07 Sensitivity (Tornado)                 15 Risk / Validation Plan
08 Reliability
```

- **01 Exec Summary**: Conditional 헤드라인 + Key Interpretation 자동생성 + Scenario 3본(Worst/Normal/Best 자동 동봉) + Hurdle Coverage 표
- **15 Risk/Validation Plan**: 변수별 현재값/근거등급/검증 방법 (D1→Alpha cohort, tail→LiveOps 등)

> 11~15시트는 **"숫자가 캡처·복붙되어 돌아다녀도 근거와 경고가 따라가도록"** 하는 장치입니다.

### 14.8 Reconciliation 항등식 (V14.0.3, 불변식 테스트 고정)

```
Exec Gross == Σ Monthly == Σ Annual == Σ Platform == Σ Wave(adjusted)
```

- Monthly 마지막 블록이 잔여 일수를 흡수 (30일 블록 절사로 인한 증발 방지)
- Wave 시트는 raw attributed와 adjusted(×region×BM) 병기 — revenue는 dedup하지 않으므로 adjusted 합 = 제품 Gross
- **Net 정의 분리**: `Platform Net Revenue` (Gross×0.70, 수수료만) vs `Operating Net` (Gross×0.57, P&L 기준)
- **기간 명칭**: `Launch 36M` (출시 후 36개월, Y1=Ramp) / `Launch 48M` (Ramp + FCY 3Y) — "정상 운영 3개년"과 혼동 금지

---

## 15. 신뢰성 체계 (Contract · LOFO · Evidence)

### 15.1 Metric Contract

모든 지표는 6차원으로 태깅되며, 미등록 값은 **거부**됩니다.

```
metric_semantics · measurement_method · cohort_scope · activity_definition · window_definition · unit
```

호환성 판정: `COMPATIBLE` / `TRANSFORMABLE` / `RELATIVE_ONLY`  
activity/window가 서로 다르면 자동으로 `RELATIVE_ONLY`로 강등됩니다.

**ARPPU는 daily canonical** — 내부 표본은 UI 설정과 무관하게 daily로 처리됩니다 (30배 오류 방지).

### 15.2 True-LOFO 백테스트

```
Family-excluded sample selection  +  Family-excluded internal benchmark
```

target family를 **표본과 벤치마크 양쪽에서** 제외해야 진짜 LOFO입니다.

| 지표 | 값 |
|------|-----|
| Launch family-balanced 절대오차 | **±93%** (observed 3 families) |
| Pool B (pseudo) | ±83.5% (12 families) |

> 이 숫자는 "성능이 나쁘다"가 아니라 **누수를 제거한 뒤의 정직한 baseline**입니다.  
> 이전 ±65.6%는 벤치마크에 target 자신이 포함된 상태였습니다.

### 15.3 External Evidence 격리

외부 데이터(Newzoo 등)는 **정의가 내부와 다르므로** 예측값에 주입하지 않습니다.

| 허용 | 금지 |
|------|------|
| Tail shape 비교 (D28/D7 비율) | 절대 리텐션값 주입 |
| Lifecycle envelope 경고 | P50 보정 |
| Peer percentile 위치 표시 | 벤치마크 블렌딩 |

**Isolation Test**: 외부 데이터를 바꿔도 baseline 예측이 불변해야 PASS.

### 15.4 Confidence Badge (provenance)

```
🟢 Measured   🔵 Internal benchmark   🟡 Evidence-informed
🟠 Gate/Policy assumption   ⚪ Unvalidated
```

> ⚠️ **확률 점수가 아닙니다.** "Confidence 72%" 같은 숫자를 만들면 그 자체가 또 하나의 검증 불가 모델이 됩니다.  
> 집계 결과에는 개수만 표시합니다: *"evidence-informed assumption 2개, unvalidated 1개 포함"*

### 15.5 Ordered Projection Bridge

baseline부터 최종까지 **각 단계를 실제로 재실행**해 Δ를 산출합니다.

```
Generic baseline                    693억
+ D1 Gate 28→50%  🟠               1,209억 (+516)
+ BM unsupported penalty 제거 🔵    2,518억 (+1,309)
+ Organic contract 정정 🔵          3,476억 (+958)
+ Known Reservoir (사전등록) 🟡      3,841억 (+365)
```

> 순서 의존적입니다. 모든 기여도에 `Ordered bridge 기준 — D1 → BM → Organic → Reservoir 순` 각주가 붙습니다.

### 15.6 Assumption Lineage

```
variable + value + status(badge) + source + sample_n + snapshot_id + date
```

CBT/Alpha 실측이 들어오면 assumption을 measured로 교체하고, 그 영향을 자동 추적합니다.

```
D1  50% 🟠 Gate assumption (2026-08, snapshot A137...)
 →  44% 🟢 Measured (2029-01, GW Alpha, N=32,418, snapshot B843...)
    Projection Impact: 3,069억 → 2,710억 (Δ −359억)
```

---

## 16. Freeze 설계 원칙

구현 시 위반하면 안 되는 계약입니다. (`product_3y.py` 상단 주석에도 명시)

| # | 원칙 |
|---|------|
| 1 | Mode mix는 Unique DAU를 증가시키지 않는다 (상태 분해만) |
| 2 | Mode/Cross-platform Synergy는 기본 1.00이며 scenario-only (CBT 전 P50 진입 금지) |
| 3 | Cross-platform overlap은 DAU dedup에만 사용한다 |
| 4 | Revenue는 platform attributed 합산이며 overlap으로 차감하지 않는다 |
| 5 | 외부/타사 prior는 reference only, auto-apply 금지 |
| 6 | 표본 없는 region은 proxy 사용 시 반드시 경고한다 |
| 7 | 마지막 해 tail-dominant 경고를 강제한다 (D365 이후 미검증 외삽) |
| 8 | BM UI 선택은 engine recipe contract와 1:1 매핑한다 |
| 9 | Auto Benchmark / Manual Samples / Hybrid는 의미가 명확해야 한다 |
| 10 | Assumption Set은 모든 결과와 함께 저장된다 (`assumption_set_id` 병기) |
| 11 | BM modifier는 중립(1.0) — 무근거 정책값 + 표본 이중반영 제거 |
| 12 | External Reservoir 사용 시 budget-derived pre-launch를 자동 차단한다 |
| 13 | 서스테인 마케팅은 launch UA 기준 — 매출 % 방식은 순환구조라 거부 |
| 14 | Strategic Hurdle은 참고선이며 엔진 입력에 절대 전달하지 않는다 (No Target Leakage) |
| 15 | Revenue Owner는 단일 (legacy / ARPDAU / 3-Layer 중 하나만 — double count 금지) |

### 16.1 No Target Leakage 테스트

```
Hurdle = 1,000억으로 실행  →  Projection X
Hurdle = 2,000억으로 실행  →  Projection X   (완전히 동일해야 PASS)
                              Coverage만 변경
```

목표 숫자가 모델을 끌어당기는 것을 구조적으로 차단합니다.

---

## 17. V14 모듈 상태

**전부 기본 OFF (opt-in)** 입니다. 활성화 시 badge/warning이 강제됩니다.

| 모듈 | 상태 | 설명 |
|------|------|------|
| V14.1 Retention Anchor | **통합 보류 확정** | 공식 구조는 'D1 입력 + 참조 커브 shape 파생' 유지 결정 (2026-08). anchor 엔진은 prototype으로 존치 |
| V14.2 Independent Acquisition | **opt-in** | Brand 단독 유입 (Awareness→Install, 수확체감), 플랫폼별 CPI |
| V14.3 Live Lifecycle | **PREVIEW ONLY** | Active/Dormant/Churned stock-flow. **공식 annual/monthly/total 미반영** |
| V14.4 3-Layer Monetization | **prototype** | Entry/Repeat/High-ARPU. Revenue Owner Gate 통과 전 활성화 시 `ValueError` |

### 17.1 V14 Module Delta Bridge

각 모듈의 영향을 **독립적으로** 분해합니다. (`/v14-delta-bridge`)

```
[공식] V13.8 Official Normal                    3,841억  (+0)
[Prev] + V14.2 Independent Acquisition only     4,403억  (+562)
[Prev] + V14.3 Live Lifecycle only (PREVIEW)    3,891억  (+50)
[Prev] + V14.1 Retention Anchor only            산출불가 — prototype
[Prev] + V14.4 3-Layer Monetization only        산출불가 — Revenue Owner Gate 대기
```

### 17.2 Live Lifecycle (V14.3) — uplift가 아닌 stock-flow

```
New → Active → Dormant → Churned

Major Update  →  Dormant × reactivation_rate  →  Returning AU
                 (복귀 코호트는 자체 리텐션으로 감쇠, 영구 가산 금지)
```

목적은 **숫자 상향이 아니라 인과 정상화**입니다.

| | 설명 |
|---|---|
| 현재 (V14.3 OFF) | "sustain UA가 decay를 상쇄해서 Y3가 회복" — *3년차 게임이 왜 같은 CPI로 유저를 사오는가?* 라는 질문에 취약 |
| 목표 (V14.3 통합 후) | "M30 Major Update에서 dormant 2.4M의 7.3%가 복귀, 해당 코호트 D30 31%" |

---

## 18. GW 참조 케이스

**snapshot `962de3cf70b4`** — 아래 입력으로 재현 가능합니다.

### 18.1 입력값

| 항목 | 값 |
|------|-----|
| 앵커 출시일 / Horizon | 2029-03-01 / **4 Years** (M1~12 Ramp, FCY1 = M13~24) |
| 장르 / BM | Battle Royale / F2P Cosmetic + Battle Pass |
| Reference Mode | Auto Benchmark |
| 목표 D1 | **0.50** (Normal) |
| organic_share_of_total | **0.364** |

| Wave | 출시 | UA | Brand | CPA | 사전등록 | activation |
|------|------|-----|-------|-----|---------|-----------|
| pc | M+0 | 120억 | 80억 | 7,500 | 250만 | 40% |
| mobile | M+6 | 150억 | 100억 | 4,000 | 200만 | 40% |
| console | M+12 | 30억 | 20억 | 9,000 | 50만 | 40% |

```
Region  : NA 30 / EU 20 / KR 15 / JP 10 / SEA 20 / OTHER 5 (%)
Mode    : EX Only 10→15%, Both 8→25% (180d ramp)
Synergy : Base 1.00
V14     : 전부 OFF
비용    : 개발비 1,000억 / 연 인건비 300억 (BEP 계산용, 예시값)
```

### 18.2 결과

```
Ramp(M1-12)    772억  | Avg uDAU 46.9만 | Peak 130.5만
FCY1         1,003억  | Avg uDAU 59.6만
FCY2           998억  | Avg uDAU 59.2만
FCY3         1,068억  | Avg uDAU 63.5만
────────────────────────────────────────
FCY 3개년    3,069억   (4Y 전체 3,841억)
BEP: Marketing M+15 / Full Cost 기간 내 미달성
```

**공식 3본** (D1만 변경, 타 변수 고정):

| Scenario | D1 | FCY 3개년 |
|----------|-----|----------|
| Worst | 40% (투자 Gate) | 2,468억 |
| **Normal** | **50%** | **3,069억** |
| Best | 60% | 3,671억 |

### 18.3 보고 문구 규칙

> **GW 3Y Conditional Gross Projection**  
> 약 **2,500 ~ 3,700억** (Planning Case ~3,100억)  
> Product Gate 달성 조건부 · *This is not a sales commitment.*  
> 최약 가정: D1 Gate(🟠) / prereg activation(🟡) / FCY2~3 tail(⚪)

> ⚠️ "GW 매출은 3,069억입니다"는 **예언**이고,  
> "이 조건에서 기대 가능한 range는 2,500~3,700억입니다"는 **프로젝션**입니다.

---

## 19. 테스트

```bash
python -m pytest backend/tests -q          # fast contract(10) + slow integration(5), 약 15초
python backend/tests_contract.py           # Metric Contract 22 tests
python backend/tests_product_timeline.py   # P3.5 Union Dedup 15 tests
python backend/tests_product_3y.py         # 3Y 통합 49 tests (수 분)
```

### 19.1 핵심 불변식 테스트

| 테스트 | 검증 내용 |
|--------|----------|
| Union Identity | `max(platform DAU) ≤ Unique ≤ Σ platform DAU` 매일 성립 |
| Adoption ≠ Overlap | adoption만 바꿔도 DAU dedup 불변 |
| Revenue Independence | overlap을 바꿔도 platform revenue 불변 |
| Unique NRU | 기존 계정 adopter를 신규로 재계상하지 않음 |
| Mode Identity | BR Only + EX Only + Both = Unique DAU |
| ex_adoption Rev 영향 ≈ 0 | Mode mix는 돈을 만들지 않음 (원칙 1 증명) |
| No Target Leakage | Hurdle 변경 시 Projection 완전 동일 |
| V14.3 Preview Only | V14.3 ON/OFF 시 공식 숫자 동일 |
| LOFO 무누수 | Console holdout 시 벤치마크에서 자기 자신 제외 |
| sustain revenue_pct 거부 | 순환구조 입력 시 `ValueError` |

---

## 20. 버전 히스토리 · 알려진 한계

### 20.1 버전 히스토리

| 버전 | 핵심 변경 |
|------|----------|
| V12.x | 회귀 기반 단일 프로젝션, 외부 벤치마크 블렌딩 |
| V13.0~13.2 | Metric Contract, 외부데이터 격리, True-LOFO, 계절성 실측 승격, Provisional Interval |
| V13.3~13.6 | P3.5 Wave/Union Dedup, P4.5 Mode State, ARPDAU candidate (recipe/region-aware) |
| V13.7 | 3-Year Product Projection, Annual Summary, Reliability Horizon, Tornado, Excel 10시트 |
| V13.7.1 | BM 실계산 연결, 마케팅 wiring 복구, Marketing Ledger, P&L + BEP 2종 |
| V13.7.2 | D1 3본 독립 실행, BM 중립화, Reservoir semantics, organic 계약, Hurdle Coverage |
| V13.8 | Ordered Bridge, Confidence Badge, Assumption Lineage, Conditional Notice |
| V14.0.1 | V14 opt-in 엔진 4종, 공식 3본 API, V14 Δ Bridge, 테스트 재구조화 |
| V14.0.2 | /api/health 진단, Region 2모드(글로벌 ex-CN/리전선택+CN), BM evidence modifier(내부실측 clamp), D1 ±10%p, 레이어형 UI+가이드 |
| V14.0.3 | **Reconciliation 항등식**(Exec=Monthly=Platform=Wave), 기간 명칭(Launch 36M/48M)·Net 정의 분리, Exec 1페이지+Risk Plan(15시트), Bridge 해석 컬럼, **Decision Dashboard UI**(Executive/Driver/Audit 3단, Drawer, 용어사전, Preset, Health badge) |
| **V14.1.0** | **공통 BM 계약**(`bm_contracts.py` — Single Wave↔Launch Projection 단일 계약: 표본 존재 시 modifier 비활성/이중반영 차단), Single Wave **신뢰도 언어**(Confidence Badge·Mini Revenue Bridge·Result Drawer), **"이 가정으로 Launch Projection 생성" seed 전달**, **1-page PDF Export**(`pdf_export.py`, NanumGothic 임베딩, render QA 통과), **Assumption Replace API**(`/api/assumptions/replace` — 실측 교체→Δ+lineage impact 자동 보고) |
| **V14.2.0** | **Shadow Validation & Calibration Framework** — Revenue Owner 3-way Shadow(LOFO, 엄격 Gate·자동승격 금지), V14 Preview Δ Bridge 전 모듈 산출(+All Preview), UA CPI Curve JSON 인터페이스(shadow·fallback), **Alpha/CBT Actual Import**(dry-run→confirm, Replace API 연동). **Official 숫자 완전 불변** |
| **V14.3.0** | **Mode Synergy Layer** (피드백27, Freeze 원칙 2 개정) — Delta Force-informed 비중가중 multiplier(EX/Both retention·monetization lift, ramp 180d, cap ret 1.08/mon 1.06), Observed≠Applied 분리(선택 편향 보정), GW preset ON/Generic OFF, 결과에 별도 Δ 행+🟡badge. 멀티모드/Overlap UI 문구 전면 재작성(유저군 분해≠성과 상향, 분모 정의, Adoption vs Overlap) |
| V14.3.1 | Mode Mix **코호트 램프** — 신규 플랫폼 유입 코호트가 자기 출시 후 경과일 기준으로 램프 (M7/M13 꺾임 가시화) |
| V14.3.2 | V14.1 anchor 통합 보류 확정(공식: D1 입력+shape 파생 유지), 차트 라벨 정의 명시(월평균/적층/Tail 풀정의), 균등 월블록 |
| **V14.3.3** | **Shooter PUR Benchmark Panel 등록** — Newzoo 실측 플랫폼 분리(PC n=15 median 15.7% / Console n=14 median 5.8%, 정의=ARPU/ARPPU 검산), 혼합 오류 정정 이력 포함. Mobile은 Delta Force ex-CN ARPDAU implied. `external_evidence.json` |
| **V14.4.0** | **시너지 delta 정의 수정**(최종 gross 기준 == ON/OFF run 차이, 테스트 고정), **Input Source Registry**(`source_registry.py` + `GET /api/source-registry` — 4단계 근거 언어로 핵심 입력 14종 등록), **Delta Force observed 자동 기록**(확보 관측치 + 미확보 항목 정직 명시) |

### 20.2 알려진 한계

| 한계 | 영향 | 해소 예정 |
|------|------|----------|
| FCY2~3 rev 기준 tail share 100% | D365 이후 미검증 외삽 | V14.3 통합 (인과 정상화) |
| Region Mix가 monetization에만 적용 | CPA/Organic 지역효과 없음 | V14.2 |
| Brand가 Paid NRU 종속 (V14.2 OFF 시) | UA=0이면 Brand 단독 유입 불가 | V14.2 opt-in |
| franchise-class 검증 n=2 | 대형 IP 과소예측 편향 크기 미확정 | V14.5 backtest |
| NEW STATE prior = mobile-only | PC/Console 직접 전이 금지 | 추가 실측 확보 시 |
| 사전등록 activation 40% | measured 아닌 evidence-informed assumption | CBT 실측 교체 |
| Provisional Interval [0.40x ~ 47x] | observed family 3개로 구간 과대 | 표본 확충 + 모델 개선 |

### 20.3 다음 단계

1. **1페이지 PDF Export** — C레벨 보고용 요약 (Executive Summary + 3본 + Bridge + Badge)
2. **V14.1 / V14.4 통합 판단** — Shadow A/B로 Revenue Owner 선정 후 승격
3. **Alpha/CBT 실측 반영** — Assumption Lineage로 assumption → measured 교체 운영
4. **Franchise-class Backtest** — PUBG + NEW STATE (n=2) 기준 편향 방향/크기 보고

---

---

<br>
<br>
<br>

<div align="center">

---

**Made By Han Changyoon**

---

</div>
