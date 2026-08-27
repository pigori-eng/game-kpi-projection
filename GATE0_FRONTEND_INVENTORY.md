# Gate 0 — Frontend Hardcode Inventory (V13.2)
| 항목 | 위치 | 태깅 | 처분 |
|---|---|---|---|
| GENRE_GUIDELINES | InputPanel L54 | User scenario | 유지 (장르별 가이드 문구) |
| GENRE_PRESETS (D1/CPA/PR 등 자동값) | InputPanel L240 | User scenario | 유지 — 라벨을 '장르 프리셋(User Scenario)'로 정정 (V13.1 '🤖 AI 권장' 오해 소지 제거) |
| PLATFORM_PRESETS (CPI/CPA metric 등) | InputPanel L260 | User scenario | 유지 |
| BM_VARIANCE | InputPanel L273 | Policy assumption | 유지, 값 출처 문서화 필요 (후속) |
| '시장 벤치마크 통합' 카피 | InputPanel L646/724 | 구식 설명 | ✅ V13.1에서 실제 엔진(내부 분포) 설명으로 교체 |
| 계절성 (합성 랜덤) | backend calculate_seasonality | Policy→Internal prior | ✅ V13.2 PROMOTED: PUBG 실측 월계수+결정적 주말계수, NRU 이중적용 제거 |
| SEASONALITY_BY_REGION 상수 | backend L~284 | DEPRECATED | 참조 제거됨 (정의만 잔존) |
