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
  // 런칭 MKT
  launch_mkt_best?: number;
  launch_mkt_normal?: number;
  launch_mkt_worst?: number;
  // CPI & UAC
  cpi?: number;
  uac?: number;
  // HR Cost (직접/간접 분리)
  hr_direct_headcount?: number;
  hr_indirect_monthly?: number;
  // 팀 구성
  dev_team_size?: number;
  ops_team_size?: number;
  qa_team_size?: number;
  biz_team_size?: number;
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

export interface ProjectionInput {
  launch_date: string;
  projection_days: number;
  retention: RetentionInput;
  nru: NRUInput;
  revenue: RevenueInput;
  basic_settings?: BasicSettings;
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
