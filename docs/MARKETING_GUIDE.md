# 🎯 마케팅 설정 상세 가이드 (V8.5+)

이 문서는 Game KPI Projection Tool의 마케팅 설정을 올바르게 사용하기 위한 상세 가이드입니다.

---

## 📋 목차

1. [기본 개념](#1-기본-개념)
2. [UA vs Brand 예산 분리](#2-ua-vs-brand-예산-분리)
3. [Pre-Launch Logic (사전예약/위시리스트)](#3-pre-launch-logic)
4. [CPA Saturation Effect](#4-cpa-saturation-effect)
5. [Brand Time-Lag Effect](#5-brand-time-lag-effect)
6. [ROAS 해석 방법](#6-roas-해석-방법)
7. [플랫폼별 설정 가이드](#7-플랫폼별-설정-가이드)
8. [FAQ](#8-faq)

---

## 1. 기본 개념

### 왜 마케팅 예산을 분리해야 하나요?

모바일과 PC/콘솔의 **유저 획득 경로**가 완전히 다르기 때문입니다.

| 플랫폼 | 유저 획득 경로 | 측정 방식 |
|--------|---------------|----------|
| **Mobile** | 광고 클릭 → 스토어 → 설치 → 실행 | MMP(Appsflyer, Adjust)로 추적 가능 |
| **PC/Console** | 광고 시청 → 검색 → 위시리스트 → 구매 | Attribution 불가 (스팀/PSN이 데이터 안 줌) |

**결론**: PC/콘솔에서 "이 광고로 몇 명 왔다"를 정확히 측정할 수 없습니다.
따라서 **Blended ROAS (전체 효율)** 가 더 중요합니다.

---

## 2. UA vs Brand 예산 분리

### 2.1 UA 예산 (Performance Marketing)

**목적**: 직접 유저 획득

**채널 예시**:
- Facebook/Instagram Ads
- Google UAC/App Campaign
- Apple Search Ads
- TikTok Ads
- Unity Ads, ironSource

**특징**:
- CPA/CPI로 효율 측정 가능
- 예산을 쓰면 즉시 유저가 유입됨
- 예산을 끊으면 유입도 중단됨

### 2.2 Brand 예산 (Branding Marketing)

**목적**: 인지도 향상 → Organic 유입 증폭

**채널 예시**:
- TV CF (TVC)
- 옥외 광고 (OOH)
- 인플루언서 마케팅
- 게임쇼 참가 (G-STAR, TGS, E3)
- PR/기사 배포

**특징**:
- 직접 측정 불가 (Halo Effect)
- 효과가 서서히 나타남 (Time-Lag)
- 효과가 오래 잔존함 (Carryover)

### 2.3 Organic Boost 공식

Brand 예산이 클수록 자연 유입이 증폭됩니다.

```
Organic Boost = 1 + ln(1 + Brand/UA) × 0.7
```

| Brand/UA 비율 | 의미 | Organic Boost |
|---------------|------|---------------|
| 0% | Brand 예산 없음 | 1.00x |
| 50% | Brand가 UA의 절반 | 1.28x |
| 100% | Brand = UA | 1.49x |
| 200% | Brand가 UA의 2배 | 1.77x |

**예시**: 
- UA 예산 50억, Brand 예산 50억 (100%)
- Organic Boost = 1.49x
- 기본 Organic Ratio 20% → 실제 29.8%

---

## 3. Pre-Launch Logic

### 3.1 왜 필요한가?

대작 게임의 런칭 패턴을 현실적으로 구현하기 위해서입니다.

**기존 로직의 문제점**:
```
마케팅비 → D1부터 꾸준한 유입 → 매출 완만하게 상승
```

**실제 런칭 패턴**:
```
사전 마케팅 → 위시리스트 축적 → D1에 폭발 → 급격한 하락 → 안정화
```

### 3.2 저수지(Reservoir) 모델

```
[사전 마케팅 기간]
마케팅비 투입 → 위시리스트/사전예약 모수 축적 (저수지에 물 채움)

[런칭일]
수문 개방 → D1에 80%, D2에 10%, D3에 10% 폭발 유입

[런칭 후]
Post-Launch UA로 추가 유입 (일반적인 패턴)
```

### 3.3 설정 파라미터

| 파라미터 | 설명 | 범위 |
|----------|------|------|
| `pre_marketing_ratio` | 전체 UA 중 사전 마케팅 비중 | 0~100% |
| `wishlist_conversion_rate` | 위시리스트 → 실제 구매 전환율 | 5~30% |

### 3.4 플랫폼별 권장값

| 플랫폼 | Pre-marketing Ratio | Wishlist Conversion |
|--------|---------------------|---------------------|
| **Steam (PC)** | 30~50% | 10~20% |
| **Console (PS/Xbox)** | 40~60% | 15~25% |
| **Mobile (대작 RPG)** | 20~30% | 15~25% |
| **Mobile (캐주얼)** | 5~15% | 20~35% |

### 3.5 D1 Burst 계산 공식

```
사전 마케팅 예산 = UA Budget × Pre-marketing Ratio
사전예약 유저 = 사전 마케팅 예산 / CPA
위시리스트 모수 = 사전예약 유저 / Wishlist Conversion Rate
D1 Burst 유저 = 위시리스트 모수 × Wishlist Conversion Rate × 0.8
```

**예시**:
- UA Budget: 100억
- Pre-marketing Ratio: 30%
- CPA: 5,000원
- Wishlist Conversion: 15%

```
사전 마케팅 예산 = 100억 × 30% = 30억
사전예약 유저 = 30억 / 5,000원 = 600,000명
위시리스트 모수 = 600,000 / 0.15 = 4,000,000명
D1 Burst = 4,000,000 × 0.15 × 0.8 = 480,000명
```

→ **D1에 48만 명이 폭발적으로 유입!**

---

## 4. CPA Saturation Effect

### 4.1 왜 필요한가?

현실에서는 예산을 많이 쓸수록 **효율이 떨어집니다**.

**이유**:
1. 효율 좋은 유저(Early Adopter)가 먼저 고갈됨
2. 광고 경쟁 심화로 입찰가 상승
3. 타겟 품질 저하 (Core → Mass → Marginal)

### 4.2 계산 공식

```
Effective CPA = Target CPA × (1 + (Budget / 5억) × 0.05)
```

| 예산 | CPA 상승률 | 예시 (기준 2,000원) |
|------|-----------|---------------------|
| 5억 | +5% | 2,100원 |
| 10억 | +10% | 2,200원 |
| 20억 | +20% | 2,400원 |
| 50억 | +50% | 3,000원 |
| 100억 | +100% | 4,000원 |

### 4.3 활성화/비활성화

- ✅ **활성화 권장**: 대규모 예산 (50억 이상)
- ❌ **비활성화 권장**: 소규모 예산, 틈새 시장, 테스트 런칭

---

## 5. Brand Time-Lag Effect

### 5.1 왜 필요한가?

브랜딩 광고는 **즉시 효과가 나타나지 않습니다**.

**TV CF를 오늘 시작해도**:
- 오늘: 효과 미미
- 1주일 후: 인지도 상승 시작
- 2주일 후: 검색량 증가
- 3주일 후: 최대 효과
- 4주일 이후: 서서히 감소 (잔존 효과)

### 5.2 Bell Curve (정규분포) 모델

```
효과 = exp(-0.5 × ((day - 15) / 20)²)
```

- **피크 시점**: D15 (런칭 후 2주)
- **효과 분포**: D1~D60 (약 2개월)
- **표준편차**: 20일

### 5.3 효과 분포 시각화

```
    효과
     ▲
     │        ****
     │      **    **
     │     *        *
     │    *          *
     │   *            *
     │  *              *
     │ *                *
     │*                  **
     └───────────────────────► Day
       D1  D15  D30  D45  D60
```

### 5.4 활성화/비활성화

- ✅ **활성화 권장**: Brand 예산 있을 때, 대형 캠페인
- ❌ **비활성화 권장**: 퍼포먼스 마케팅만 할 때, 소규모 테스트

---

## 6. ROAS 해석 방법

### 6.1 Paid ROAS vs Blended ROAS

| 지표 | 공식 | 용도 | 대상 |
|------|------|------|------|
| **Paid ROAS** | 총매출 / UA 예산 | 매체 효율 측정 | 마케터 |
| **Blended ROAS** | 총매출 / 전체 MKT 예산 | 사업 효율 측정 | 경영진 |

### 6.2 플랫폼별 주요 지표

| 플랫폼 | 주요 지표 | 이유 |
|--------|----------|------|
| **Mobile** | Paid ROAS | Attribution 추적 가능 |
| **PC/Console** | Blended ROAS | Attribution 추적 불가 |
| **Cross-Platform** | 둘 다 | 상황에 따라 |

### 6.3 기준값

| 등급 | Paid ROAS | Blended ROAS | 평가 |
|------|-----------|--------------|------|
| **S** | >200% | >150% | 매우 우수 |
| **A** | 150~200% | 100~150% | 우수 |
| **B** | 100~150% | 70~100% | 양호 |
| **C** | 70~100% | 50~70% | 주의 필요 |
| **D** | <70% | <50% | 위험 |

---

## 7. 플랫폼별 설정 가이드

### 7.1 Mobile RPG (한국)

```yaml
기본 설정:
  CPI: 2,500 ~ 3,500원
  Organic Ratio: 20%
  
마케팅 분배:
  UA Budget: 70%
  Brand Budget: 30%
  
Pre-Launch:
  pre_marketing_ratio: 15%
  wishlist_conversion_rate: 20%
  
고급 설정:
  cpa_saturation_enabled: true
  brand_time_lag_enabled: true
```

### 7.2 Steam PC 게임

```yaml
기본 설정:
  CPA: 5,000 ~ 10,000원
  Organic Ratio: 35%
  
마케팅 분배:
  UA Budget: 50%
  Brand Budget: 50%
  
Pre-Launch:
  pre_marketing_ratio: 40%
  wishlist_conversion_rate: 15%
  
고급 설정:
  cpa_saturation_enabled: true
  brand_time_lag_enabled: true

⚠️ 주요 지표: Blended ROAS
```

### 7.3 Console 대작

```yaml
기본 설정:
  CPA: 10,000 ~ 20,000원
  Organic Ratio: 50%
  
마케팅 분배:
  UA Budget: 40%
  Brand Budget: 60%
  
Pre-Launch:
  pre_marketing_ratio: 50%
  wishlist_conversion_rate: 20%
  
고급 설정:
  cpa_saturation_enabled: true
  brand_time_lag_enabled: true

⚠️ 주요 지표: Blended ROAS
```

### 7.4 하이퍼캐주얼 Mobile

```yaml
기본 설정:
  CPI: 500 ~ 1,500원
  Organic Ratio: 10%
  
마케팅 분배:
  UA Budget: 90%
  Brand Budget: 10%
  
Pre-Launch:
  pre_marketing_ratio: 5%
  wishlist_conversion_rate: 30%
  
고급 설정:
  cpa_saturation_enabled: false (소규모 예산)
  brand_time_lag_enabled: false

⚠️ 주요 지표: Paid ROAS
```

---

## 8. FAQ

### Q1: UA와 Brand 예산 비율은 어떻게 정하나요?

**A**: 플랫폼과 장르에 따라 다릅니다.

| 유형 | UA : Brand | 이유 |
|------|-----------|------|
| Mobile 캐주얼 | 90:10 | 퍼포먼스 중심 |
| Mobile RPG | 70:30 | 브랜딩 필요 |
| PC/Console | 50:50 | Attribution 불가 |
| AAA 대작 | 40:60 | 브랜딩 중심 |

### Q2: Pre-marketing을 안 쓰면 어떻게 되나요?

**A**: D1 Spike가 없어지고, 매출이 완만하게 올라가는 비현실적인 그래프가 나옵니다.
특히 PC/콘솔 게임은 반드시 설정하세요.

### Q3: CPA Saturation을 끄면 어떻게 되나요?

**A**: 예산에 상관없이 CPA가 일정합니다.
- 소규모 예산 (10억 이하): 끄는 것이 현실적
- 대규모 예산 (50억 이상): 켜는 것이 현실적

### Q4: Blended ROAS가 100% 미만이면 손해인가요?

**A**: 아닙니다. LTV가 1년 매출 기준이므로:
- Year 1: Blended ROAS 80% (적자)
- Year 2+: 추가 매출 발생 → 흑자 전환 가능

장기 운영 게임은 Blended ROAS 70% 이상이면 양호합니다.

### Q5: 경영진에게 어떤 지표를 보고해야 하나요?

**A**: 
1. **Blended ROAS** (전체 마케팅 효율)
2. **LTV / CAC 비율** (유닛 이코노믹스)
3. **BEP (손익분기점)** (투자 회수 시점)

Paid ROAS는 마케터 내부 지표로만 사용하세요.

---

## 📞 문의

기능 관련 문의나 버그 리포트는 Slack #kpi-tool-support 채널로 부탁드립니다.
