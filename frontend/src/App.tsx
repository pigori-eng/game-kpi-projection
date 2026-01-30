import { useState, useEffect } from 'react';
import { 
  Play,
  Download,
  Settings,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  Sparkles,
} from 'lucide-react';
import InputPanel from './components/InputPanel';
import ResultsPanel from './components/ResultsPanel';
import type { ProjectionInput, GameListResponse } from './types';

// API Base URL
const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000';

function App() {
  // State
  const [games, setGames] = useState<GameListResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [calculating, setCalculating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  
  // V10.0 Results State
  const [results, setResults] = useState<any>(null);
  const [summary, setSummary] = useState<any>(null);
  const [aiReport, setAiReport] = useState<any>(null);
  const [meta, setMeta] = useState<any>(null);

  // V10.0 Input State
  const [input, setInput] = useState<ProjectionInput>({
    launch_date: '2026-11-12',
    projection_days: 365,
    region: 'Global',
    bm_type: 'Midcore',
    genre: 'RPG',
    platform: 'Mobile',
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
    quality: {
      score: 'B',
      benchmark_weight: 0.5,
    },
    selected_games: [],
    revenue: {
      selected_games_pr: [],
      selected_games_arppu: [],
      pr_adjustment: { best_vs_normal: 0.05, worst_vs_normal: -0.05 },
      arppu_adjustment: { best_vs_normal: 0.10, worst_vs_normal: -0.10 },
      // V10.0 fields (optional)
      package_price: 0,
      use_ad_revenue: false,
      ad_impressions_per_dau: 5,
      ad_ecpm: 5000,
    } as any,
    live_events: [],
    basic_settings: {
      launch_date: '2026-11-12',
      infrastructure_cost_ratio: 0.03,
      market_fee_ratio: 0.30,
      vat_ratio: 0.10,
      hr_cost_monthly: 20000000,
      sustaining_mkt_ratio: 0.07,
    },
    // Legacy fields for compatibility
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
  });

  // Load initial data
  useEffect(() => {
    loadInitialData();
  }, []);

  const loadInitialData = async () => {
    setLoading(true);
    try {
      const response = await fetch(`${API_BASE}/api/raw-data`);
      if (response.ok) {
        const data = await response.json();
        const gamesList = {
          retention: Object.keys(data.games?.retention || {}),
          nru: Object.keys(data.games?.nru || {}),
          payment_rate: Object.keys(data.games?.payment_rate || {}),
          arppu: Object.keys(data.games?.arppu || {}),
        };
        setGames(gamesList);
      }
    } catch (e) {
      console.error('Failed to load games:', e);
    } finally {
      setLoading(false);
    }
  };

  // Calculate Projection (V10.0 API)
  const handleCalculate = async () => {
    setCalculating(true);
    setError(null);
    setSuccess(null);
    setAiReport(null);
    
    try {
      // 1. Projection API 호출
      const response = await fetch(`${API_BASE}/api/projection`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });

      if (!response.ok) {
        throw new Error(`Projection failed: ${response.status}`);
      }

      const data = await response.json();
      
      if (data.status === 'success') {
        setResults(data.results);
        setSummary(data.summary);
        setMeta(data.meta);
        setSuccess('프로젝션 계산 완료!');
        
        // 2. AI Insight API 호출 (자동)
        fetchAIInsight(data.summary);
      } else {
        throw new Error('Projection calculation failed');
      }
    } catch (e: any) {
      setError(`계산 오류: ${e.message}`);
      console.error(e);
    } finally {
      setCalculating(false);
    }
  };

  // Fetch AI Insight
  const fetchAIInsight = async (projectionSummary: any) => {
    try {
      const response = await fetch(`${API_BASE}/api/ai/insight`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projection_summary: projectionSummary,
          analysis_type: 'executive_report',
        }),
      });

      if (response.ok) {
        const data = await response.json();
        setAiReport(data.insight);
      }
    } catch (e) {
      console.error('AI Insight failed:', e);
      // AI 실패해도 프로젝션 결과는 유지
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
            <div className="flex items-center gap-2">
              <button 
                onClick={loadInitialData}
                disabled={loading}
                className="flex items-center gap-1 px-3 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                새로고침
              </button>
              {results && (
                <button 
                  onClick={() => window.print()}
                  className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
                >
                  <Download className="w-4 h-4" />
                  PDF
                </button>
              )}
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-[1920px] mx-auto px-4 py-6">
        {/* Alerts */}
        {error && (
          <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 flex items-center gap-2">
            <AlertCircle className="w-5 h-5 flex-shrink-0" />
            <span>{error}</span>
            <button 
              onClick={() => setError(null)}
              className="ml-auto text-red-500 hover:text-red-700 font-bold"
            >
              ✕
            </button>
          </div>
        )}
        
        {success && (
          <div className="mb-4 p-4 bg-green-50 border border-green-200 rounded-lg text-green-700 flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 flex-shrink-0" />
            <span>{success}</span>
            <button 
              onClick={() => setSuccess(null)}
              className="ml-auto text-green-500 hover:text-green-700 font-bold"
            >
              ✕
            </button>
          </div>
        )}

        {/* Input Panel */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 mb-6 print:hidden">
          <div className="p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <Settings className="w-5 h-5 text-blue-600" />
              입력 설정
            </h2>
            
            {games && (
              <InputPanel 
                games={games}
                input={input}
                setInput={setInput}
              />
            )}

            <div className="mt-6 flex justify-center">
              <button
                onClick={handleCalculate}
                disabled={calculating}
                className="flex items-center gap-2 px-8 py-3 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-xl hover:from-blue-700 hover:to-purple-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed font-medium text-lg shadow-lg"
              >
                {calculating ? (
                  <>
                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                    계산 중...
                  </>
                ) : (
                  <>
                    <Play className="w-5 h-5" />
                    Calculate Projection
                  </>
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Results Panel (V10.0 Props) */}
        {results && summary && (
          <ResultsPanel 
            results={results}
            summary={summary}
            aiReport={aiReport}
            inputData={input}
          />
        )}

        {/* Empty State */}
        {!results && !calculating && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-12 text-center">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-blue-100 rounded-full mb-4">
              <Sparkles className="w-8 h-8 text-blue-600" />
            </div>
            <h3 className="text-xl font-semibold text-gray-800 mb-2">프로젝션을 시작하세요</h3>
            <p className="text-gray-500 mb-4">
              위의 설정을 조정한 후 "Calculate Projection" 버튼을 클릭하세요.
            </p>
            <div className="flex flex-wrap justify-center gap-2 text-xs text-gray-400">
              <span className="bg-gray-100 px-2 py-1 rounded">✅ DAU D0 Fix</span>
              <span className="bg-gray-100 px-2 py-1 rounded">✅ Pre-launch CVR Fix</span>
              <span className="bg-gray-100 px-2 py-1 rounded">✅ Paid CAC Fix</span>
              <span className="bg-gray-100 px-2 py-1 rounded">✅ 365 Days</span>
              <span className="bg-gray-100 px-2 py-1 rounded">✅ BEP Calculation</span>
              <span className="bg-gray-100 px-2 py-1 rounded">✅ Excel Export</span>
              <span className="bg-gray-100 px-2 py-1 rounded">✅ GPT-4o AI</span>
            </div>
          </div>
        )}
      </div>

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
