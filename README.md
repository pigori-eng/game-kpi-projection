# Game KPI Projection Tool

게임 출시 전 **매출/DAU/BEP**를 시뮬레이션하는 비즈니스 프로젝션 툴입니다.

---

## 📖 목차

1. [개요](#개요)
2. [핵심 계산 로직](#핵심-계산-로직)
3. [V12.2 주요 개선사항](#v122-주요-개선사항)
4. [입력 파라미터](#입력-파라미터)
5. [Debug Report 해석](#debug-report-해석)
6. [배포 가이드](#배포-가이드)

---

## 개요

### 프로젝션 공식 요약

```
Daily Revenue = DAU × PR × ARPPU × Seasonality

DAU(d) = Σ[i=0 to d] NRU(i) × Retention(d-i)

BEP Days = min(d) where Cumulative Revenue(d) ≥ Cumulative Cost(d)
```

### 시스템 아키텍처

```
Frontend (Vercel)          Backend (Render)
┌─────────────────┐       ┌─────────────────┐
│ React + TS      │──────▶│ FastAPI + NumPy │
│ InputPanel.tsx  │ POST  │ main.py         │
│ ResultsPanel.tsx│◀──────│ Projection API  │
└─────────────────┘ JSON  └─────────────────┘
```

---

## 핵심 계산 로직

### 1. Retention Curve (리텐션 커브)

#### Power Law 모델

```python
Retention(d) = a × d^b

# a: 초기 계수 (표본 게임 평균)
# b: 감쇠 계수 (-0.5 ~ -1.0)
```

#### [V12.2] D30 앵커 강력 보정

기존 문제: D1만으로 Power Law 생성 시, b가 가파르면 D30이 벤치마크 대비 2~3배 낮게 나옴

```python
# 예: b=-0.818, D1=50% → D30 ≈ 4% (벤치마크 10~13% 대비 매우 낮음)

# V12.2 해결책: b값 역산으로 강제 보정
threshold_ratio = 0.7   # 벤치마크의 70% 미만이면 문제
target_ratio = 0.85     # 85% 수준까지 강제 보정

if calculated_d30 < benchmark_d30 * threshold_ratio:
    target_d30 = benchmark_d30 * target_ratio
    # b값 역산: target = d1 * 30^b → b = log(target/d1) / log(30)
    new_b = log(target_d30 / d1) / log(30)
    adjusted_b = min(new_b, -0.15)  # 너무 평평해지지 않게 제한
```

#### [V12.2] 2-Stage Retention

```
Stage 1 (D1~D30): Power Law (D30 앵커 보정 적용)
Stage 2 (D31~D365): LiveOps 강도별 완만한 Decay

LiveOps 강도:
- Strong: decay=-0.3, D30의 40% 유지
- Medium: decay=-0.5, D30의 20% 유지  
- Weak: decay=-0.8, D30의 5% 유지
```

---

### 2. NRU (신규 유저 유입)

#### 전체 구조

```
Total NRU = Pre-Launch Burst + Post-Launch Paid + Organic + Sustaining

D1~D3:   Pre-Launch (위시리스트 전환)
D1~D30:  Post-Launch Paid + Organic
D31~365: Sustaining (LiveOps 강도에 따라)
```

#### Pre-Launch 계산 (CPW 기반)

```python
# CPW = Cost Per Wishlist
# [V12.2] 플랫폼별 차등
CPW_RATIO = {
    "Mobile": 0.2,    # 사전예약 모으기 쉬움
    "PC": 0.3,        # 위시리스트 모으기 어려움
    "Console": 0.3
}

cpw = effective_cpa * CPW_RATIO[platform]
wishlist_pool = pre_launch_budget / cpw
d1_burst = wishlist_pool * conversion_rate
```

#### [V12.2] Sustaining NRU 절대 하한선

기존 문제: D30 NRU × 5%가 너무 작으면 Sustaining이 사실상 0

```python
# V12.2 해결책: 플랫폼별 절대 하한선
MIN_SUSTAINING_NRU = {
    "PC": 300,      # 최소 일 300명
    "Mobile": 500,  # 최소 일 500명
    "Console": 200  # 최소 일 200명
}

ratio_based_floor = d30_nru * floor_ratio * 0.5
final_floor = max(ratio_based_floor, MIN_SUSTAINING_NRU[platform])
```

---

### 3. DAU (일간 활성 유저)

#### Cohort Matrix 방식

```python
# DAU(d) = 모든 코호트의 잔존 유저 합계
DAU(d) = Σ[i=0 to d] NRU(i) × Retention(d-i)

# 매일 새 NRU가 들어오고, 각 코호트는 Retention 커브에 따라 감소
```

---

### 4. Revenue (매출)

#### 기본 공식

```python
Daily Revenue = DAU × PR × Daily_ARPPU × Seasonality
```

#### [V12.2] ARPPU 단위 변환

```python
if arppu_unit == "daily":
    daily_arppu = arppu       # 일간이면 그대로
else:
    daily_arppu = arppu / 30  # 월간이면 ÷30

# 주의: 단위 실수 시 매출이 30배 차이!
```

#### [V12.2] PC 패키지 매출

```python
# PC/Console에서 Package Price 입력 시
if is_pc_console and package_price > 0:
    for day in range(30):
        iap_revenue = dau[day] * pr * daily_arppu
        pkg_revenue = nru[day] * package_price  # 초기 구매
        total_revenue[day] = iap_revenue + pkg_revenue
```

---

### 5. BEP (손익분기점)

#### 비용 구조

```python
# 고정비
hr_cost = (direct_hr × 15M + indirect_hr × 14M) × 12

# 변동비
platform_fee = gross_revenue × 0.30  # 스토어 수수료
vat = gross_revenue × 0.10
infra = gross_revenue × 0.03

# 마케팅
marketing = ua_budget + brand_budget + (sustaining_monthly × 12)
```

#### [V12.2] BEP 역산 (필요 DAU)

```python
# 필요 DAU = 연간 비용 / 365 / Daily ARPU
# Daily ARPU = Daily_ARPPU × PR

required_dau = total_cost / 365 / (daily_arppu * pr)

# Debug Report에서 현재 DAU vs 필요 DAU 갭 표시
dau_gap_ratio = required_dau / current_avg_dau
```

---

## V12.2 주요 개선사항

### 1. D30 앵커 강력 보정

| 항목 | Before | After |
|------|--------|-------|
| 보정 임계값 | 벤치마크의 50% | 70% |
| 보정 목표 | 70% | 85% |
| 방식 | D7~D30 점진 보정 | **b값 역산** |

### 2. Sustaining NRU 절대 하한선

| 플랫폼 | 최소 일간 NRU |
|--------|--------------|
| PC | 300명 |
| Mobile | 500명 |
| Console | 200명 |

### 3. NRU Gap 분석

```
UI 예상 NRU = UA Budget / Target CPA
실제 NRU = CPA Saturation + CPW 전환 적용 후

Gap = (예상 - 실제) / 예상 × 100%
```

### 4. BEP 역산 표시

```
필요 DAU = 총 비용 / 365 / (ARPPU × PR)
현재 DAU = 시뮬레이션 결과
Gap 배율 = 필요 / 현재
```

---

## 입력 파라미터

### 기본 정보

| 파라미터 | 설명 | 기본값 |
|---------|------|--------|
| launch_date | 런칭 예정일 | - |
| projection_days | 프로젝션 기간 | 365 |
| direct_hr | 직접 인건비 인원 | 50 |
| indirect_hr | 간접 인건비 인원 | 20 |

### 프로젝트 정보

| 파라미터 | 옵션 |
|---------|------|
| genre | MMORPG, Action RPG, Extraction Shooter, FPS/TPS, Battle Royale, Strategy, Casual, Sports |
| platforms | PC, Mobile, Console (복수 선택) |
| quality_score | S (+20%), A (+10%), B (기본), C (-10%), D (-20%) |

### 마케팅 설정

| 파라미터 | 설명 |
|---------|------|
| ua_budget | UA 예산 (Performance) |
| brand_budget | 브랜드 예산 (Organic Boost) |
| target_cpa | 목표 CPA |
| pre_marketing_ratio | 사전 마케팅 비중 (0~1) |
| wishlist_conversion_rate | 위시리스트 전환율 |

### Revenue 설정 (V12.2)

| 파라미터 | 설명 |
|---------|------|
| custom_pr | 사용자 입력 PR (벤치마크 대신 적용) |
| custom_arppu | 사용자 입력 ARPPU |
| package_price | PC/Console 패키지 가격 |
| arppu_unit | "monthly" 또는 "daily" |

### 고급 옵션

| 파라미터 | 설명 |
|---------|------|
| liveops_intensity | Strong / Medium / Weak |
| two_stage_retention | D31 이후 완만한 decay 적용 |
| seasonality_regions | 계절성 적용 지역 |

---

## Debug Report 해석

### Unit Check
- **월간 (÷30)**: 월간 ARPPU를 일간으로 변환
- **일간 (원본)**: 입력값 그대로 사용

### D30 Retention
- **계산값**: Power Law로 계산된 D30
- **벤치마크**: 장르/플랫폼 시장 평균
- **b값 보정**: original_b → adjusted_b (차이가 크면 보정됨)

### NRU 누수 분석
- **예상**: UA Budget / Target CPA
- **실제**: CPA Saturation + CPW 적용 후
- **차이**: 포화/전환 손실 비율

### BEP 달성 목표
- **현재 DAU**: 시뮬레이션 평균 DAU
- **필요 DAU**: BEP 달성에 필요한 DAU
- **갭**: 몇 배 부족/초과

---

## 배포 가이드

### Backend (Render)

```bash
# Build Command
pip install -r requirements.txt

# Start Command
uvicorn main:app --host 0.0.0.0 --port $PORT

# Environment Variables
OPENAI_API_KEY=sk-...  # Optional
```

### Frontend (Vercel)

```bash
# Build Command
npm run build

# Output Directory
dist

# Environment Variables
VITE_API_URL=https://your-backend.onrender.com
```

### vercel.json

```json
{
  "rewrites": [
    { "source": "/api/:path*", "destination": "https://your-backend.onrender.com/api/:path*" }
  ]
}
```

---

## 변경 이력

- **V12.2 (2026-02-02)**: D30 앵커 강력 보정, Sustaining 절대 하한선, NRU Gap 분석, BEP 역산
- **V12.1**: 2-Stage Retention, ARPPU 단위 변환, PR/ARPPU 직접 입력, PC 패키지 매출
- **V11.0**: Pre-launch CPW 기반 변경, CPA Saturation, Brand Time-Lag
- **V8.5**: UA/Brand 분리, Organic Boost

---

## 라이선스

Internal Use Only - Bluehole Studio

