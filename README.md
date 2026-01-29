# Game KPI Projection Tool V8.5+

게임 지표 프로젝션 분석 도구 - 과거 게임 데이터를 기반으로 신규 게임의 KPI를 예측합니다.

## 🎯 주요 기능

### Core Features
- **Retention 분석**: 표본 게임의 리텐션 곡선을 회귀분석하여 예상 리텐션 추정
- **NRU 예측**: 신규 유저 유입 패턴 분석 및 예측
- **Revenue 추정**: DAU × P.Rate × ARPPU 기반 매출 예측
- **시나리오 분석**: Best / Normal / Worst 3가지 시나리오 동시 분석

### V8.5+ 신규 기능 ⭐

#### 1. 마케팅 예산 분리 (UA/Brand Split)
| 항목 | 설명 | 용도 |
|------|------|------|
| **UA 예산** | 퍼포먼스 마케팅 (FB, Google UAC 등) | 직접 유저 획득 |
| **Brand 예산** | 브랜딩 (TVC, 인플루언서, 옥외광고) | Organic 유입 증폭 |
| **Sustaining** | 런칭 후 유지 마케팅 | 장기 유입 유지 |

#### 2. ROAS 이원화
- **Paid ROAS**: `총매출 / UA 예산` - 마케터용 KPI (매체 효율)
- **Blended ROAS**: `총매출 / 전체 MKT 예산` - 경영진용 KPI (사업 효율)

#### 3. Pre-Launch Logic (사전예약/위시리스트) 🚀
PC/콘솔 및 대작 모바일 게임의 핵심 로직!

```
[저수지 모델]
마케팅비 투입 → 위시리스트/사전예약 모수 축적 → 런칭 D1에 폭발적 유입
```

| 파라미터 | 설명 | 권장값 |
|----------|------|--------|
| `pre_marketing_ratio` | 사전 마케팅 비중 | PC: 30~50%, Mobile: 10~20% |
| `wishlist_conversion_rate` | 위시리스트 전환율 | Steam: 10~20%, Mobile: 15~25% |

**효과**: D1 트래픽이 10~20배 폭발하는 현실적인 런칭 그래프 구현

#### 4. CPA Saturation Effect (시장 포화) 📉
예산이 커질수록 효율 좋은 유저가 고갈되어 CPA가 상승하는 현실 반영

```
Effective CPA = Target CPA × (1 + (Budget / 5억) × 0.05)
```

| 예산 | CPA 상승률 | 예시 (기준 CPA 2,000원) |
|------|-----------|------------------------|
| 5억 | +5% | 2,100원 |
| 10억 | +10% | 2,200원 |
| 50억 | +50% | 3,000원 |

#### 5. Brand Time-Lag Effect (브랜딩 지연 효과) ⏳
브랜딩 광고는 즉시 효과가 나타나지 않고, Bell Curve로 서서히 발현 후 잔존

```
효과 분포: D1~D60 구간에 정규분포 (피크: D15)
- D1~D7: 효과 상승 중
- D15: 최대 효과
- D30~D60: 잔존 효과
```

#### 6. Organic Boost Formula
브랜딩 예산에 따른 자연 유입 증폭 (수확체감 반영)

```
Organic Boost = 1 + ln(1 + Brand/UA) × 0.7
```

| Brand/UA 비율 | Organic Boost |
|---------------|---------------|
| 0% | 1.00x |
| 50% | 1.28x |
| 100% | 1.49x |
| 200% | 1.77x |

---

## 🖥️ 플랫폼별 사용 가이드

### Mobile 게임
```yaml
설정 권장값:
  - CPI: 2,500~3,500원 (한국 RPG 기준)
  - Organic Ratio: 20~30%
  - Pre-marketing: 10~20%
  - Wishlist 전환율: 15~25%
```

### PC 게임 (Steam)
```yaml
설정 권장값:
  - CPA: 5,000~10,000원
  - Organic Ratio: 30~50% (커뮤니티 효과)
  - Pre-marketing: 30~50% (위시리스트 중요)
  - Wishlist 전환율: 10~20%
  
⚠️ 주의: Paid ROAS보다 Blended ROAS가 더 중요!
(Steam은 Attribution 추적 불가)
```

### Console 게임
```yaml
설정 권장값:
  - CPA: 8,000~15,000원
  - Organic Ratio: 40~60% (플랫폼 추천 효과)
  - Pre-marketing: 40~60%
  - Wishlist 전환율: 15~25%
```

---

## 📊 결과 해석 가이드

### LTV & ROAS 테이블
| 지표 | 설명 | 좋은 기준 |
|------|------|----------|
| LTV | 유저당 생애 수익 | CAC의 3배 이상 |
| CAC (UA 기준) | UA 예산 기준 획득 비용 | LTV의 1/3 이하 |
| CAC (전체 기준) | 전체 MKT 기준 획득 비용 | LTV의 1/2 이하 |
| Paid ROAS | UA 광고 수익률 | 100% 이상 |
| Blended ROAS | 전체 마케팅 수익률 | 80% 이상 |
| BEP | 손익분기점 도달일 | D180 이내 |

### 시나리오 해석
- **Best**: 모든 지표가 상위 수준일 때
- **Normal**: 벤치마크 평균 수준
- **Worst**: 하위 수준 또는 시장 악화 시

---

## 🛠️ 기술 스택

### Frontend
- React 18 + TypeScript
- Tailwind CSS
- Recharts (차트 라이브러리)
- Vite

### Backend
- Python FastAPI
- NumPy, SciPy (통계 분석)
- Pandas (데이터 처리)

---

## 📁 프로젝트 구조

```
game-kpi-projection/
├── frontend/           # React 프론트엔드
│   ├── src/
│   │   ├── components/ # UI 컴포넌트
│   │   │   ├── InputPanel.tsx    # 입력 패널 (마케팅 설정 등)
│   │   │   └── ResultsPanel.tsx  # 결과 패널 (ROAS 등)
│   │   ├── types/      # TypeScript 타입 정의
│   │   └── utils/      # 유틸리티 함수
│   └── package.json
├── backend/            # FastAPI 백엔드
│   ├── main.py         # 핵심 로직 (V8.5+ 포함)
│   └── requirements.txt
├── data/               # 데이터 파일
│   ├── raw_game_data.json    # 내부 게임 데이터
│   └── default_config.json   # 기본 설정
└── docs/               # 문서
    └── MARKETING_GUIDE.md    # 마케팅 설정 상세 가이드
```

---

## 🚀 로컬 실행

### Backend
```bash
cd backend
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

### Frontend
```bash
cd frontend
npm install
npm run dev
```

---

## 📊 API 엔드포인트

| 엔드포인트 | 메서드 | 설명 |
|------------|--------|------|
| `/api/games` | GET | 사용 가능한 게임 목록 |
| `/api/config` | GET | 기본 설정값 |
| `/api/projection` | POST | KPI 프로젝션 계산 |
| `/api/raw-data` | GET | 원본 게임 데이터 |
| `/api/raw-data/upload` | POST | 새 게임 데이터 업로드 (CSV) |
| `/api/raw-data/{metric}/{game}` | DELETE | 게임 데이터 삭제 |
| `/api/games/metadata` | GET | 게임 메타데이터 (장르, 출시일 등) |

---

## 📈 핵심 수식

### Retention Curve
```
Retention(day) = a × day^b
```

### DAU 계산 (Cohort Matrix)
```
DAU(d) = Σ(NRU(i) × Retention(d-i)) for all i ≤ d
```

### Revenue 계산
```
Revenue = DAU × P.Rate × ARPPU × Seasonality
```

### NRU 계산 (V8.5+)
```
Paid NRU = UA Budget / Effective CPA
Organic NRU = Paid NRU × Organic Ratio × Organic Boost
D1 Burst = Wishlist Users × Conversion Rate × 0.8
```

---

## ⚠️ 주의사항

1. **PC/Console 게임**: Blended ROAS를 주요 지표로 사용하세요
2. **대작 게임**: Pre-marketing ratio를 반드시 설정하세요
3. **예산 100억 이상**: CPA Saturation 효과를 고려하세요
4. **데이터 부족 시**: 벤치마크 가중치를 높이세요

---

## 📝 버전 히스토리

| 버전 | 주요 변경사항 |
|------|--------------|
| v8.5+ | Pre-Launch, CPA Saturation, Brand Time-Lag |
| v8.5 | UA/Brand 분리, Paid/Blended ROAS |
| v8.4 | 계절성 강화, D365 차트 확장 |
| v8.3 | NRU 정규화 수정, 내부 게임 데이터 |
| v8.2 | 마케팅 설정, 코호트 분석, Excel 내보내기 |

---

## 📝 License

Proprietary - Internal Use Only
