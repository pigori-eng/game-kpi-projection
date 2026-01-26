# Game KPI Projection Tool

게임 지표 프로젝션 분석 도구 - 과거 게임 데이터를 기반으로 신규 게임의 KPI를 예측합니다.

## 🎯 주요 기능

- **Retention 분석**: 표본 게임의 리텐션 곡선을 회귀분석하여 예상 리텐션 추정
- **NRU 예측**: 신규 유저 유입 패턴 분석 및 예측
- **Revenue 추정**: DAU × P.Rate × ARPPU 기반 매출 예측
- **시나리오 분석**: Best / Normal / Worst 3가지 시나리오 동시 분석

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

## 📁 프로젝트 구조

```
game-kpi-projection/
├── frontend/           # React 프론트엔드
│   ├── src/
│   │   ├── components/ # UI 컴포넌트
│   │   ├── types/      # TypeScript 타입 정의
│   │   └── utils/      # 유틸리티 함수
│   └── package.json
├── backend/            # FastAPI 백엔드
│   ├── main.py
│   └── requirements.txt
├── data/               # 데이터 파일
│   ├── raw_game_data.json
│   └── default_config.json
└── README.md
```

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

## 📊 API 엔드포인트

- `GET /api/games` - 사용 가능한 게임 목록
- `GET /api/config` - 기본 설정값
- `POST /api/projection` - KPI 프로젝션 계산
- `GET /api/raw-data` - 원본 게임 데이터
- `POST /api/raw-data/upload` - 새 게임 데이터 업로드 (CSV)
- `DELETE /api/raw-data/{metric}/{game}` - 게임 데이터 삭제

## 📈 통계 모델

### Retention Curve
거듭제곱 함수를 사용한 리텐션 곡선 피팅:
```
Retention(day) = a × day^b
```

### DAU 계산
Cohort 기반 DAU 매트릭스:
```
DAU(d) = Σ(NRU(i) × Retention(d-i)) for all i ≤ d
```

### Revenue 계산
```
Revenue = DAU × P.Rate × ARPPU
```

## 🔧 환경 변수

### Frontend (.env)
```
VITE_API_URL=http://localhost:8000/api
```

## 📝 License

Proprietary - Internal Use Only
