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
}

export interface ProjectionInput {
  launch_date: string;
  projection_days: number;
  retention: RetentionInput;
  nru: NRUInput;
  revenue: RevenueInput;
  basic_settings?: BasicSettings;
  blending?: BlendingSettings;  // 블렌딩 설정 추가
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
  // Phase 2: LTV & ROAS
  ltv?: number;           // Life Time Value (유저당 평균 수익)
  cac?: number;           // Customer Acquisition Cost
  roas?: number;          // Return On Ad Spend (%)
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
