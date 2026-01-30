import React, { useState, useEffect } from 'react';
import InputPanel from './components/InputPanel';
import ResultsPanel from './components/ResultsPanel';
import { TrendingUp, AlertCircle, RefreshCw, Sparkles } from 'lucide-react';
import type { ProjectionInput, GameListResponse } from './types';

// API Base URL
const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000';

// V10.0 초기 입력값
const INITIAL_INPUT: ProjectionInput = {
  launch_date: new Date().toISOString().slice(0, 10),
  projection_days: 365,
  region: 'Global',
  bm_type: 'Midcore',
  genre: 'RPG',
  platform: 'Mobile',
  // V10.0 Marketing
  marketing: {
    ua_budget: 1000000000,
    brand_budget: 200000000,
    target_cpa: 2500,
    base_organic_ratio: 0.2,
    pre_marketing_share: 0.1,
    wishlist_conversion_rate: 0.15,
    sustaining_cost_ratio: 0.07,
    paid_user_quality_ratio: 0.8,
  },
  // V10.0 Quality
  quality: {
    score: 'B',
    benchmark_weight: 0.5,
  },
  // V10.0 Revenue (any로 캐스팅하여 확장 필드 허용)
  revenue: {
    selected_games_pr: [],
    selected_games_arppu: [],
    pr_adjustment: { best_vs_normal: 0.05, worst_vs_normal: -0.05 },
    arppu_adjustment: { best_vs_normal: 0.10, worst_vs_normal: -0.10 },
    // V10.0 확장 필드
    package_price: 0,
    use_ad_revenue: false,
    ad_impressions_per_dau: 5,
    ad_ecpm: 5000,
  } as any,
  // Legacy fields for InputPanel compatibility
  retention: {
    selected_games: [],
    target_d1_retention: { best: 0.50, normal: 0.45, worst: 0.40 },
  },
  nru: {
    selected_games: [],
    d1_nru: { best: 440000, normal: 400000, worst: 360000 },
    paid_organic_ratio: 0.5,
    nvr: 0.7,
    adjustment: { best_vs_normal: 0.10, worst_vs_normal: -0.10 },
  },
  selected_games: [],
  live_events: [],
  basic_settings: {
    launch_date: new Date().toISOString().slice(0, 10),
    infrastructure_cost_ratio: 0.03,
    market_fee_ratio: 0.30,
    vat_ratio: 0.10,
    hr_cost_monthly: 20000000,
    sustaining_mkt_ratio: 0.07,
  },
};

function App() {
  // State
  const [games, setGames] = useState<GameListResponse | null>(null);
  const [input, setInput] = useState<ProjectionInput>(INITIAL_INPUT);
  const [results, setResults] = useState<any>(null);
  const [summary, setSummary] = useState<any>(null);
  const [aiReport, setAiReport] = useState<any>(null);
  
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // 초기 데이터 로드 (게임 목록)
  useEffect(() => {
    loadGames();
  }, []);

  const loadGames = async () => {
    setInitialLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/raw-data`);
      if (res.ok) {
        const data = await res.json();
        // GameListResponse 형태로 변환
        const gamesList: GameListResponse = {
          retention: Object.keys(data.games?.retention || {}),
          nru: Object.keys(data.games?.nru || {}),
          payment_rate: Object.keys(data.games?.payment_rate || {}),
          arppu: Object.keys(data.games?.arppu || {}),
        };
        setGames(gamesList);
      } else {
        // API 실패 시 빈 배열로 초기화
        setGames({
          retention: [],
          nru: [],
          payment_rate: [],
          arppu: [],
        });
      }
    } catch (e) {
      console.warn('Failed to load games:', e);
      // 에러 시에도 빈 배열로 초기화 (UI가 깨지지 않도록)
      setGames({
        retention: [],
        nru: [],
        payment_rate: [],
        arppu: [],
      });
    } finally {
      setInitialLoading(false);
    }
  };

  // 프로젝션 계산
  const calculateProjection = async () => {
    setLoading(true);
    setError(null);
    
    try {
      console.log('Calling API with input:', input);
      
      const res = await fetch(`${API_BASE}/api/projection`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });

      if (!res.ok) {
        throw new Error(`API Error: ${res.status} ${res.statusText}`);
      }
      
      const data = await res.json();
      console.log('API Response:', data);
      
      if (data.status === 'success') {
        setResults(data.results);
        setSummary(data.summary);
        
        // AI Insight 요청 (비동기)
        if (data.summary) {
          fetchAIInsight(data.summary);
        }
      } else {
        throw new Error('Projection calculation failed');
      }
    } catch (err: any) {
      console.error('Projection error:', err);
      setError(`계산 오류: ${err.message}. 백엔드 서버가 실행 중인지 확인해주세요.`);
    } finally {
      setLoading(false);
    }
  };

  // AI Insight 요청
  const fetchAIInsight = async (summaryData: any) => {
    try {
      const res = await fetch(`${API_BASE}/api/ai/insight`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projection_summary: summaryData,
          analysis_type: 'executive_report',
        }),
      });
      
      if (res.ok) {
        const aiData = await res.json();
        setAiReport(aiData.insight || aiData);
      }
    } catch (e) {
      console.warn('AI Insight failed (non-critical):', e);
      // AI 실패는 무시 (프로젝션 결과는 유지)
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b border-gray-200 sticky top-0 z-50">
        <div className="max-w-[1920px] mx-auto px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="bg-gradient-to-br from-blue-600 to-purple-600 text-white p-2 rounded-lg">
                <Sparkles className="w-6 h-6" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-gray-900">Game KPI Projection Engine</h1>
                <p className="text-xs text-gray-500">V10.0 · P0 Fixes · OpenAI GPT-4o</p>
              </div>
            </div>
            <button 
              onClick={loadGames}
              disabled={initialLoading}
              className="flex items-center gap-1 px-3 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <RefreshCw className={`w-4 h-4 ${initialLoading ? 'animate-spin' : ''}`} />
              새로고침
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-[1920px] mx-auto px-4 py-6">
        {/* Error Alert */}
        {error && (
          <div className="mb-6 bg-red-50 border-l-4 border-red-500 p-4 rounded-r shadow-sm flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <h3 className="text-sm font-bold text-red-800">오류 발생</h3>
              <p className="text-sm text-red-700">{error}</p>
            </div>
            <button 
              onClick={() => setError(null)}
              className="text-red-500 hover:text-red-700 font-bold"
            >
              ✕
            </button>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left: Input Panel (4 Columns) */}
          <div className="lg:col-span-4 space-y-6 print:hidden">
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
              <div className="p-4 bg-gradient-to-r from-blue-50 to-purple-50 border-b border-gray-100 flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-blue-600" />
                <h2 className="font-bold text-gray-800">시뮬레이션 설정</h2>
              </div>
              
              <div className="p-4">
                {initialLoading ? (
                  <div className="flex items-center justify-center py-12">
                    <RefreshCw className="w-8 h-8 text-blue-500 animate-spin" />
                    <span className="ml-2 text-gray-500">데이터 로딩 중...</span>
                  </div>
                ) : games ? (
                  <InputPanel 
                    games={games}
                    input={input}
                    setInput={setInput}
                  />
                ) : (
                  <div className="text-center py-12 text-gray-500">
                    데이터를 불러올 수 없습니다.
                  </div>
                )}
              </div>
              
              <div className="p-4 bg-gray-50 border-t border-gray-100">
                <button
                  onClick={calculateProjection}
                  disabled={loading || initialLoading}
                  className={`w-full py-3 px-4 rounded-xl font-bold text-white shadow-lg transition-all transform hover:scale-[1.02] active:scale-[0.98] ${
                    loading || initialLoading
                      ? 'bg-gray-400 cursor-not-allowed' 
                      : 'bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700'
                  }`}
                >
                  {loading ? (
                    <span className="flex items-center justify-center gap-2">
                      <RefreshCw className="w-5 h-5 animate-spin" />
                      분석 중...
                    </span>
                  ) : (
                    '🚀 KPI 프로젝션 실행'
                  )}
                </button>
              </div>
            </div>
          </div>

          {/* Right: Results Panel (8 Columns) */}
          <div className="lg:col-span-8">
            {results && summary ? (
              <ResultsPanel 
                results={results}
                summary={summary}
                aiReport={aiReport}
                inputData={input}
              />
            ) : (
              <div className="h-full min-h-[500px] flex flex-col items-center justify-center bg-white rounded-xl border-2 border-dashed border-gray-300">
                <div className="text-center">
                  <div className="inline-flex items-center justify-center w-16 h-16 bg-blue-100 rounded-full mb-4">
                    <Sparkles className="w-8 h-8 text-blue-600" />
                  </div>
                  <h3 className="text-xl font-semibold text-gray-800 mb-2">프로젝션을 시작하세요</h3>
                  <p className="text-gray-500 mb-6">
                    왼쪽 패널에서 설정을 조정한 후<br/>
                    "KPI 프로젝션 실행" 버튼을 클릭하세요.
                  </p>
                  <div className="flex flex-wrap justify-center gap-2 text-xs text-gray-400">
                    <span className="bg-green-100 text-green-700 px-2 py-1 rounded">✅ DAU D0 Fix</span>
                    <span className="bg-green-100 text-green-700 px-2 py-1 rounded">✅ Pre-launch CVR Fix</span>
                    <span className="bg-green-100 text-green-700 px-2 py-1 rounded">✅ Paid CAC Fix</span>
                    <span className="bg-green-100 text-green-700 px-2 py-1 rounded">✅ 365 Days</span>
                    <span className="bg-green-100 text-green-700 px-2 py-1 rounded">✅ BEP Calculation</span>
                    <span className="bg-green-100 text-green-700 px-2 py-1 rounded">✅ Excel Export</span>
                    <span className="bg-green-100 text-green-700 px-2 py-1 rounded">✅ GPT-4o AI</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="bg-white border-t border-gray-200 py-4 mt-8 print:hidden">
        <div className="max-w-[1920px] mx-auto px-4 text-center text-xs text-gray-400">
          Game KPI Projection Engine V10.0 · Built with FastAPI + React + OpenAI
        </div>
      </footer>
    </div>
  );
}

export default App;
