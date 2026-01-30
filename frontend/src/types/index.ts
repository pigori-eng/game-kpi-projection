// Game Data Types
export interface GameData {
  [gameName: string]: number[];
}

export interface RawGameData {
  version: string;
  description: string;
  games: {
    retention: GameData;
    nru: GameData;
    payment_rate: GameData;
    arppu: GameData;
  };
  metadata: {
    retention_games: string[];
    nru_games: string[];
    pr_games: string[];
    arppu_games: string[];
  };
}

// Basic Settings (산정 정보)
export interface BasicSettings {
  launch_date: string;
  infrastructure_cost_ratio: number;
  market_fee_ratio: number;
  vat_ratio: number;
  hr_cost_monthly: number;
  sustaining_mkt_ratio: number;
  // 런칭 MKT (Phase 2: MKT → NRU 자동 계산)
  launch_mkt_budget?: number;  // 런칭 마케팅 예산 (원)
  launch_mkt_best?: number;
  launch_mkt_normal?: number;
  launch_mkt_worst?: number;
  // CPI & UAC
  cpi?: number;
  uac?: number;
  // V8: 개발비
  dev_cost?: number;
  // V8.5: Sustaining MKT 월간 예산
  sustaining_mkt_budget_monthly?: number;
  // HR Cost (직접/간접 분리)
  hr_direct_headcount?: number;
  hr_indirect_headcount?: number;
  hr_indirect_monthly?: number;  // 레거시 호환
  // 팀 구성
  dev_team_size?: number;
  ops_team_size?: number;
  qa_team_size?: number;
  biz_team_size?: number;
}

// Phase 2: NRU 자동 계산 모드
export interface NRUAutoCalcSettings {
  enabled: boolean;
  launch_mkt_budget: number;  // 런칭 마케팅 예산
  cpi: number;                // Cost Per Install
  paid_ratio: number;         // Paid 비율 (0~1)
  nvr: number;                // Net Value Rate (설치→실행 전환율)
}

// Phase 2: 계절성 설정
export interface SeasonalitySettings {
  enabled: boolean;
  // 요일 가중치 (월~일)
  weekday_weights: {
    mon: number;
    tue: number;
    wed: number;
    thu: number;
    fri: number;
    sat: number;
    sun: number;
  };
  // 월별 가중치 (1~12월)
  monthly_weights: {
    [month: number]: number;
  };
}

// Phase 3: 프로젝트 정보 (유사도 추천용)
export interface ProjectInfo {
  genre: string;
  platform: string;
  region: string;
}

// Phase 3: 게임 추천 결과
export interface GameRecommendation {
  game: string;
  score: number;
  reason: string;
  isSelected: boolean;
}

// Phase 3: 벤치마크 데이터
export interface BenchmarkData {
  genre: string;
  region: string;
  avg_d1_retention: number;
  avg_d7_retention: number;
  avg_d30_retention: number;
  avg_pr: number;
  avg_arppu: number;
  source: string;
  updated_at: string;
}

// Input Types
export interface RetentionInput {
  selected_games: string[];
  target_d1_retention: {
    best: number;
    normal: number;
    worst: number;
  };
}

export interface NRUInput {
  selected_games: string[];
  d1_nru: {
    best: number;
    normal: number;
    worst: number;
  };
  paid_organic_ratio: number;
  nvr: number;
  adjustment: {
    best_vs_normal: number;
    worst_vs_normal: number;
  };
  // V8.5: UA/Brand 예산 분리
  ua_budget?: number;           // 퍼포먼스 마케팅 예산 (직접 유입)
  brand_budget?: number;        // 브랜딩 예산 (Organic Boost)
  target_cpa?: number;          // CPI/CPA 단가
  base_organic_ratio?: number;  // 기본 자연 유입 비율
  // V8.5+: Pre-Launch & Advanced Settings
  pre_marketing_ratio?: number;      // 사전 마케팅 비중 (0~1)
  wishlist_conversion_rate?: number; // 위시리스트/사전예약 전환율
  cpa_saturation_enabled?: boolean;  // CPA 상승 계수 활성화
  brand_time_lag_enabled?: boolean;  // 브랜딩 지연 효과 활성화
}

export interface RevenueInput {
  selected_games_pr: string[];
  selected_games_arppu: string[];
  pr_adjustment: {
    best_vs_normal: number;
    worst_vs_normal: number;
  };
  arppu_adjustment: {
    best_vs_normal: number;
    worst_vs_normal: number;
  };
}

// Phase 4: 블렌딩 설정
export interface BlendingSettings {
  weight: number;        // 내부 표본 가중치 (0~1), 기본값 0.7
  genre: string;         // 벤치마크용 장르
  platforms: string[];   // 벤치마크용 플랫폼
  time_decay?: boolean;  // V7: Time-Decay 블렌딩 활성화
}

export interface ProjectionInput {
  launch_date: string;
  projection_days: number;
  retention: RetentionInput;
  nru: NRUInput;
  revenue: RevenueInput;
  basic_settings?: BasicSettings;
  blending?: BlendingSettings;
  // V7 추가
  quality_score?: string;  // S/A/B/C/D
  bm_type?: string;        // Hardcore/Midcore/Casual/F2P_Cosmetic/Gacha
  regions?: string[];      // korea/japan/china/global/sea/na/sa/eu
}

// Result Types
export type ScenarioType = 'best' | 'normal' | 'worst';

export interface RetentionResult {
  coefficients: { a: number; b: number };
  target_d1: number;
  curve: number[];
}

export interface NRUResult {
  d1_nru: number;
  series: number[];
  total: number;
}

export interface DAUResult {
  series: number[];
  peak: number;
  average: number;
}

export interface RevenueResult {
  pr_series: number[];
  arppu_series: number[];
  daily_revenue: number[];
  total_gross: number;
  average_daily: number;
}

export interface FullData {
  nru: number[];
  dau: number[];
  revenue: number[];
  retention: number[];
  pr: number[];
  arppu: number[];
}

export interface ScenarioResult {
  retention: RetentionResult;
  nru: NRUResult;
  dau: DAUResult;
  revenue: RevenueResult;
  full_data: FullData;
}

export interface SummaryResult {
  gross_revenue: number;
  net_revenue: number;
  total_nru: number;
  peak_dau: number;
  average_dau: number;
  average_daily_revenue: number;
  // V8.5: ROAS 분리
  paid_roas?: number;      // UA 효율 (마케터용)
  blended_roas?: number;   // 전체 효율 (경영진용)
  ltv?: number;            // Life Time Value (유저당 평균 수익)
  cac_paid?: number;       // UA 기준 CAC
  cac_blended?: number;    // 전체 기준 CAC
  // Legacy
  cac?: number;            // 레거시 호환
  roas?: number;           // 레거시 호환
  break_even_day?: number; // 손익분기점 도달 일수
}

export interface ProjectionResult {
  status: string;
  input: {
    launch_date: string;
    projection_days: number;
    retention_games: string[];
    nru_games: string[];
    pr_games: string[];
    arppu_games: string[];
  };
  blending?: {
    weight_internal: number;
    weight_benchmark: number;
    time_decay?: boolean;  // V7
    genre: string;
    platforms: string[];
    benchmark_only: boolean;
    benchmark_data: {
      d1: number;
      d7: number;
      d30: number;
      d90: number;
      pr: number;
      arppu: number;
    };
  };
  v7_settings?: {  // V7
    quality_score: string;
    quality_multiplier: number;
    bm_type: string;
    bm_modifier: { pr_mod: number; arppu_mod: number };
    regions: string[];
    seasonality_applied: boolean;
  };
  v85_marketing?: {  // V8.5
    ua_budget: number;
    brand_budget: number;
    sustaining_budget_annual: number;
    total_marketing_budget: number;
    organic_boost_factor: number;
    budget_breakdown: {
      ua_ratio: number;
      brand_ratio: number;
      sustaining_ratio: number;
    };
    // V8.5+ 신규
    pre_launch_settings?: {
      pre_marketing_ratio: number;
      wishlist_conversion_rate: number;
      cpa_saturation_enabled: boolean;
      brand_time_lag_enabled: boolean;
    };
    nru_analysis?: {
      paid_nru: number;
      organic_nru: number;
      organic_boost_factor: number;
      total_nru: number;
      effective_cpa: number;
      cpa_saturation_factor: number;
      pre_launch_users: number;
      wishlist_users: number;
      d1_burst_users: number;
      brand_time_lag_peak_day: number;
    } | null;
  };
  summary: {
    best: SummaryResult;
    normal: SummaryResult;
    worst: SummaryResult;
  };
  results: {
    best: ScenarioResult;
    normal: ScenarioResult;
    worst: ScenarioResult;
  };
}

// UI Types
export type TabType = 'overview' | 'retention' | 'nru' | 'revenue' | 'projection-total' | 'projection-dau' | 'raw-data';

export interface GameListResponse {
  retention: string[];
  nru: string[];
  payment_rate: string[];
  arppu: string[];
}
